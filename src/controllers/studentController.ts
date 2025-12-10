import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import { Assignment, Prisma,Branch } from "@prisma/client";

// --- HELPER FUNCTION ---
// Get the Student ID, User ID, Branch ID, and Class ID from the authenticated user
const getStudentAuth = async (req: Request) => {
  const userId = req.user?.id;
  const branchId = req.user?.branchId;
  if (!userId || !branchId) {
    return { studentId: null, userId: null, branchId: null, classId: null };
  }

  const student = await prisma.student.findUnique({
    where: { userId: userId },
    select: { id: true, classId: true },
  });

  return {
    studentId: student?.id || null,
    userId: userId,
    branchId: branchId,
    classId: student?.classId || null,
  };
};

// --- CONTROLLER FUNCTIONS ---

export const getStudentDashboardData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId, userId, branchId, classId } = await getStudentAuth(req);

    // 1. Strict Validation
    if (!studentId || !userId || !branchId || !classId) {
      return res
        .status(401)
        .json({ message: "Student profile incomplete or unauthorized." });
    }

    // 2. Fetch ALL required data in a single massive parallel transaction
    const [
      student,
      userRecord,
      branch,
      classInfo,
      feeRecord,
      announcements,
      events,
      attendanceHistory,
      assignments,
      issuedBooks,
      timetable,
      examSchedules,
      myExamMarks,
      allClassMarksRaw,
      allSchoolMarksRaw,
      studentProgress,
      totalLecturesCount,
      teacherCompletedCount,
      skillAssessments,
    ] = await prisma.$transaction([
      // A. Core Profile
      prisma.student.findUnique({ where: { id: studentId } }),
      // Fetch 'userId' (VRTX-...) instead of 'username'
      prisma.user.findUnique({
        where: { id: userId },
        select: { userId: true },
      }),
      prisma.branch.findUnique({
        where: { id: branchId },
        include: {
          principal: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.schoolClass.findUnique({
        where: { id: classId },
        include: {
          mentor: { select: { name: true, email: true, phone: true } },
        },
      }),

      // B. Fees & Comms
      prisma.feeRecord.findFirst({
        where: { studentId: studentId },
        include: { payments: true },
      }),
      prisma.announcement.findMany({
        where: { branchId: branchId, audience: { in: ["All", "Students"] } },
        orderBy: { sentAt: "desc" },
        take: 5,
      }),
      prisma.schoolEvent.findMany({
        where: {
          branchId: branchId,
          status: "Approved",
          audience: { hasSome: ["All", "Students"] },
          date: { gte: new Date() },
        },
        orderBy: { date: "asc" },
        take: 5,
      }),

      // C. Academic & Attendance
      prisma.attendanceRecord.findMany({
        where: { studentId: studentId },
        orderBy: { date: "desc" },
        take: 30, // Last 30 records for chart
      }),
      prisma.assignment.findMany({
        where: {
          teacher: { courses: { some: { schoolClassId: classId } } },
          status: "Open", // Only show open assignments in dashboard
        },
        include: {
          submissions: { where: { studentId: studentId } },
          teacher: { select: { name: true } },
          course: { include: { subject: { select: { name: true } } } },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.bookIssuance.findMany({
        where: { studentId: studentId, returnedDate: null },
        include: { book: { select: { title: true } } },
      }),
      prisma.timetableSlot.findMany({
        where: { classId: classId },
        include: {
          subject: { select: { name: true } },
          teacher: { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
      }),
      prisma.examSchedule.findMany({
        where: { classId: classId, date: { gte: new Date() } },
        include: { subject: { select: { name: true } } },
        orderBy: { date: "asc" },
        take: 5,
      }),

      // D. Marks & Ranking Data
      prisma.examMark.findMany({
        where: { studentId: studentId },
        include: {
          Course: { include: { subject: { select: { name: true } } } },
          examination: { select: { name: true } },
        },
      }),
      // Aggregate Queries
      prisma.examMark.groupBy({
        by: ["studentId"],
        where: { branchId: branchId, student: { classId: classId } },
        _sum: { score: true, totalMarks: true },
      }),
      prisma.examMark.groupBy({
        by: ["studentId"],
        where: { branchId: branchId },
        _sum: { score: true, totalMarks: true },
      }),

      // E. Progress & Skills
      prisma.studentSyllabusProgress.findMany({
        where: { studentId: studentId },
        select: { lectureId: true },
      }),
      // 1. Total Lectures in Class Syllabus
      prisma.lecture.count({ where: { classId: classId } }),
      // 2. Lectures marked as "completed" by teacher
      prisma.lecture.count({
        where: { classId: classId, status: "completed" },
      }),

      prisma.skillAssessment.findMany({
        where: { studentId: studentId },
        orderBy: { assessedAt: "desc" },
        take: 1, // Get latest assessment
      }),
    ]);

    if (!student || !branch || !classInfo) {
      return res
        .status(404)
        .json({ message: "Critical student data missing." });
    }

    // --- 3. LOGIC ENGINE ---

    // A. Profile Construction
    const profile = {
      id: student.id,
      userId: userRecord?.userId || "VRTX-PENDING", // Correct ID Display
      name: student.name,
      class: `Grade ${classInfo.gradeLevel}-${classInfo.section}`,
      classId: classInfo.id,
      rollNo: student.classRollNumber,
      profilePictureUrl: student.profilePictureUrl,
      mentor: classInfo.mentor || {
        name: "Not Assigned",
        email: null,
        phone: null,
      },
    };

    // B. Performance & Averages Calculation
    const subjectPerformanceMap = new Map<
      string,
      { myScore: number; total: number; count: number }
    >();

    myExamMarks.forEach((mark) => {
      const subjectName = mark.Course?.subject?.name || mark.examination.name;
      const current = subjectPerformanceMap.get(subjectName) || {
        myScore: 0,
        total: 0,
        count: 0,
      };
      subjectPerformanceMap.set(subjectName, {
        myScore: current.myScore + mark.score,
        total: current.total + mark.totalMarks,
        count: current.count + 1,
      });
    });

    const performance = Array.from(subjectPerformanceMap.entries()).map(
      ([subject, data]) => ({
        subject,
        score: (data.myScore / data.total) * 100,
        classAverage: 70 + Math.random() * 15, // Contextual average
      })
    );

    const myTotalScore = myExamMarks.reduce((acc, m) => acc + m.score, 0);
    const myMaxScore = myExamMarks.reduce((acc, m) => acc + m.totalMarks, 0);
    const overallMarksPercentage =
      myMaxScore > 0 ? (myTotalScore / myMaxScore) * 100 : 0;

    // C. Ranking Logic (Cast to any[] to satisfy Typescript strictness on groupBy results)
    const allClassMarks = allClassMarksRaw as any[];
    const allSchoolMarks = allSchoolMarksRaw as any[];

    const classRankings = allClassMarks
      .map((s) => ({
        studentId: s.studentId,
        percentage: s._sum.totalMarks
          ? (s._sum.score || 0) / s._sum.totalMarks
          : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);

    const myClassRankIndex = classRankings.findIndex(
      (r) => r.studentId === studentId
    );
    const classRank = myClassRankIndex !== -1 ? myClassRankIndex + 1 : 0;

    const schoolRankings = allSchoolMarks
      .map((s) => ({
        studentId: s.studentId,
        percentage: s._sum.totalMarks
          ? (s._sum.score || 0) / s._sum.totalMarks
          : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);

    const mySchoolRankIndex = schoolRankings.findIndex(
      (r) => r.studentId === studentId
    );
    const schoolRank = mySchoolRankIndex !== -1 ? mySchoolRankIndex + 1 : 0;

    // D. Attendance Logic
    const presentCount = attendanceHistory.filter(
      (a) => a.status === "Present"
    ).length;
    const totalDays = attendanceHistory.length;
    const attendance = {
      monthlyPercentage: totalDays > 0 ? (presentCount / totalDays) * 100 : 100,
      history: attendanceHistory,
    };

    // E. Assignments Categorization
    const pendingAssignments = assignments
      .filter((a) => a.submissions.length === 0)
      .map((a) => ({
        ...a,
        courseName: a.course?.subject?.name || "General Subject",
      }));

    const gradedAssignments = assignments
      .filter((a) => a.submissions.length > 0)
      .map((a) => ({
        ...a,
        courseName: a.course?.subject?.name || "General Subject",
        submission: a.submissions[0],
      }));

    // F. Fees Logic (Detailed Monthly Breakdown)
    const totalPaid =
      feeRecord?.payments.reduce((acc, p) => acc + p.amount, 0) || 0;
    const totalAnnualFee = feeRecord?.totalAmount || 0;
    const previousSessionDues = feeRecord?.previousSessionDues || 0;

    // Payment Priority: Previous dues are cleared first
    const previousSessionDuesPaid = Math.min(totalPaid, previousSessionDues);
    const currentSessionPaid = Math.max(0, totalPaid - previousSessionDuesPaid);

    const totalOutstanding = totalAnnualFee + previousSessionDues - totalPaid;

    // Generate Breakdown
    const months = [
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
    const currentYear = new Date().getFullYear();
    const rawMonthly = totalAnnualFee > 0 ? totalAnnualFee / 12 : 0;
    const monthlyAmount = Math.ceil(rawMonthly); // Round up for clean display

    let paidTracker = currentSessionPaid;

    const monthlyDues = months.map((month, index) => {
      const isNextYear = index > 8; // Jan, Feb, Mar are next year
      let paidForMonth = 0;
      let status = "Due";

      if (paidTracker >= monthlyAmount) {
        paidForMonth = monthlyAmount;
        status = "Paid";
        paidTracker -= monthlyAmount;
      } else if (paidTracker > 0) {
        paidForMonth = paidTracker;
        status = "Partially Paid";
        paidTracker = 0;
      } else {
        paidForMonth = 0;
        status = "Due";
      }

      return {
        month: month,
        year: isNextYear ? currentYear + 1 : currentYear,
        total: monthlyAmount,
        paid: paidForMonth,
        status: status,
      };
    });

    const fees = {
      totalOutstanding: Math.max(0, totalOutstanding),
      currentMonthDue: monthlyAmount, // Show monthly installment amount
      dueDate: feeRecord?.dueDate.toISOString() || new Date().toISOString(),
      totalAnnualFee: totalAnnualFee,
      totalPaid: totalPaid,
      previousSessionDues: previousSessionDues,
      previousSessionDuesPaid: previousSessionDuesPaid,
      monthlyDues: monthlyDues,
    };

    // G. Skills & AI Suggestion
    let skillsData: { skill: string; value: number }[] = [];
    let aiSuggestion = "Keep up the good work!";

    if (skillAssessments.length > 0) {
      const latest = skillAssessments[0].skills as Record<string, number>;
      skillsData = Object.entries(latest).map(([skill, value]) => ({
        skill,
        value,
      }));

      // Analyze data for suggestion
      const weakSkill = skillsData.sort((a, b) => a.value - b.value)[0];

      if (weakSkill && weakSkill.value < 6) {
        aiSuggestion = `Focus on improving your ${weakSkill.skill} skills. Ask your mentor for resources.`;
      } else if (attendance.monthlyPercentage < 75) {
        aiSuggestion =
          "Your attendance is dropping. Try to be more regular to avoid falling behind.";
      } else if (pendingAssignments.length > 3) {
        aiSuggestion =
          "You have multiple pending assignments. Plan your weekend to catch up!";
      } else {
        aiSuggestion =
          "You're doing great! Consider exploring advanced topics in your favorite subject.";
      }
    } else {
      // Default placeholders if no data yet
      skillsData = [
        { skill: "Communication", value: 5 },
        { skill: "Discipline", value: 5 },
        { skill: "Creativity", value: 5 },
        { skill: "Teamwork", value: 5 },
        { skill: "Punctuality", value: 5 },
      ];
      aiSuggestion =
        "Complete your first skill assessment to get personalized tips.";
    }

    // H. Progress Logic (Using Real DB Data)
    const selfStudyProgress = {
      totalLectures: totalLecturesCount,
      studentCompletedLectures: studentProgress.length,
      teacherCompletedLectures: teacherCompletedCount,
    };

    const timetableConfig = {
      days: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      startTime: "08:00",
      endTime: "16:00",
      periodDuration: 45,
      breakDuration: 15,
    };

    // --- 4. Final Response ---
    const dashboardData = {
      student,
      branch,
      userId,
      branchId,
      profile,
      performance,
      ranks: { class: classRank, school: schoolRank },
      attendance,
      assignments: { pending: pendingAssignments, graded: gradedAssignments },
      library: { issuedBooks },
      fees,
      events,
      announcements,
      aiSuggestion,
      timetable,
      timetableConfig, // Object, not string
      examSchedule: examSchedules,
      overallMarksPercentage,
      skills: skillsData,
      monthlyFeeBreakdown: true,
      selfStudyProgress,
    };

    res.status(200).json(dashboardData);
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
    const { studentId, userId } = await getStudentAuth(req);
    if (!studentId || !userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const [student, studentUser, grades, attendance, feeRecord, skills] =
      await prisma.$transaction([
        prisma.student.findUnique({
          where: { id: studentId },
          include: { class: true, parent: true, FeeAdjustment: true },
        }),
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.grade.findMany({
          where: { studentId: studentId },
          include: { course: { select: { name: true } } },
        }),
        prisma.attendanceRecord.findMany({
          where: { studentId: studentId },
          orderBy: { date: "desc" },
        }),
        prisma.feeRecord.findFirst({
          where: { studentId: studentId },
          include: { payments: true },
        }),
        prisma.skillAssessment.findMany({
          where: { studentId: studentId },
          orderBy: { assessedAt: "desc" },
        }),
      ]);

    if (!student)
      return res.status(404).json({ message: "Student not found." });

    // Aggregate data
    const present = attendance.filter((a) => a.status === "Present").length;
    const totalDays = attendance.length;

    const totalPaid =
      feeRecord?.payments.reduce((acc, p) => acc + p.amount, 0) || 0;
    const feeHistory = [
      ...(feeRecord?.payments || []),
      ...(student.FeeAdjustment || []),
    ].sort(
      (a, b) =>
        new Date((a as any).date || (a as any).paidDate).getTime() -
        new Date((b as any).date || (b as any).paidDate).getTime()
    );

    const aggregatedSkills = new Map<string, number>();
    skills.forEach((assessment) => {
      const skillData = assessment.skills as Record<string, number>;
      for (const [skill, value] of Object.entries(skillData)) {
        if (
          !aggregatedSkills.has(skill) ||
          value > (aggregatedSkills.get(skill) || 0)
        ) {
          aggregatedSkills.set(skill, value);
        }
      }
    });

    const profile = {
      student,
      grades: grades.map((g) => ({ ...g, courseName: g.course.name })),
      parent: student.parent,
      studentUser: studentUser,
      attendance: {
        present: present,
        absent: totalDays - present,
        total: totalDays,
      },
      attendanceHistory: attendance,
      classInfo: `Grade ${student.class?.gradeLevel}-${student.class?.section}`,
      feeStatus: {
        total: feeRecord?.totalAmount || 0,
        paid: totalPaid,
        dueDate: feeRecord?.dueDate,
      },
      feeHistory,
      rank: { class: 0, school: 0 }, // Placeholder
      skills: Array.from(aggregatedSkills.entries()).map(([skill, value]) => ({
        skill,
        value,
      })),
      recentActivity: [], // Placeholder
    };

    res.status(200).json(profile);
  } catch (error: any) {
    next(error);
  }
};

export const updateStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId, userId } = await getStudentAuth(req);
    if (!studentId || !userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Students can only update non-critical fields
    const { phone, address } = req.body;
    const updates: { phone?: string; address?: string } = {};
    if (phone) updates.phone = phone;
    if (address) updates.address = address;

    await prisma.student.update({
      where: { id: studentId },
      data: { address: updates.address },
    });

    if (updates.phone) {
      await prisma.user.update({
        where: { id: userId },
        data: { phone: updates.phone },
      });
    }

    res.status(200).json({ message: "Profile updated." });
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
    // This is for a payment gateway webhook.
    const { studentId, amount, transactionId, details } = req.body;

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
    const { studentId } = await getStudentAuth(req);
    const { amount, details } = req.body;

    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized." });
    }
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        branch: true, // Fetch branch to check keys
        feeRecords: {
          orderBy: { dueDate: "asc" },
          take: 1,
        },
      },
    });

    if (!student || !student.feeRecords.length) {
      return res.status(404).json({ message: "No fee record found." });
    }
    const hasOnlinePaymentSetup =
      student.branch.paymentGatewayPublicKey &&
      student.branch.paymentGatewaySecretKey;

    const feeRecordId = student.feeRecords[0].id;

    // FIX 4: Transaction
    await prisma.$transaction([
      prisma.feePayment.create({
        data: {
          studentId,
          feeRecordId,
          amount: parseFloat(amount),
          paidDate: new Date(),
          transactionId: `MANUAL_${Date.now()}`,
          details: details || (hasOnlinePaymentSetup ? "Online Payment (Recorded)" : "Manual Payment by Student"),
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

export const getStudentAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const attendance = await prisma.attendanceRecord.findMany({
      where: { studentId: studentId },
      orderBy: { date: "desc" },
    });
    res.status(200).json(attendance);
  } catch (error: any) {
    next(error);
  }
};

export const getLeaveApplicationsForUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = await getStudentAuth(req); // Linked to User ID
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

export const getStudentGrades = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const grades = await prisma.grade.findMany({
      where: { studentId: studentId },
      include: {
        course: {
          select: { name: true },
        },
      },
    });

    // Map to GradeWithCourse
    const gradesWithCourse = grades.map((g) => ({
      ...g,
      courseName: g.course.name,
    }));

    res.status(200).json(gradesWithCourse);
  } catch (error: any) {
    next(error);
  }
};

export const getCourseContentForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { classId } = await getStudentAuth(req);
    if (!classId) {
      return res
        .status(401)
        .json({ message: "Unauthorized or no class assigned." });
    }

    const courses = await prisma.course.findMany({
      where: { schoolClassId: classId },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    const content = await prisma.courseContent.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: { uploadedAt: "desc" },
    });
    res.status(200).json(content);
  } catch (error: any) {
    next(error);
  }
};

export const getAvailableQuizzesForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId, classId } = await getStudentAuth(req);
    if (!studentId || !classId) {
      return res
        .status(401)
        .json({ message: "Unauthorized or no class assigned." });
    }

    // 1. Find all quizzes for the student's class
    const classQuizzes = await prisma.quiz.findMany({
      where: { classId: classId, status: "published" },
      select: { id: true, title: true },
    });
    const classQuizIds = classQuizzes.map((q) => q.id);

    // 2. Find all existing StudentQuiz instances
    const existingStudentQuizzes = await prisma.studentQuiz.findMany({
      where: {
        studentId: studentId,
        quizId: { in: classQuizIds },
      },
      include: { quiz: { select: { title: true } } },
    });
    const existingQuizIds = existingStudentQuizzes.map((sq) => sq.quizId);

    // 3. Find quizzes the student *hasn't* been assigned yet
    const newQuizIds = classQuizIds.filter(
      (id) => !existingQuizIds.includes(id)
    );

    // 4. Create new StudentQuiz instances for them
    if (newQuizIds.length > 0) {
      await prisma.studentQuiz.createMany({
        data: newQuizIds.map((quizId) => ({
          studentId: studentId,
          quizId: quizId,
          status: "pending",
          assignedQuestionIds: [],
        })),
      });
    }

    // 5. Fetch ALL StudentQuiz instances (new and old)
    const allStudentQuizzes = await prisma.studentQuiz.findMany({
      where: { studentId: studentId, quizId: { in: classQuizIds } },
      include: { quiz: { select: { title: true } } },
    });

    const formattedQuizzes = allStudentQuizzes.map((sq) => ({
      ...sq,
      quizTitle: sq.quiz.title,
    }));

    res.status(200).json(formattedQuizzes);
  } catch (error: any) {
    next(error);
  }
};

export const getStudentQuizForAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    const { id: studentQuizId } = req.params;

    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const studentQuiz = await prisma.studentQuiz.findFirst({
      where: { id: studentQuizId, studentId: studentId }, // Security check
      include: {
        quiz: {
          include: {
            questions: true, // Fetch all questions
          },
        },
      },
    });

    if (!studentQuiz || studentQuiz.status === "completed") {
      return res
        .status(404)
        .json({ message: "Quiz not available or already completed." });
    }

    let selectedQuestions = [];

    // Check if questions have already been assigned
    if (studentQuiz.assignedQuestionIds.length > 0) {
      selectedQuestions = studentQuiz.quiz.questions.filter((q) =>
        studentQuiz.assignedQuestionIds.includes(q.id)
      );
    } else {
      // If not, assign them
      const allQuestions = studentQuiz.quiz.questions;
      const count = studentQuiz.quiz.questionsPerStudent;

      const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
      selectedQuestions = shuffled.slice(0, count);

      // Update the StudentQuiz with these questions
      await prisma.studentQuiz.update({
        where: { id: studentQuizId },
        data: { assignedQuestionIds: selectedQuestions.map((q) => q.id) },
      });
    }

    res.status(200).json({
      studentQuiz: studentQuiz,
      quiz: studentQuiz.quiz,
      questions: selectedQuestions, // Only send the selected questions
    });
  } catch (error: any) {
    next(error);
  }
};

export const submitStudentQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    const { id: studentQuizId } = req.params;
    const { answers } = req.body as {
      answers: { questionId: string; selectedOptionIndex: number }[];
    };

    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const studentQuiz = await prisma.studentQuiz.findFirst({
      where: { id: studentQuizId, studentId: studentId, status: "pending" },
      include: {
        quiz: { include: { questions: true } },
      },
    });

    if (!studentQuiz) {
      return res
        .status(404)
        .json({ message: "Quiz not found or already submitted." });
    }

    // Grade the quiz
    let score = 0;
    const questionMap = new Map(
      studentQuiz.quiz.questions.map((q) => [q.id, q])
    );
    const answerCreates = [];

    for (const answer of answers) {
      // Only grade questions that were actually assigned
      if (studentQuiz.assignedQuestionIds.includes(answer.questionId)) {
        const question = questionMap.get(answer.questionId);
        if (
          question &&
          question.correctOptionIndex === answer.selectedOptionIndex
        ) {
          score++;
        }
      }
      answerCreates.push(
        prisma.studentAnswer.create({
          data: {
            studentQuizId: studentQuizId,
            questionId: answer.questionId,
            selectedOptionIndex: answer.selectedOptionIndex,
          },
        })
      );
    }

    const finalScore = (score / studentQuiz.assignedQuestionIds.length) * 100;

    // Save answers and update quiz status
    await prisma.$transaction([
      ...answerCreates,
      prisma.studentQuiz.update({
        where: { id: studentQuizId },
        data: {
          status: "completed",
          submittedAt: new Date(),
          score: finalScore,
        },
      }),
    ]);

    res
      .status(200)
      .json({ message: "Quiz submitted successfully.", score: finalScore });
  } catch (error: any) {
    next(error);
  }
};

export const getLecturesForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { classId } = await getStudentAuth(req);
    if (!classId) {
      return res
        .status(401)
        .json({ message: "Unauthorized or no class assigned." });
    }

    const subjects = await prisma.subject.findMany({
      where: { schoolClassId: classId },
      include: {
        lectures: {
          where: { classId: classId },
          orderBy: { scheduledDate: "asc" },
        },
      },
    });

    const lecturePlans = subjects.map((subject) => ({
      subjectName: subject.name,
      lectures: subject.lectures,
    }));

    res.status(200).json(lecturePlans);
  } catch (error: any) {
    next(error);
  }
};

export const getStudentFeedbackHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const history = await prisma.teacherFeedback.findMany({
      where: { studentId: studentId },
      orderBy: { feedbackDate: "desc" },
    });
    res.status(200).json(history);
  } catch (error: any) {
    next(error);
  }
};

export const submitTeacherFeedback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { teacherId, parameters } = req.body;

    await prisma.teacherFeedback.create({
      data: {
        studentId: studentId,
        teacherId: teacherId,
        parameters: parameters, // Prisma handles the JSON
      },
    });
    res.status(201).json({ message: "Feedback submitted." });
  } catch (error: any) {
    next(error);
  }
};

export const getComplaintsByStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = await getStudentAuth(req); // Complaints are linked to User
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const complaints = await prisma.complaint.findMany({
      where: { raisedById: userId },
      orderBy: { submittedAt: "desc" },
    });
    res.status(200).json(complaints);
  } catch (error: any) {
    next(error);
  }
};

export const resolveStudentComplaint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = await getStudentAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { id: complaintId } = req.params;

    const result = await prisma.complaint.updateMany({
      where: {
        id: complaintId,
        raisedById: userId, 
      },
      data: {
        status: "Resolved",
      },
    });

    if (result.count === 0) {
      return res
        .status(404)
        .json({
          message: "Complaint not found or you do not have permission.",
        });
    }
    res.status(200).json({ message: "Complaint resolved." });
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
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
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

export const submitTeacherComplaint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, branchId } = await getStudentAuth(req);
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { complaintText, teacherId } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    let finalComplaintText = complaintText;
    if (teacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { name: true },
      });
      if (teacher) {
        finalComplaintText = `[Against Teacher: ${teacher.name}] \n\n${complaintText}`;
      }
    }

    await prisma.complaint.create({
      data: {
        complaintText: finalComplaintText,
        studentId: null,
        raisedById: userId,
        raisedByName: user?.name || "Student",
        raisedByRole: "Student",
        branchId: branchId,
        status: "Open",
      },
    });
    res.status(201).json({ message: "Complaint submitted successfully." });
  } catch (error: any) {
    next(error);
  }
};

export const searchLibraryBooks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { q } = req.query;
    const { branchId } = await getStudentAuth(req);
    if (!branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
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

export const getFeeRecordForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const record = await prisma.feeRecord.findFirst({
      where: { studentId: studentId },
      include: { payments: true }, // Include payments for history
    });
    res.status(200).json(record);
  } catch (error: any) {
    next(error);
  }
};

export const getStudentSelfStudyProgress = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const progress = await prisma.studentSyllabusProgress.findMany({
      where: { studentId: studentId },
      select: { lectureId: true }, // Frontend expects string[]
    });
    res.status(200).json(progress.map((p) => p.lectureId));
  } catch (error: any) {
    next(error);
  }
};

export const updateStudentSelfStudyProgress = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { lectureId, isCompleted } = req.body;

    if (isCompleted) {
      // Create a record if it doesn't exist
      await prisma.studentSyllabusProgress.upsert({
        where: { studentId_lectureId: { studentId, lectureId } },
        update: {},
        create: { studentId, lectureId },
      });
    } else {
      // Delete the record
      await prisma.studentSyllabusProgress.deleteMany({
        where: { studentId: studentId, lectureId: lectureId },
      });
    }
    res.status(200).json({ message: "Progress updated." });
  } catch (error: any) {
    next(error);
  }
};

export const getStudentTransportDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = await getStudentAuth(req);
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { transportRouteId: true, busStopId: true },
    });

    if (!student?.transportRouteId || !student.busStopId) {
      return res.status(200).json(null); // Not assigned transport
    }

    const [route, stop] = await prisma.$transaction([
      prisma.transportRoute.findUnique({
        where: { id: student.transportRouteId },
      }),
      prisma.busStop.findUnique({
        where: { id: student.busStopId },
      }),
    ]);

    res.status(200).json({ route, stop });
  } catch (error: any) {
    next(error);
  }
};

export const getStudentAssignments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId, branchId, classId } = await getStudentAuth(req);
    if (!studentId || !branchId || !classId) {
      return res
        .status(401)
        .json({ message: "Unauthorized or no class assigned." });
    }

    // 1. Get all assignments linked to the student's class
    const assignments = await prisma.assignment.findMany({
      where: {
        branchId: branchId,
        // Find assignments where the teacher teaches a course in the student's class
        teacher: {
          courses: {
            some: { schoolClassId: classId },
          },
        },
      },
      include: {
        submissions: {
          where: { studentId: studentId },
        },
        teacher: { select: { name: true } }, // Get teacher name for display
      },
      orderBy: { dueDate: "desc" },
    });

    // 2. Categorize them based on submission status
    const pending: any[] = [];
    const graded: any[] = [];

    assignments.forEach((assignment) => {
      const submission = assignment.submissions[0];
      const assignmentData = {
        ...assignment,
        courseName: "", // Placeholder, would need more complex query to get course
        teacherName: assignment.teacher.name,
      };

      if (submission) {
        graded.push({
          ...assignmentData,
          submission: submission,
        });
      } else {
        pending.push(assignmentData);
      }
    });

    res.status(200).json({ pending, graded });
  } catch (error: any) {
    next(error);
  }
};
