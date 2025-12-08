// backend/src/controllers/teacherController.ts

import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import { put } from "@vercel/blob";
import {
  Prisma,
  Day,
  LectureStatus,
  QuizStatus,
  StudentQuizStatus,
} from "@prisma/client";

// --- HELPER FUNCTION ---
const getTeacherAuth = async (req: Request) => {
  const userId = req.user?.id;
  const branchId = req.user?.branchId;
  if (!userId) {
    return { teacherId: null, userId: null, branchId: null };
  }
  // Find the linked Teacher profile using the User ID
  const teacher = await prisma.teacher.findUnique({
    where: { userId: userId },
    select: { id: true },
  });
  return {
    teacherId: teacher?.id || null, // This is the 'Teacher' table ID
    userId: userId, // This is the 'User' table ID
    branchId: branchId,
  };
};
const ACADEMIC_MONTH_NAMES = [
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "January",
  "February",
  "March",
];

const getAcademicMonthIndex = (date: Date): number => {
  const jsMonth = date.getMonth();
  return (jsMonth + 9) % 12;
};

// ============================================================================
// DASHBOARD
// ============================================================================

export const getTeacherDashboardData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Get Monday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Get Sunday

    const [
      weeklySchedule,
      assignmentsToReview,
      upcomingDeadlines,
      classPerformance,
      atRiskStudents,
      mentoredClass,
      pendingMeetingRequests,
      issuedBooks,
      allBranchClasses,
      allBranchSubjects,
      teacherAttendanceRects,
      syllabusRects,
      examMarkRects,
    ] = await prisma.$transaction([
      // 1. Weekly Schedule
      prisma.timetableSlot.findMany({
        where: { teacherId: teacherId, branchId: branchId },
        include: {
          class: { select: { gradeLevel: true, section: true } },
          subject: { select: { name: true } },
        },
      }),
      // 2. Assignments to Review
      prisma.assignmentSubmission.count({
        where: {
          assignment: { teacherId: teacherId },
          status: "Pending",
        },
      }),
      // 3. Upcoming Deadlines
      prisma.assignment.findMany({
        where: {
          teacherId: teacherId,
          dueDate: { gte: today },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      // 4. Class Performance (avg score in exams)
      prisma.examMark.groupBy({
        by: ["schoolClassId"],
        where: { teacherId: teacherId },
        _avg: { score: true },
        orderBy: {
          schoolClassId: "asc",
        },
      }),
      // 5. At-Risk Students (e.g., < 40% attendance)
      prisma.student.findMany({
        where: {
          branchId: branchId,
          attendanceRecords: {
            some: { status: "Absent" },
          },
        },
        select: { id: true, name: true },
        take: 5,
      }),
      // 6. Mentored Class
      prisma.schoolClass.findFirst({
        where: { mentorId: teacherId },
        select: { id: true, gradeLevel: true, section: true },
      }),
      // 7. Pending Meetings
      prisma.meetingRequest.count({
        where: { teacherId: teacherId, status: "pending" },
      }),
      // 8. Library Books
      prisma.bookIssuance.findMany({
        where: {
          teacherId: teacherId,
          returnedDate: null,
        },
        include: { book: { select: { title: true } } },
      }),
      // 9. All Classes (for schedule lookup)
      prisma.schoolClass.findMany({
        where: { branchId: branchId },
        select: { id: true, gradeLevel: true, section: true },
      }),
      // 10. All Subjects (for schedule lookup)
      prisma.subject.findMany({
        where: { branchId: branchId },
        select: { id: true, name: true },
      }),
      // 11. Count for attendance rectification requests
      prisma.teacherAttendanceRectificationRequest.count({
        where: { teacherId: teacherId, status: "Pending" },
      }),
      // 12. Count for syllabus change requests
      prisma.syllabusChangeRequest.count({
        where: { teacherId: teacherId, status: "Pending" },
      }),
      // 13. Count for exam mark rectification requests
      prisma.examMarkRectificationRequest.count({
        where: { teacherId: teacherId, status: "Pending" },
      }),
    ]);

    // Format Class Performance
    const classMap = new Map(
      allBranchClasses.map((c) => [c.id, `Grade ${c.gradeLevel}-${c.section}`])
    );

    // FIX: Cast 'cp' to 'any' to fix property access errors
    const formattedClassPerformance = classPerformance.map((cp: any) => ({
      className: classMap.get(cp.schoolClassId) || "Unknown Class",
      average: cp._avg?.score || 0,
    }));

    // Format At-Risk
    const formattedAtRisk = atRiskStudents.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      reason: "Low Attendance",
      value: "N/A",
    }));

    const rectificationRequestCount =
      teacherAttendanceRects + syllabusRects + examMarkRects;

    res.status(200).json({
      weeklySchedule,
      assignmentsToReview,
      upcomingDeadlines,
      classPerformance: formattedClassPerformance,
      atRiskStudents: formattedAtRisk,
      mentoredClass: mentoredClass
        ? {
            id: mentoredClass.id,
            name: `Grade ${mentoredClass.gradeLevel}-${mentoredClass.section}`,
            studentCount: 0,
          }
        : null,
      pendingMeetingRequests,
      library: {
        issuedBooks: issuedBooks.map((b) => ({
          ...b,
          bookTitle: b.book.title,
        })),
      },
      allBranchClasses,
      allBranchSubjects,
      subjectMarksTrend: [],
      rectificationRequestCount,
    });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// STUDENTS & CLASSES
// ============================================================================

export const getStudentsForTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const slots = await prisma.timetableSlot.findMany({
      where: { teacherId: teacherId },
      select: { classId: true },
      distinct: ["classId"],
    });
    const classIds = slots.map((s) => s.classId);

    const mentoredClass = await prisma.schoolClass.findFirst({
      where: { mentorId: teacherId },
      select: { id: true },
    });

    if (mentoredClass && !classIds.includes(mentoredClass.id)) {
      classIds.push(mentoredClass.id);
    }
    const students = await prisma.student.findMany({
      where: {
        branchId: branchId,
        classId: { in: classIds },
        status: "active",
      },
      include: {
        class: {
          select: {
            gradeLevel: true,
            section: true,
            mentorId: true, // Fetch mentor ID for comparison
          },
        },
        user: { select: { userId: true } },
      },
      orderBy: [{ class: { gradeLevel: "asc" } }, { name: "asc" }],
    });

    const studentsWithFlags = students.map((s: any) => ({
      ...s,
      isMentee: s.class?.mentorId === teacherId,
    }));

    res.status(200).json(studentsWithFlags);
  } catch (error: any) {
    next(error);
  }
};

export const getStudentProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const teacherId = (req as any).user?.id;
    const { studentId } = req.params;

    if (!teacherId) return res.status(401).json({ message: "Unauthorized." });

    // 1. Fetch Student Data (ACADEMIC ONLY - No Financials)
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: {
          select: {
            id: true,
            gradeLevel: true,
            section: true,
          },
        },
        room: { select: { roomNumber: true } },
        busStop: { select: { name: true } },
        parent: true,
        user: true,
        attendanceRecords: { orderBy: { date: "desc" }, take: 90 },
        grades: { include: { course: { select: { name: true } } } },
        skillAssessments: { orderBy: { assessedAt: "desc" }, take: 1 },
        submissions: {
          take: 5,
          orderBy: { submittedAt: "desc" },
          include: { assignment: { select: { title: true } } },
        },
        suspensionRecords: {
          where: { endDate: { gte: new Date() } },
          orderBy: { endDate: "desc" },
        },
        examMarks: {
          include: { examSchedule: { include: { subject: true } } },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    // 2. Ranking Logic
    let rankStats = { class: 0, school: 0 };
    if (student.class) {
      const gradePerformance = await prisma.examMark.groupBy({
        by: ["studentId"],
        where: {
          student: {
            branchId: student.branchId,
            gradeLevel: student.gradeLevel,
            status: "active",
          },
        },
        _sum: { score: true, totalMarks: true },
      });

      const peers = await prisma.student.findMany({
        where: {
          branchId: student.branchId,
          gradeLevel: student.gradeLevel,
          status: "active",
        },
        select: { id: true, classId: true },
      });

      const leaderboard = peers.map((peer) => {
        const stats = gradePerformance.find(
          (p: any) => p.studentId === peer.id
        ) as any;
        const totalScore = stats?._sum?.score || 0;
        const maxScore = stats?._sum?.totalMarks || 0;
        const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
        return { studentId: peer.id, classId: peer.classId, percentage };
      });

      leaderboard.sort((a, b) => b.percentage - a.percentage);

      const schoolRankIndex = leaderboard.findIndex(
        (p) => p.studentId === studentId
      );
      rankStats.school = schoolRankIndex !== -1 ? schoolRankIndex + 1 : 0;

      const classLeaderboard = leaderboard.filter(
        (p) => p.classId === student.classId
      );
      const classRankIndex = classLeaderboard.findIndex(
        (p) => p.studentId === studentId
      );
      rankStats.class = classRankIndex !== -1 ? classRankIndex + 1 : 0;
    }

    // 3. Formatting
    const s = student as any;

    const present = s.attendanceRecords.filter(
      (a: any) => a.status === "Present"
    ).length;
    const totalAttendance = s.attendanceRecords.length;

    const formattedGrades = s.grades.map((g: any) => ({
      ...g,
      courseName: g.course.name,
    }));
    const formattedSkills = (s.skillAssessments[0]?.skills as Record<
      string,
      number
    >)
      ? Object.entries(s.skillAssessments[0].skills).map(([k, v]) => ({
          skill: k,
          value: v,
        }))
      : [];

    const recentActivity = [
      ...s.attendanceRecords.slice(0, 3).map((a: any) => ({
        date: a.date.toISOString().split("T")[0],
        activity: `Marked ${a.status}`,
      })),
      ...s.submissions.map((sub: any) => ({
        date: sub.submittedAt.toISOString().split("T")[0],
        activity: `Submitted "${sub.assignment.title}"`,
      })),
    ].sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // 4. Construct Safe Response (No Fees, No Govt ID)
    const profile = {
      student: {
        ...s,
        userId: s.user?.userId || "N/A",
        passwordHash: undefined,
        governmentDocNumber: undefined,
        attendanceRecords: s.attendanceRecords,
        suspensionRecords: s.suspensionRecords,
        examMarks: s.examMarks,
        room: s.room,
        busStop: s.busStop,
      },
      userId: s.user?.userId || "N/A",
      studentUser: s.user,
      parent: s.parent ? { ...s.parent, passwordHash: undefined } : null,
      classInfo: s.class
        ? `Grade ${s.class.gradeLevel}-${s.class.section}`
        : "Unassigned",

      attendance: {
        present,
        absent: totalAttendance - present,
        total: totalAttendance,
      },
      attendanceHistory: s.attendanceRecords,

      grades: formattedGrades,
      skills: formattedSkills,
      recentActivity,
      rank: rankStats,
      activeSuspension: s.suspensionRecords[0] || null,
    };

    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
};

export const getStudentsForClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { branchId } = await getTeacherAuth(req);
    const { classId } = req.params;
    if (!branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const students = await prisma.student.findMany({
      where: { classId: classId, branchId: branchId },
      orderBy: { name: "asc" },
    });
    res.status(200).json(students);
  } catch (error: any) {
    next(error);
  }
};
export const updateStudentRollNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const teacherId = (req as any).user?.id;
    const { studentId } = req.params;
    const { rollNo } = req.body;

    if (!teacherId) return res.status(401).json({ message: "Unauthorized" });

    // 1. Fetch student and their class mentor
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });

    if (!student) return res.status(404).json({ message: "Student not found" });

    // 2. SECURITY CHECK: Is this teacher the mentor?
    if (student.class?.mentorId !== teacherId) {
      return res
        .status(403)
        .json({ message: "Only the Class Mentor can update Roll Numbers." });
    }

    // 3. Update
    await prisma.student.update({
      where: { id: studentId },
      data: { classRollNumber: rollNo },
    });

    res.status(200).json({ message: "Roll number updated successfully." });
  } catch (error) {
    next(error);
  }
};
// ============================================================================
// COURSES, SYLLABUS, CONTENT
// ============================================================================

export const getTeacherCourses = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1. Fetch unique Class+Subject pairs from the Timetable
    const teachingSlots = await prisma.timetableSlot.findMany({
      where: { teacherId: teacherId },
      distinct: ["classId", "subjectId"],
      select: {
        classId: true,
        subjectId: true,
        // We are fetching these relations, but TS needs a hint
        class: {
          select: { id: true, gradeLevel: true, section: true },
        },
        subject: {
          select: { id: true, name: true },
        },
      },
    });

    // 2. Format the response
    const formattedCourses = teachingSlots
      .filter((slot: any) => slot.class && slot.subject)
      .map((slot: any) => ({
        id: `${slot.class.id}|${slot.subject.id}`,

        classId: slot.class.id,
        subjectId: slot.subject.id,
        name: `${slot.subject.name} - Grade ${slot.class.gradeLevel}${slot.class.section}`,
      }));

    res.status(200).json(formattedCourses);
  } catch (error: any) {
    next(error);
  }
};

export const getCoursesByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { branchId } = await getTeacherAuth(req);
    if (!branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const courses = await prisma.course.findMany({
      where: { branchId: branchId },
      include: {
        subject: { select: { name: true } },
        schoolClass: { select: { gradeLevel: true, section: true } },
        teacher: { select: { name: true } },
      },
    });
    res.status(200).json(courses);
  } catch (error: any) {
    next(error);
  }
};

export const findCourseByTeacherAndSubject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    const { subjectId } = req.query;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const course = await prisma.course.findFirst({
      where: { teacherId: teacherId, subjectId: subjectId as string },
    });
    res.status(200).json(course);
  } catch (error: any) {
    next(error);
  }
};

export const getLectures = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { classId, subjectId } = req.query;
    if (!classId || !subjectId)
      return res.status(400).json({ message: "Missing params" });

    const lectures = await prisma.lecture.findMany({
      where: {
        classId: classId as string,
        subjectId: subjectId as string,
      },
      orderBy: { scheduledDate: "asc" },
    });
    res.status(200).json(lectures);
  } catch (error: any) {
    next(error);
  }
};

export const saveLectures = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { classId, subjectId, lectures, newLectures, deletedLectureIds } =
      req.body;

    const operations = [];

    // 1. Handle Updates
    if (lectures && Array.isArray(lectures)) {
      for (const lec of lectures) {
        if (lec.id) {
          operations.push(
            prisma.lecture.updateMany({
              where: {
                id: lec.id,
                teacherId: teacherId,
              },
              data: {
                topic: lec.topic,
                scheduledDate: new Date(lec.scheduledDate),
                // FIX: Cast string to Enum
                status: (lec.status as LectureStatus) || undefined,
              },
            })
          );
        }
      }
    }

    // 2. Handle Deletes
    if (
      deletedLectureIds &&
      Array.isArray(deletedLectureIds) &&
      deletedLectureIds.length > 0
    ) {
      operations.push(
        prisma.lecture.deleteMany({
          where: {
            id: { in: deletedLectureIds },
            teacherId: teacherId,
          },
        })
      );
    }

    // 3. Handle Creates
    if (newLectures && Array.isArray(newLectures) && newLectures.length > 0) {
      const createData = newLectures.map((l: any) => ({
        branchId,
        classId,
        subjectId,
        teacherId,
        topic: l.topic,
        scheduledDate: new Date(l.scheduledDate),
        status: "pending" as LectureStatus,
      }));

      operations.push(prisma.lecture.createMany({ data: createData }));
    }

    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }

    res.status(201).json({ message: "Lectures saved successfully." });
  } catch (error: any) {
    next(error);
  }
};

export const updateLectureStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { lectureId } = req.params;
    const { status } = req.body;

    const result = await prisma.lecture.updateMany({
      where: {
        id: lectureId,
        teacherId: teacherId,
      },
      data: { status: status },
    });

    if (result.count === 0) {
      return res.status(404).json({
        message:
          "Lecture not found or you do not have permission to update it.",
      });
    }

    res.status(200).json({ message: "Lecture status updated." });
  } catch (error: any) {
    next(error);
  }
};

export const getCourseContentForTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // --- IMPLEMENTATION ---
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { courseId } = req.query;
    if (!courseId) {
      return res
        .status(400)
        .json({ message: "courseId query param is required." });
    }

    const content = await prisma.courseContent.findMany({
      where: {
        teacherId: teacherId,
        courseId: courseId as string,
      },
      orderBy: { uploadedAt: "desc" },
    });
    res.status(200).json(content);
  } catch (error: any) {
    next(error);
  }
};

export const uploadCourseContent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // --- FIX ---
    // This is the implementation of the previously commented-out function.
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const { courseId, title, description } = req.body;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ message: "File is required." });
    }

    const blob = await put(
      `course-content/${courseId}/${file.originalname}-${Date.now()}`,
      file.buffer,
      {
        access: "public",
        contentType: file.mimetype,
      }
    );

    const newContent = await prisma.courseContent.create({
      data: {
        courseId,
        title,
        description,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileUrl: blob.url,
        branchId,
        teacherId, // Added teacherId
      },
    });

    res.status(201).json(newContent);
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// ATTENDANCE
// ============================================================================

export const getTeacherAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const attendance = await prisma.staffAttendanceRecord.findMany({
      where: { userId: userId },
      orderBy: { date: "desc" },
    });
    res.status(200).json(attendance);
  } catch (error: any) {
    next(error);
  }
};

export const getAttendanceForCourse = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { courseId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date query param is required." });
    }

    const targetDate = new Date(date as string);
    targetDate.setUTCHours(0, 0, 0, 0);

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { schoolClassId: true },
    });
    if (!course || !course.schoolClassId) {
      return res
        .status(404)
        .json({ message: "Course or associated class not found." });
    }

    const students = await prisma.student.findMany({
      where: { classId: course.schoolClassId },
      select: { id: true, name: true, classRollNumber: true },
      orderBy: [{ classRollNumber: "asc" }, { name: "asc" }],
    });

    const existingRecords = await prisma.attendanceRecord.findMany({
      where: { courseId: courseId, date: targetDate },
    });

    const isSaved = existingRecords.length > 0;
    const attendanceMap = new Map(existingRecords.map((r) => [r.studentId, r]));

    const attendanceList = students.map((student) => {
      const record = attendanceMap.get(student.id);
      return {
        id: record?.id || undefined,
        studentId: student.id,
        studentName: student.name,
        rollNumber: student.classRollNumber,
        courseId: courseId,
        classId: course.schoolClassId,
        date: targetDate,
        status: record?.status || "Present",
      };
    });

    res.status(200).json({ isSaved, attendance: attendanceList });
  } catch (error: any) {
    next(error);
  }
};

export const saveAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res
        .status(400)
        .json({ message: "No attendance records to save." });
    }

    const upsertOperations = records.map((record: any) =>
      prisma.attendanceRecord.upsert({
        where: { id: record.id || `temp-id-${Math.random()}` },
        update: { status: record.status },
        create: {
          studentId: record.studentId,
          courseId: record.courseId,
          classId: record.classId,
          date: new Date(record.date),
          status: record.status,
        },
      })
    );

    await prisma.$transaction(upsertOperations);
    res.status(200).json({ message: "Attendance saved successfully." });
  } catch (error: any) {
    next(error);
  }
};

export const getMentoredClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) return res.status(401).json({ message: "Unauthorized" });

    const mentoredClass = await prisma.schoolClass.findFirst({
      where: { mentorId: teacherId },
      select: { id: true, gradeLevel: true, section: true },
    });

    if (!mentoredClass) {
      return res
        .status(404)
        .json({ message: "You are not assigned as a Class Mentor." });
    }

    res.status(200).json(mentoredClass);
  } catch (error) {
    next(error);
  }
};


export const getDailyAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;

    if (!date) return res.status(400).json({ message: "Date required" });

    const targetDate = new Date(date as string);
    // Normalize date to UTC midnight to avoid timezone issues
    const startDate = new Date(
      Date.UTC(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate()
      )
    );
    const endDate = new Date(
      Date.UTC(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate() + 1
      )
    );

    // Fetch Students
    const students = await prisma.student.findMany({
      where: { classId, status: "active" },
      select: { id: true, name: true, classRollNumber: true },
      orderBy: { classRollNumber: "asc" }, // Sort by Roll No
    });

    // Fetch Existing Attendance
    const existingRecords = await prisma.attendanceRecord.findMany({
      where: {
        classId,
        date: { gte: startDate, lt: endDate }, // Range check for date
      },
    });

    const isSaved = existingRecords.length > 0;
    const recordMap = new Map(existingRecords.map((r) => [r.studentId, r]));

    const attendanceList = students.map((student) => {
      const record = recordMap.get(student.id);
      return {
        studentId: student.id,
        studentName: student.name,
        rollNumber: student.classRollNumber,
        status: record?.status || "Present", // Default to Present
        id: record?.id,
      };
    });

    res.status(200).json({ isSaved, attendance: attendanceList });
  } catch (error) {
    next(error);
  }
};

export const saveDailyAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { classId, date, records } = req.body;

    if (!records || !date)
      return res.status(400).json({ message: "Invalid data" });

    const targetDate = new Date(date);
    // Normalize to UTC Midnight to match DB query expectations
    const utcDate = new Date(
      Date.UTC(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate()
      )
    );

    // Use an interactive transaction to ensure data integrity
    await prisma.$transaction(async (tx) => {
      for (const r of records) {
        // 1. Check if a record already exists for this Student + Date + Class
        // We use findFirst because we don't have a unique constraint to use findUnique
        const existingRecord = await tx.attendanceRecord.findFirst({
          where: {
            studentId: r.studentId,
            date: utcDate,
            classId: classId,
          },
        });

        if (existingRecord) {
          // 2. If exists, UPDATE it
          // We use the ID found in the previous step
          await tx.attendanceRecord.update({
            where: { id: existingRecord.id },
            data: { status: r.status },
          });
        } else {
          // 3. If not exists, CREATE it
          // Note: We do NOT pass courseId here, because this is Class Attendance.
          // Ensure you made courseId optional in schema.prisma as instructed.
          await tx.attendanceRecord.create({
            data: {
              studentId: r.studentId,
              classId: classId,
              date: utcDate,
              status: r.status,
            },
          });
        }
      }
    });

    res.status(200).json({ message: "Attendance saved successfully." });
  } catch (error) {
    next(error);
  }
};


// ============================================================================
// ASSIGNMENTS, GRADEBOOK, QUIZZES
// ============================================================================

export const getAssignmentsByTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const assignments = await prisma.assignment.findMany({
      where: { teacherId: teacherId },
      orderBy: { dueDate: "desc" },
    });
    res.status(200).json(assignments);
  } catch (error: any) {
    next(error);
  }
};

export const createAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { title, dueDate } = req.body;
    const assignmentData = {
      ...req.body,
      title,
      dueDate: new Date(dueDate),
      teacherId: teacherId,
      branchId: branchId,
    };
    const newAssignment = await prisma.assignment.create({
      data: assignmentData,
    });
    res.status(201).json(newAssignment);
  } catch (error: any) {
    next(error);
  }
};

export const updateAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const data = { ...req.body };
    if (data.dueDate) {
      data.dueDate = new Date(data.dueDate);
    }

    const updatedAssignment = await prisma.assignment.updateMany({
      where: { id: req.params.assignmentId, teacherId: teacherId },
      data: data,
    });

    if (updatedAssignment.count === 0) {
      return res.status(404).json({
        message: "Assignment not found or you lack permission to update it.",
      });
    }

    res.status(200).json(updatedAssignment);
  } catch (error: any) {
    next(error);
  }
};


export const createMarkingTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { courseId, name, totalMarks, weightage } = req.body;

    const newTemplate = await prisma.markingTemplate.create({
      data: {
        teacherId,
        courseId,
        name,
        totalMarks: parseFloat(totalMarks),
        weightage: parseFloat(weightage),
      },
    });
    res.status(201).json(newTemplate);
  } catch (error: any) {
    next(error);
  }
};


export const getMarkingTemplatesForCourse = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { courseId } = req.params;

    const templates = await prisma.markingTemplate.findMany({
      where: {
        courseId: courseId,
        teacherId: teacherId, // Security check
      },
      orderBy: { name: "asc" },
    });
    res.status(200).json(templates);
  } catch (error: any) {
    next(error);
  }
};

export const getStudentMarksForTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { templateId } = req.params;

    // 1. Verify teacher owns template and get course/class info
    const template = await prisma.markingTemplate.findFirst({
      where: {
        id: templateId,
        teacherId: teacherId,
      },
      include: {
        course: {
          select: { schoolClassId: true },
        },
      },
    });

    if (!template || !template.course?.schoolClassId) {
      return res
        .status(404)
        .json({ message: "Template not found or class not associated." });
    }

    // 2. Get students in that class
    const students = await prisma.student.findMany({
      where: { classId: template.course.schoolClassId },
      select: { id: true, name: true, classRollNumber: true },
      orderBy: [{ classRollNumber: "asc" }, { name: "asc" }],
    });

    // 3. Get existing marks for this template
    const marks = await prisma.studentMark.findMany({
      where: { templateId: templateId },
    });
    const marksMap = new Map(marks.map((m) => [m.studentId, m]));

    // 4. Merge students with marks
    const studentMarks = students.map((student) => {
      const mark = marksMap.get(student.id);
      return {
        id: mark?.id || undefined,
        studentId: student.id,
        studentName: student.name,
        rollNumber: student.classRollNumber,
        templateId: templateId,
        marksObtained: mark?.marksObtained ?? null,
        totalMarks: template.totalMarks,
      };
    });

    res.status(200).json(studentMarks);
  } catch (error: any) {
    next(error);
  }
};

export const saveStudentMarks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { templateId, marks } = req.body as {
      templateId: string;
      marks: { studentId: string; marksObtained: number | null }[];
    };

    // Verify teacher owns the template
    const template = await prisma.markingTemplate.findFirst({
      where: { id: templateId, teacherId: teacherId },
      select: { id: true },
    });
    if (!template) {
      return res
        .status(403)
        .json({ message: "You do not have permission to edit this template." });
    }

    const upsertOps = marks
      .filter((m) => m.marksObtained !== null) // Don't save nulls
      .map((mark) => {
        const marksObtained = parseFloat(mark.marksObtained as any);
        return prisma.studentMark.upsert({
          where: {
            studentId_templateId: {
              studentId: mark.studentId,
              templateId: templateId,
            },
          },
          update: { marksObtained: marksObtained },
          create: {
            studentId: mark.studentId,
            templateId: templateId,
            marksObtained: marksObtained,
          },
        });
      });

    await prisma.$transaction(upsertOps);
    res.status(200).json({ message: "Marks saved successfully." });
  } catch (error: any) {
    next(error);
  }
};


export const deleteMarkingTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { templateId } = req.params;

    const result = await prisma.markingTemplate.deleteMany({
      where: {
        id: templateId,
        teacherId: teacherId, // Security check
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        message: "Template not found or you lack permission to delete it.",
      });
    }

    res.status(204).send();
  } catch (error: any) {
    next(error);
  }
};


export const getQuizzesForTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const quizzes = await prisma.quiz.findMany({
      where: { teacherId: teacherId },
      include: {
        class: { select: { gradeLevel: true, section: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(quizzes);
  } catch (error: any) {
    next(error);
  }
};


export const getQuizWithQuestions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { quizId } = req.params;

    const quiz = await prisma.quiz.findFirst({
      where: {
        id: quizId,
        teacherId: teacherId, // Security check
      },
      include: {
        questions: true,
      },
    });

    if (!quiz) {
      return res
        .status(404)
        .json({ message: "Quiz not found or you lack permission." });
    }
    res.status(200).json(quiz);
  } catch (error: any) {
    next(error);
  }
};


export const saveQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      id,
      title,
      classId,
      status,
      questionsPerStudent,
      questions, // Array of QuizQuestion
      deletedQuestionIds, // Array of question IDs to delete
    } = req.body;

    const quizData = {
      title,
      classId,
      status: status as QuizStatus,
      questionsPerStudent: parseInt(questionsPerStudent, 10),
      teacherId,
      branchId,
    };

    const savedQuiz = await prisma.$transaction(async (tx) => {
      // 1. Upsert the Quiz
      const quiz = await tx.quiz.upsert({
        where: { id: id || `new-quiz-${Math.random()}` },
        update: quizData,
        create: quizData,
      });

      // 2. Delete questions
      if (deletedQuestionIds && deletedQuestionIds.length > 0) {
        await tx.quizQuestion.deleteMany({
          where: {
            id: { in: deletedQuestionIds },
            quizId: quiz.id, // Security check
          },
        });
      }

      // 3. Upsert questions
      if (questions && questions.length > 0) {
        for (const q of questions) {
          const questionPayload = {
            quizId: quiz.id,
            questionText: q.questionText,
            options: q.options,
            correctOptionIndex: q.correctOptionIndex,
          };
          await tx.quizQuestion.upsert({
            where: { id: q.id || `new-question-${Math.random()}` },
            update: questionPayload,
            create: questionPayload,
          });
        }
      }

      return quiz;
    });

    res.status(201).json(savedQuiz);
  } catch (error: any) {
    next(error);
  }
};

export const updateQuizStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { quizId } = req.params;
    const { status } = req.body;

    const result = await prisma.quiz.updateMany({
      where: {
        id: quizId,
        teacherId: teacherId, // Security check
      },
      data: { status: status as QuizStatus },
    });

    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Quiz not found or you lack permission." });
    }
    res.status(200).json({ message: "Quiz status updated." });
  } catch (error: any) {
    next(error);
  }
};

export const getQuizResults = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { quizId } = req.params;

    // Verify teacher owns the quiz
    const quiz = await prisma.quiz.findFirst({
      where: { id: quizId, teacherId: teacherId },
      select: { id: true },
    });
    if (!quiz) {
      return res
        .status(403)
        .json({ message: "You do not have permission to view these results." });
    }

    // Get all student instances for this quiz
    const results = await prisma.studentQuiz.findMany({
      where: { quizId: quizId },
      include: {
        student: { select: { id: true, name: true } },
      },
      orderBy: { student: { name: "asc" } },
    });

    // Format to match QuizResult type
    const formattedResults = results.map((r) => ({
      studentId: r.student.id,
      studentName: r.student.name,
      status: r.status,
      score: r.score,
      submittedAt: r.submittedAt,
    }));

    res.status(200).json({ results: formattedResults });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// EXAMS & MARKS
// ============================================================================

export const getExaminations = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { branchId } = await getTeacherAuth(req);
    if (!branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const exams = await prisma.examination.findMany({
      where: { branchId },
      orderBy: { startDate: "desc" },
    });
    res.status(200).json(exams);
  } catch (error: any) {
    next(error);
  }
};

export const getHydratedExamSchedules = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    const { examinationId } = req.params;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const schedules = await prisma.examSchedule.findMany({
      where: {
        examinationId: examinationId,
        subject: { teacherId: teacherId },
      },
      include: {
        class: { select: { gradeLevel: true, section: true } },
        subject: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    });
    res.status(200).json(schedules);
  } catch (error: any) {
    next(error);
  }
};

export const getExamMarksForSchedule = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { scheduleId } = req.params;
    const { branchId, teacherId } = await getTeacherAuth(req);
    if (!branchId || !teacherId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Auth details not found." });
    }
    const schedule = await prisma.examSchedule.findFirst({
      where: {
        id: scheduleId,
        branchId: branchId,
        subject: { teacherId: teacherId },
      },
      select: {
        classId: true,
        totalMarks: true,
        examinationId: true,
        subjectId: true,
      },
    });

    if (!schedule || !schedule.classId)
      return res
        .status(404)
        .json({
          message: "Schedule not found or you do not teach this subject.",
        });

    const course = await prisma.course.findFirst({
      where: {
        teacherId: teacherId,
        subjectId: schedule.subjectId,
        schoolClassId: schedule.classId,
      },
      select: { id: true },
    });

    const students = await prisma.student.findMany({
      where: { classId: schedule.classId, branchId: branchId },
      select: { id: true, name: true, classRollNumber: true },
      orderBy: [{ classRollNumber: "asc" }, { name: "asc" }],
    });

    const marks = await prisma.examMark.findMany({
      where: { examScheduleId: scheduleId },
    });
    const marksMap = new Map(marks.map((m) => [m.studentId, m]));

    const studentMarks = students.map((student) => {
      const mark = marksMap.get(student.id);
      return {
        id: mark?.id || undefined,
        studentId: student.id,
        studentName: student.name,
        rollNumber: student.classRollNumber,
        score: mark?.score ?? null,
        totalMarks: schedule.totalMarks,
        examinationId: schedule.examinationId,
        examScheduleId: scheduleId,
        schoolClassId: schedule.classId,
        courseId: course?.id || null,
      };
    });

    res.status(200).json(studentMarks);
  } catch (error: any) {
    next(error);
  }
};

export const saveExamMarks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { marks } = req.body;
    if (!marks || !Array.isArray(marks)) {
      return res.status(400).json({ message: "Invalid marks data." });
    }

    const upsertOperations = marks
      .filter((mark: any) => mark.score !== null && mark.score !== undefined)
      .map((mark: any) =>
        prisma.examMark.upsert({
          where: { id: mark.id || `temp-id-${Math.random()}` },
          update: {
            score: Number(mark.score),
          },
          create: {
            branchId,
            examinationId: mark.examinationId,
            examScheduleId: mark.examScheduleId,
            studentId: mark.studentId,
            teacherId: teacherId,
            schoolClassId: mark.schoolClassId,
            courseId: mark.courseId,
            score: Number(mark.score),
            totalMarks: mark.totalMarks,
          },
        })
      );

    if (upsertOperations.length > 0) {
      await prisma.$transaction(upsertOperations);
    }
    res.status(201).json({ message: "Exam marks saved." });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// REQUESTS
// ============================================================================

export const submitRectificationRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    const { type, details, reason } = req.body;

    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // CASE 1: Student Attendance Correction
    if (type === "StudentAttendance") {
      // We must combine 'reason' and 'details' into the single 'description' field
      // and ensure we provide the mandatory 'studentId'
      const combinedDescription = `Reason: ${reason}. Change: ${details.from} -> ${details.to}. Date: ${details.date}`;

      await prisma.rectificationRequest.create({
        data: {
          branchId,
          teacherId: teacherId,
          studentId: details.studentId, // MANDATORY FIELD from schema
          requestType: "Attendance",
          description: combinedDescription, 
        },
      });
    }
    // CASE 2: Teacher Self-Attendance (Different Table)
    else if (type === "TeacherAttendance") {
      await prisma.teacherAttendanceRectificationRequest.create({
        data: {
          branchId,
          teacherId,
          teacherName: (req as any).user?.name || "Unknown",
          date: new Date(details.date),
          fromStatus: details.from,
          toStatus: details.to,
          reason: reason,
          status: "Pending",
        },
      });
    }
    // CASE 3: Other Requests
    else {

      if (!details.studentId) {
        return res
          .status(400)
          .json({ message: "Student ID is required for this request type." });
      }

      await prisma.rectificationRequest.create({
        data: {
          branchId,
          teacherId: teacherId,
          studentId: details.studentId,
          requestType: type, // FIX: mapped to 'requestType'
          description: `${reason} | ${JSON.stringify(details)}`, // FIX: mapped to 'description'
        },
      });
    }

    res.status(200).json({ message: "Request submitted successfully." });
  } catch (error: any) {
    next(error);
  }
};
export const submitSyllabusChangeRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { subjectId, description } = req.body;
    const requestData = {
      subjectId,
      description,
      teacherId: teacherId,
      branchId: branchId,
    };
    await prisma.syllabusChangeRequest.create({
      data: requestData,
    });
    res.status(201).json({ message: "Syllabus change request submitted." });
  } catch (error: any) {
    next(error);
  }
};

export const submitExamMarkRectificationRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { examMarkId, reason, newScore } = req.body;
    const requestData = {
      examMarkId,
      reason,
      newScore: Number(newScore),
      teacherId: teacherId,
      branchId,
    };
    await prisma.examMarkRectificationRequest.create({
      data: requestData,
    });
    res
      .status(201)
      .json({ message: "Exam mark rectification request submitted." });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// COMMUNICATION & GRIEVANCES
// ============================================================================

export const getMeetingRequestsForTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requests = await prisma.meetingRequest.findMany({
      where: { teacherId: teacherId },
      orderBy: { requestedAt: "desc" },
    });
    res.status(200).json(requests);
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
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { status } = req.body;
    const result = await prisma.meetingRequest.updateMany({
      where: {
        id: req.params.requestId,
        teacherId: teacherId,
      },
      data: { status },
    });

    if (result.count === 0) {
      return res.status(404).json({
        message: "Request not found or you lack permission to update it.",
      });
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
    const { teacherId, date } = req.query;

    if (!teacherId || !date) {
      return res
        .status(400)
        .json({ message: "Teacher ID and Date are required." });
    }

    // 1. Determine Day of Week
    const dateObj = new Date(date as string);
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    // logic: getDay() returns 0 for Sunday, 1 for Monday, etc.
    const dayNameStr = days[dateObj.getDay()];

    // 2. Fetch the Teacher's specific schedule for this day
    const teacherSlots = await prisma.timetableSlot.findMany({
      where: {
        teacherId: String(teacherId),
        day: dayNameStr as Day,
      },
      orderBy: { startTime: "asc" },
      select: { startTime: true, endTime: true },
    });

    if (teacherSlots.length === 0) {
      return res.status(200).json([]);
    }

    // 3. Determine the "Last Class" end time
    const lastClassEnd = teacherSlots.reduce(
      (max, slot) => (slot.endTime > max ? slot.endTime : max),
      "00:00"
    );

    // 4. Fetch the "Master Schedule" for the Branch
    const teacherProfile = await prisma.teacher.findUnique({
      where: { id: String(teacherId) },
      select: { branchId: true },
    });

    if (!teacherProfile) {
      return res.status(404).json({ message: "Teacher not found." });
    }

    const allBranchSlots = await prisma.timetableSlot.findMany({
      where: {
        branchId: teacherProfile.branchId,
        day: dayNameStr as Day,
      },
      distinct: ["startTime"],
      orderBy: { startTime: "asc" },
      select: { startTime: true },
    });

    // 5. Calculate Free Slots
    const bookedStartTimes = new Set(teacherSlots.map((s) => s.startTime));

    const freeSlots = allBranchSlots
      .filter((slot) => {
        const isBeforeLastClass = slot.startTime < lastClassEnd;
        const isNotBooked = !bookedStartTimes.has(slot.startTime);
        return isBeforeLastClass && isNotBooked;
      })
      .map((slot) => slot.startTime);

    res.status(200).json(freeSlots);
  } catch (error: any) {
    next(error);
  }
};

export const raiseComplaintAboutStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, branchId } = await getTeacherAuth(req);
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { studentId, complaintText } = req.body;
    const complaintData = {
      studentId,
      complaintText,
      raisedById: userId,
      raisedByName: req.user?.name || "Teacher",
      raisedByRole: "Teacher",
      branchId: branchId,
    };
    await prisma.complaint.create({
      data: complaintData as any,
    });
    res.status(201).json({ message: "Complaint submitted." });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// STUDENT SKILLS
// ============================================================================

// --- IMPLEMENTATION ---
export const getTeacherSkillAssessmentForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { studentId } = req.params;

    // Find the most recent assessment by this teacher for this student
    const assessment = await prisma.skillAssessment.findFirst({
      where: {
        teacherId: teacherId,
        studentId: studentId,
      },
      orderBy: { assessedAt: "desc" },
    });
    res.status(200).json(assessment);
  } catch (error: any) {
    next(error);
  }
};

// --- IMPLEMENTATION ---
export const submitSkillAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { studentId, skills } = req.body; // skills is a JSON object

    // Create a new assessment.
    // We don't upsert because assessments are point-in-time.
    const newAssessment = await prisma.skillAssessment.create({
      data: {
        teacherId,
        studentId,
        skills, // Prisma handles the JSON
      },
    });
    res.status(201).json({ message: "Skill assessment submitted." });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// LEAVES
// ============================================================================

export const getLeaveApplicationsForUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const applications = await prisma.leaveApplication.findMany({
      where: { applicantId: userId },
      orderBy: { fromDate: "desc" },
    });
    res.status(200).json(applications);
  } catch (error: any) {
    next(error);
  }
};

export const getLeaveApplicationsForTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, branchId } = await getTeacherAuth(req);
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const mentoredClasses = await prisma.schoolClass.findMany({
      where: { mentorId: teacherId },
      select: { id: true },
    });
    const classIds = mentoredClasses.map((c) => c.id);

    if (classIds.length === 0) {
      return res.status(200).json([]);
    }

    const applications = await prisma.leaveApplication.findMany({
      where: {
        applicant: {
          role: "Student",
          studentProfile: {
            classId: { in: classIds },
          },
        },
      },
      include: {
        applicant: {
          select: {
            name: true,
            studentProfile: {
              select: {
                class: { select: { gradeLevel: true, section: true } },
              },
            },
          },
        },
      },
      orderBy: { fromDate: "desc" },
    });
    res.status(200).json(applications);
  } catch (error: any) {
    next(error);
  }
};

export const processLeaveApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { status } = req.body;
    const { requestId } = req.params;

    const application = await prisma.leaveApplication.findUnique({
      where: { id: requestId },
      include: {
        applicant: {
          include: { studentProfile: { select: { classId: true } } },
        },
      },
    });

    if (!application?.applicant?.studentProfile?.classId) {
      return res
        .status(4404)
        .json({ message: "Application not found or not for a student." });
    }

    const studentClass = await prisma.schoolClass.findUnique({
      where: { id: application.applicant.studentProfile.classId },
      select: { mentorId: true },
    });

    if (studentClass?.mentorId !== teacherId) {
      return res
        .status(403)
        .json({ message: "You are not the mentor for this student." });
    }

    await prisma.leaveApplication.update({
      where: { id: requestId },
      data: { status },
    });
    res.status(200).json({ message: "Leave application processed." });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// UTILITY
// ============================================================================

export const searchLibraryBooks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { branchId } = await getTeacherAuth(req);
    if (!branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ message: "Search query 'q' is required." });
    }

    const books = await prisma.libraryBook.findMany({
      where: {
        branchId: branchId,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { author: { contains: q, mode: "insensitive" } },
          { isbn: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 20,
    });
    res.status(200).json(books);
  } catch (error: any) {
    next(error);
  }
};

export const getMyTransportDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, branchId } = await getTeacherAuth(req);
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: userId },
      select: { transportRouteId: true, busStopId: true },
    });

    if (!teacher || !teacher.transportRouteId || !teacher.busStopId) {
      return res.status(200).json(null);
    }

    const [route, stop] = await prisma.$transaction([
      prisma.transportRoute.findUnique({
        where: { id: teacher.transportRouteId },
      }),
      prisma.busStop.findUnique({ where: { id: teacher.busStopId } }),
    ]);

    res.status(200).json({ route, stop });
  } catch (error: any) {
    next(error);
  }
};
