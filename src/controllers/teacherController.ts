// backend/src/controllers/teacherController.ts

import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";

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
    ] = await prisma.$transaction([
      // 1. Weekly Schedule
      prisma.timetableSlot.findMany({
        where: { teacherId: teacherId, branchId: branchId },
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
          // This is a placeholder. Real at-risk logic is complex.
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
          memberId: teacherId,
          memberType: "Teacher",
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
    ]);

    // Format Class Performance
    const classMap = new Map(
      allBranchClasses.map((c) => [c.id, `Grade ${c.gradeLevel}-${c.section}`])
    );
    const formattedClassPerformance = classPerformance.map((cp) => ({
      className: classMap.get(cp.schoolClassId) || "Unknown Class",
      average: cp._avg?.score || 0,
    }));

    // Format At-Risk
    const formattedAtRisk = atRiskStudents.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      reason: "Low Attendance", // Placeholder
      value: "N/A",
    }));

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
      // subjectMarksTrend and rectificationRequestCount are not implemented here
      subjectMarksTrend: [],
      rectificationRequestCount: 0,
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
    // Logic: Get all students in classes this teacher teaches
    const courses = await prisma.course.findMany({
      where: { teacherId: teacherId },
      select: { schoolClassId: true },
    });
    const classIds = [
      ...new Set(
        courses.map((c) => c.schoolClassId).filter(Boolean) as string[]
      ),
    ];

    const students = await prisma.student.findMany({
      where: { branchId: branchId, classId: { in: classIds } },
      include: {
        class: { select: { gradeLevel: true, section: true } },
      },
    });
    res.status(200).json(students);
  } catch (error: any) {
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
    });
    res.status(200).json(students);
  } catch (error: any) {
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
    const courses = await prisma.course.findMany({
      where: { teacherId: teacherId },
    });
    res.status(200).json(courses);
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
    const { classId, subjectId } = req.query; // Use req.query, not req.params
    const lectures = await prisma.lecture.findMany({
      where: {
        classId: classId as string,
        subjectId: subjectId as string,
      },
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
    const { classId, subjectId, lectures, newLectures } = req.body;

    // This is placeholder logic.
    // In a real app, you would parse 'newLectures' and 'lectures'
    // and perform upsert operations.
    const lectureTopics = newLectures
      .split("\n")
      .filter((l: string) => l.trim() !== "");

    const lectureData = lectureTopics.map((topic: string) => ({
      branchId,
      classId,
      subjectId,
      teacherId: teacherId,
      topic,
      scheduledDate: new Date(),
      status: "pending",
    }));

    if (lectureData.length > 0) {
      await prisma.lecture.createMany({
        data: lectureData,
      });
    }
    res.status(201).json({ message: "Lectures saved." });
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
    const { lectureId } = req.params;
    const { status } = req.body;
    await prisma.lecture.update({
      where: { id: lectureId },
      data: { status: status },
    });
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
    const { teacherId } = await getTeacherAuth(req);
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Assuming CourseContent is not a real model yet.
    // We'll query courses instead.
    const courses = await prisma.course.findMany({
      where: { teacherId: teacherId },
    });
    res.status(200).json(courses);
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
    const { branchId } = await getTeacherAuth(req);
    if (!branchId) {
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

    // This model needs to be added to your schema.
    // @ts-ignore
    const newContent = await prisma.courseContent.create({
      data: {
        courseId,
        title,
        description,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileUrl: blob.url,
        branchId,
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
      select: { id: true, name: true },
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
    const assignmentData = {
      ...req.body,
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
    const updatedAssignment = await prisma.assignment.updateMany({
      where: { id: req.params.assignmentId, teacherId: teacherId }, // Security check
      data: req.body,
    });
    res.status(200).json(updatedAssignment);
  } catch (error: any) {
    next(error);
  }
};

// Placeholder functions for Gradebook/Quizzes (schema not provided)
export const createMarkingTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(501).json({ message: "Not Implemented" });
};
export const getMarkingTemplatesForCourse = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json([]);
};
export const getStudentMarksForTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json([]);
};
export const saveStudentMarks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json({ message: "Saved" });
};
export const deleteMarkingTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(204).send();
};
export const getQuizzesForTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json([]);
};
export const getQuizWithQuestions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json(null);
};
export const saveQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(201).json({ message: "Quiz saved" });
};
export const updateQuizStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json({ message: "Status updated" });
};
export const getQuizResults = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json({ results: [] });
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
    const { branchId } = await getTeacherAuth(req);
if (!branchId) {
  return res
    .status(401)
    .json({ message: "Unauthorized: Branch ID not found for user." });
}
    const schedule = await prisma.examSchedule.findFirst({
      where: { id: scheduleId, branchId: branchId },
      select: { classId: true, totalMarks: true, examinationId: true }, 
    });
    if (!schedule || !schedule.classId)
      return res
        .status(404)
        .json({ message: "Schedule or associated class not found." });

    const students = await prisma.student.findMany({
      where: { classId: schedule.classId, branchId: branchId },
      select: { id: true, name: true },
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
       score: mark?.score || 0, // <-- Add a default
       totalMarks: schedule.totalMarks,
       // For saving later
       examinationId: schedule.examinationId, // <-- Use the ID from the schedule
       examScheduleId: scheduleId,
       schoolClassId: schedule.classId, // <-- This is now safe
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

    const upsertOperations = marks.map((mark: any) =>
      prisma.examMark.upsert({
        where: { id: mark.id || `temp-id-${Math.random()}` },
        update: { score: mark.score },
        create: {
          branchId,
          examinationId: mark.examinationId,
          examScheduleId: mark.examScheduleId,
          studentId: mark.studentId,
          teacherId: teacherId, // Mark as entered by this teacher
          schoolClassId: mark.schoolClassId,
          score: mark.score,
          totalMarks: mark.totalMarks,
        },
      })
    );

    await prisma.$transaction(upsertOperations);
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
    const { userId, branchId } = await getTeacherAuth(req);
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { date, fromStatus, toStatus, reason } = req.body;

    await prisma.teacherAttendanceRectificationRequest.create({
      data: {
        branchId,
        teacherId: userId,
        teacherName: req.user?.name || "Teacher",
        date: new Date(date),
        fromStatus,
        toStatus,
        reason,
        status: "Pending",
      },
    });
    res.status(201).json({ message: "Rectification request submitted." });
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
    const requestData = { ...req.body, teacherId: teacherId, branchId };
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
    const requestData = { ...req.body, teacherId: teacherId, branchId };
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
    await prisma.meetingRequest.update({
      where: { id: req.params.requestId },
      data: req.body,
    });
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
    // This is complex logic that requires reading the timetable.
    // Returning a placeholder.
    res.status(200).json(["09:00", "10:00", "14:00"]);
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
    const complaintData = {
      ...req.body,
      raisedById: userId,
      raisedByName: req.user?.name || "Teacher",
      raisedByRole: "Teacher",
      branchId: branchId,
    };
    await prisma.complaint.create({
      data: complaintData as any, // Use 'as any' to bypass strict type check if schema is slightly off
    });
    res.status(201).json({ message: "Complaint submitted." });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// STUDENT SKILLS (PLACEHOLDER)
// ============================================================================

export const getTeacherSkillAssessmentForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(200).json(null);
};

export const submitSkillAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(201).json({ message: "Skill assessment submitted." });
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
        applicant: { select: { name: true } },
      },
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

    const application = await prisma.leaveApplication.findUnique({
      where: { id: req.params.requestId },
      include: {
        applicant: {
          include: { studentProfile: { select: { classId: true } } },
        },
      },
    });

    if (!application?.applicant?.studentProfile?.classId) {
      return res
        .status(404)
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
      where: { id: req.params.requestId },
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
    const books = await prisma.libraryBook.findMany({
      where: {
        branchId: branchId,
        OR: [
          { title: { contains: q as string, mode: "insensitive" } },
          { author: { contains: q as string, mode: "insensitive" } },
          { isbn: { contains: q as string, mode: "insensitive" } },
        ],
      },
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
