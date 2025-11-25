import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import { FeeAdjustment, FeePayment, Prisma } from "@prisma/client";


type ParentAuthResult = {
  parentId: string | null;
  childrenIds: string[];
  branchId: string | null;
};

const getParentAuth = async (req: Request): Promise<ParentAuthResult> => {
  const userId = req.user?.id;
  if (!userId) {
    return { parentId: null, childrenIds: [], branchId: null };
  }

  const parent = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      children: {
        select: { id: true, branchId: true },
      },
    },
  });

  if (!parent || parent.children.length === 0) {
    return { parentId: userId, childrenIds: [], branchId: null };
  }

  return {
    parentId: userId,
    childrenIds: parent.children.map((child) => child.id), 
    branchId: parent.children[0].branchId,
  };
};


export const getParentDashboardData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds, branchId } = await getParentAuth(req);
    if (!parentId || childrenIds.length === 0 || !branchId) {
      return res.status(401).json({
        message: "Unauthorized or no children found for this account.",
      });
    }

    const childrenData: any[] = [];

    for (const studentId of childrenIds) {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          name: true,
          classId: true,
          profilePictureUrl: true,
          classRollNumber: true,
        },
      });
      if (!student || !student.classId) {
        console.warn(`Skipping child ${studentId}: no classId found.`);
        continue;
      }
      const classId = student.classId;

      const [
        branch,
        classInfo,
        feeRecord,
        attendanceHistory,
        assignments,
        examMarks,
      ] = await prisma.$transaction([
        prisma.branch.findUnique({ where: { id: branchId } }),
        prisma.schoolClass.findUnique({
          where: { id: classId },
          include: {
            mentor: { select: { name: true, email: true, phone: true } },
          },
        }),
        prisma.feeRecord.findFirst({
          where: { studentId: studentId },
          include: { payments: true },
        }),
        prisma.attendanceRecord.findMany({
          where: { studentId: studentId },
          orderBy: { date: "desc" },
        }),
        prisma.assignment.findMany({
          where: { teacher: { courses: { some: { schoolClassId: classId } } } },
          include: {
            submissions: { where: { studentId: studentId } },
            teacher: { select: { name: true } },
          },
          orderBy: { dueDate: "desc" },
        }),
        prisma.examMark.findMany({
          where: { studentId: studentId },
          include: {
            Course: { include: { subject: { select: { name: true } } } },
            examination: { select: { name: true } },
          },
        }),
      ]);

      if (!branch || !classInfo) continue;

      const profile = {
        id: student.id,
        name: student.name,
        class: `Grade ${classInfo.gradeLevel}-${classInfo.section}`,
        mentor: classInfo.mentor || {
          name: "Not Assigned",
          email: null,
          phone: null,
        },
      };

      const performance = examMarks.map((mark) => ({
        subject: mark.Course?.subject?.name || mark.examination.name,
        score: (mark.score / mark.totalMarks) * 100,
        classAverage: 0,
      }));
      const totalScore = performance.reduce((acc, p) => acc + p.score, 0);
      const overallMarksPercentage = performance.length
        ? totalScore / performance.length
        : 0;

      const present = attendanceHistory.filter(
        (a) => a.status === "Present"
      ).length;
      const totalDays = attendanceHistory.length;
      const attendance = {
        sessionPercentage: totalDays ? (present / totalDays) * 100 : 100,
        history: attendanceHistory,
      };

      const totalPaid =
        feeRecord?.payments.reduce((acc, p) => acc + p.amount, 0) || 0;
      const fees = {
        totalOutstanding: (feeRecord?.totalAmount || 0) - totalPaid,
        dueDate: feeRecord?.dueDate.toISOString() || "",
        totalAnnualFee: feeRecord?.totalAmount || 0,
        totalPaid: totalPaid,
        previousSessionDues: feeRecord?.previousSessionDues || 0,
        monthlyDues: [],
      };

      const pendingAssignments = assignments
        .filter((a) => a.submissions.length === 0)
        .map((a) => ({ ...a, courseName: "" }));
      childrenData.push({
        student: {
          ...student,
          gradeLevel: classInfo.gradeLevel,
          parentId: parentId,
        },
        branch,
        branchId,
        profile,
        performance,
        ranks: { class: 0, school: 0 },
        attendance,
        fees,
        feeHistory: [],
        assignments: pendingAssignments,
        timetable: [],
        timetableConfig: null,
        examSchedule: [],
        overallMarksPercentage,
        skills: [],
        selfStudyProgress: {
          totalLectures: 0,
          studentCompletedLectures: 0,
          teacherCompletedLectures: 0,
        },
      });
    }

    const announcements = await prisma.announcement.findMany({
      where: { branchId: branchId, audience: { in: ["All", "Parents"] } },
      orderBy: { sentAt: "desc" },
      take: 5,
    });

    res.status(200).json({ childrenData, announcements });
  } catch (error: any) {
    next(error);
  }
};

export const getStudentProfileDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds } = await getParentAuth(req);
    const { id: studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({ message: "Student ID is required." });
    }

    if (!parentId || !childrenIds.includes(studentId)) {
      return res.status(403).json({
        message: "You are not authorized to view this student's profile.",
      });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: { select: { gradeLevel: true, section: true } },
        parent: true,
        FeeAdjustment: true,
        feeRecords: { include: { payments: true } },
        attendanceRecords: true,
        grades: { include: { course: { select: { name: true } } } },
        skillAssessments: true,
      },
    });
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }
    const {
      FeeAdjustment,
      feeRecords,
      attendanceRecords,
      grades,
      skillAssessments,
      ...studentData
    } = student;
    const feeRecord = feeRecords[0];
    const totalPaid =
      feeRecord?.payments.reduce((acc, p) => acc + p.amount, 0) || 0;
    const present = attendanceRecords.filter(
      (a) => a.status === "Present"
    ).length;
    const totalDays = attendanceRecords.length;

    const feeHistory: (FeePayment | FeeAdjustment)[] = [
      ...(feeRecord?.payments || []),
      ...(FeeAdjustment || []),
    ];
    const getDate = (item: FeePayment | FeeAdjustment): Date => {
      if ((item as FeePayment).paidDate) {
        return (item as FeePayment).paidDate;
      }
      return (item as FeeAdjustment).date;
    };
    feeHistory.sort(
      (a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime()
    );
    const profile = {
      student: studentData,
      grades: grades.map((g) => ({ ...g, courseName: g.course.name })),
      parent: student.parent,
      attendance: { present, absent: totalDays - present, total: totalDays },
      attendanceHistory: attendanceRecords,
      classInfo: `Grade ${student.class?.gradeLevel}-${student.class?.section}`,
      feeStatus: {
        total: feeRecord?.totalAmount || 0,
        paid: totalPaid,
        dueDate: feeRecord?.dueDate,
      },
      feeHistory,
      rank: { class: 0, school: 0 },
      skills: [],
      recentActivity: [],
    };

    res.status(200).json(profile);
  } catch (error: any) {
    next(error);
  }
};

export const getComplaintsAboutStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds } = await getParentAuth(req);
    const { id: studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({ message: "Student ID is required." });
    }
    if (!parentId || !childrenIds.includes(studentId)) {
      return res.status(403).json({ message: "Unauthorized." });
    }

    const complaints = await prisma.complaint.findMany({
      where: { studentId: studentId },
      orderBy: { submittedAt: "desc" },
    });

    res.status(200).json(complaints);
  } catch (error: any) {
    next(error);
  }
};

export const getFeeHistoryForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds } = await getParentAuth(req);
    const { id: studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({ message: "Student ID is required." });
    }


    if (!parentId || !childrenIds.includes(studentId)) {
      return res.status(403).json({ message: "Unauthorized." });
    }

    const [payments, adjustments] = await prisma.$transaction([
      prisma.feePayment.findMany({ where: { studentId: studentId } }),
      prisma.feeAdjustment.findMany({ where: { studentId: studentId } }),
    ]);

    const feeHistory: (FeePayment | FeeAdjustment)[] = [
      ...payments,
      ...adjustments,
    ];

    const getDate = (item: FeePayment | FeeAdjustment): Date => {
      if ((item as FeePayment).paidDate) {
        return (item as FeePayment).paidDate;
      }
      return (item as FeeAdjustment).date;
    };
    feeHistory.sort(
      (a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime()
    );

    res.status(200).json(feeHistory);
  } catch (error: any) {
    next(error);
  }
};

export const getTeachersForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds } = await getParentAuth(req);
    const { id: studentId } = req.params;

    if (!studentId || typeof studentId !== "string") {
      return res.status(400).json({ message: "Student ID is required." });
    }

    if (!parentId || !childrenIds.includes(studentId)) {
      return res.status(403).json({ message: "Unauthorized." });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { classId: true },
    });

    if (!student || !student.classId) {
      return res
        .status(404)
        .json({ message: "Student not assigned to a class." });
    }

    const classId = student.classId;
    const teachers = await prisma.teacher.findMany({
      where: {
        OR: [
          // 1. Teachers teaching a Course in this class
          {
            courses: {
              some: { schoolClassId: classId },
            },
          },
          // 2. The Mentor of this class
          {
            schoolClasses: {
              some: { id: classId },
            },
          },
          // 3. Teachers in the timetable (fallback)
          {
            timetableSlots: {
              some: { classId: classId },
            },
          },
        ],
      },
      orderBy: { name: "asc" },
      distinct: ["id"],
    });

    res.status(200).json(teachers);
  } catch (error: any) {
    next(error);
  }
};

export const getStudentGrades = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds } = await getParentAuth(req);
    const { id: studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({ message: "Student ID is required." });
    }

    if (!parentId || !childrenIds.includes(studentId)) {
      return res.status(403).json({ message: "Unauthorized." });
    }

    const grades = await prisma.grade.findMany({
      where: { studentId: studentId },
      include: { course: { select: { name: true } } },
    });

    const gradesWithCourse = grades.map((g) => ({
      ...g,
      courseName: g.course.name,
    }));

    res.status(200).json(gradesWithCourse);
  } catch (error: any) {
    next(error);
  }
};

export const getFeeRecordForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds } = await getParentAuth(req);
    const { id: studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({ message: "Student ID is required." });
    }
    if (!parentId || !childrenIds.includes(studentId)) {
      return res.status(403).json({ message: "Unauthorized." });
    }

    const record = await prisma.feeRecord.findFirst({
      where: { studentId: studentId },
      include: { payments: true },
    });

    res.status(200).json(record);
  } catch (error: any) {
    next(error);
  }
};

export const getMeetingRequestsForParent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId } = await getParentAuth(req);
    if (!parentId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const requests = await prisma.meetingRequest.findMany({
      where: { parentId: parentId },
      include: {
        teacher: { select: { name: true } },
        student: { select: { name: true } },
      },
      orderBy: { requestedAt: "desc" },
    });

    const hydratedRequests = requests.map((r) => ({
      ...r,
      parentName: req.user?.name || "Parent",
      teacherName: r.teacher.name,
      studentName: r.student.name,
    }));

    res.status(200).json(hydratedRequests);
  } catch (error: any) {
    next(error);
  }
};

export const createMeetingRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds, branchId } = await getParentAuth(req);
    const { teacherId, studentId, requestedDateTime, agenda } = req.body;

    if (!studentId || typeof studentId !== "string") {
      return res
        .status(400)
        .json({ message: "A valid studentId is required." });
    }
    if (!parentId || !childrenIds.includes(studentId)) {
      return res.status(403).json({ message: "Unauthorized." });
    }

    const newRequest = await prisma.meetingRequest.create({
      data: {
        parentId,
        teacherId,
        studentId,
        requestedAt: new Date(requestedDateTime),
        agenda: agenda || null,
        status: "pending",
        branchId: branchId,
      },
    });

    res.status(201).json(newRequest);
  } catch (error: any) {
    next(error);
  }
};

export const updateMeetingRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId } = await getParentAuth(req);
    const { id: requestId } = req.params;
    const { status } = req.body;

    if (!requestId || typeof requestId !== "string") {
      return res.status(400).json({ message: "Request ID is required." });
    }

    if (!parentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (status !== "canceled") {
      return res
        .status(403)
        .json({ message: "Parents can only cancel requests." });
    }

    const result = await prisma.meetingRequest.updateMany({
      where: {
        id: requestId,
        parentId: parentId,
      },
      data: { status: "canceled" },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Request not found." });
    }

    res.status(200).json({ message: "Meeting request updated." });
  } catch (error: any) {
    next(error);
  }
};

export const getTeacherAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = req.params;
    const { date } = req.query;
    res.status(200).json(["09:00", "10:00", "14:00"]);
  } catch (error: any) {
    next(error);
  }
};

export const recordFeePayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId, amount, transactionId, details } = req.body;

    if (!studentId || typeof studentId !== "string") {
      return res
        .status(400)
        .json({ message: "A valid studentId is required." });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { feeRecords: { orderBy: { dueDate: "asc" }, take: 1 } },
    });

    if (!student || !student.feeRecords.length) {
      return res
        .status(404)
        .json({ message: "No fee record found for student." });
    }
    const feeRecordId = student.feeRecords[0].id;

    await prisma.$transaction([
      prisma.feePayment.create({
        data: {
          studentId,
          feeRecordId,
          amount: parseFloat(amount),
          paidDate: new Date(),
          transactionId,
          details: details || "Online Payment",
        },
      }),
      prisma.feeRecord.update({
        where: { id: feeRecordId },
        data: { paidAmount: { increment: parseFloat(amount) } },
      }),
    ]);

    res.status(200).json({ message: "Payment recorded successfully." });
  } catch (error: any) {
    next(error);
  }
};

export const payStudentFees = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parentId, childrenIds } = await getParentAuth(req);
    const { studentId, amount, details } = req.body;

    if (!studentId || typeof studentId !== "string") {
      return res
        .status(400)
        .json({ message: "A valid studentId is required." });
    }
    if (!parentId || !childrenIds.includes(studentId)) {
      return res.status(403).json({ message: "Unauthorized." });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { feeRecords: { orderBy: { dueDate: "asc" }, take: 1 } },
    });

    if (!student || !student.feeRecords.length) {
      return res.status(404).json({ message: "No fee record found." });
    }
    const feeRecordId = student.feeRecords[0].id;

    await prisma.$transaction([
      prisma.feePayment.create({
        data: {
          studentId,
          feeRecordId,
          amount: parseFloat(amount),
          paidDate: new Date(),
          transactionId: `MANUAL_PARENT_${Date.now()}`,
          details: details || "Manual Payment by Parent",
        },
      }),
      prisma.feeRecord.update({
        where: { id: feeRecordId },
        data: { paidAmount: { increment: parseFloat(amount) } },
      }),
    ]);
    res.status(200).json({ message: "Fee payment recorded." });
  } catch (error: any) {
    next(error);
  }
};

export const getSchoolEventsForParent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { branchId } = req.params;
    const { parentId } = await getParentAuth(req);

    if (!branchId || typeof branchId !== "string") {
      return res.status(400).json({ message: "Branch ID is required." });
    }

    if (!parentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const child = await prisma.student.findFirst({
      where: {
        parentId: parentId,
        branchId: branchId,
      },
    });

    if (!child) {
      return res.status(403).json({
        message: "You are not authorized to view events for this branch.",
      });
    }

    const events = await prisma.schoolEvent.findMany({
      where: {
        branchId: branchId,
        status: "Approved",
        audience: { hasSome: ["All", "Parents"] },
      },
      orderBy: { date: "asc" },
    });

    res.status(200).json(events);
  } catch (error: any) {
    next(error);
  }
};
