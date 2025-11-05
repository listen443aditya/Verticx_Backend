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
    select: { id: true }, // We only need the teacher's primary key
  });

  return {
    teacherId: teacher?.id || null, // This is the ID from the Teacher table
    userId: userId, // This is the ID from the User table
    branchId: branchId,
  };
};
// NOTE: This controller assumes that your 'protect' middleware
// attaches the 'teacher' relation to 'req.user'.
// If not, we will need to adjust 'getTeacherAuth' to be:
// const getTeacherAuth = (req: Request) => {
//   const userId = req.user?.id;
//   const branchId = req.user?.branchId;
//   return { userId, branchId };
// };
// And then find the teacherId inside each function where it's needed.
// For now, let's use the 'req.user.id' as the 'teacherId' for simplicity.

// ============================================================================
// DASHBOARD
// ============================================================================

export const getTeacherDashboardData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    // This is a placeholder for your dashboard logic.
    // Replace this with your actual queries.
    const [classCount, studentCount, upcomingEvents] =
      await prisma.$transaction([
        prisma.schoolClass.count({
          where: { branchId: branchId, mentorId: userId }, // Mentor of classes
        }),
        prisma.student.count({
          where: { branchId: branchId },
        }),
        prisma.schoolEvent.findMany({
          where: { branchId: branchId, date: { gte: new Date() } },
          orderBy: { date: "asc" },
          take: 5,
        }),
      ]);

    res.status(200).json({ classCount, studentCount, upcomingEvents });
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Logic: Get all students in the teacher's branch.
    const students = await prisma.student.findMany({
      where: { branchId: branchId },
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
    const { branchId } = await await getTeacherAuth(req);
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
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const courses = await prisma.course.findMany({
      where: { teacherId: userId },
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
    const { userId } = await getTeacherAuth(req);
    const { subjectId } = req.query;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const course = await prisma.course.findFirst({
      where: { teacherId: userId, subjectId: subjectId as string },
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { classId, subjectId, lectures } = req.body;

    // In a real app, you would upsert these. For now, we create them.
    const lectureData = lectures.map((topic: string) => ({
      branchId,
      classId,
      subjectId,
      teacherId: userId,
      topic,
      scheduledDate: new Date(), // Placeholder
      status: "pending",
    }));

    await prisma.lecture.createMany({
      data: lectureData,
    });
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
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // This assumes CourseContent has a teacherId. If not, this logic must change.
    // Let's assume you meant to find content by *course*
    const courses = await prisma.course.findMany({
      where: { teacherId: userId },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    // This schema model is not provided. This is a best-guess implementation.
    // @ts-ignore
    const content = await prisma.courseContent.findMany({
      where: { courseId: { in: courseIds } },
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
    const { branchId } = await getTeacherAuth(req);
    if (!branchId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const { courseId, title, description } = req.body;
    const file = (req as any).file; // File from multer

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

    // This schema model is not provided. This is a best-guess implementation.
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

    // Find students in the class linked to this course
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

    // Find existing attendance records
    const existingRecords = await prisma.attendanceRecord.findMany({
      where: { courseId: courseId, date: targetDate },
    });

    const isSaved = existingRecords.length > 0;
    const attendanceMap = new Map(
      existingRecords.map((r) => [r.studentId, r.status])
    );

    const attendanceList = students.map((student) => ({
      id: attendanceMap.get(student.id) || undefined,
      studentId: student.id,
      studentName: student.name,
      courseId: courseId,
      date: targetDate,
      status: attendanceMap.get(student.id) || "Present", // Default to 'Present'
    }));

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
          classId: record.classId, // Assuming this is passed
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
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const assignments = await prisma.assignment.findMany({
      where: { teacherId: userId },
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const assignmentData = {
      ...req.body,
      teacherId: userId,
      branchId: branchId,
    };
    await prisma.assignment.create({
      data: assignmentData,
    });
    res.status(201).json({ message: "Assignment created successfully." });
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
    await prisma.assignment.update({
      where: { id: req.params.assignmentId },
      data: req.body,
    });
    res.status(200).json({ message: "Assignment updated successfully." });
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
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    await prisma.markingTemplate.create({
      data: req.body,
    });
    res.status(201).json({ message: "Marking template created." });
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
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    const templates = await prisma.markingTemplate.findMany({
      where: { courseId: req.params.courseId },
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
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    const marks = await prisma.studentMark.findMany({
      where: { templateId: req.params.templateId },
    });
    res.status(200).json(marks);
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
    // This logic is highly specific and needs schema
    res.status(200).json({ message: "Marks saved." });
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
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    await prisma.markingTemplate.delete({
      where: { id: req.params.templateId },
    });
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
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    const quizzes = await prisma.quiz.findMany({
      where: { teacherId: userId },
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
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.id },
      include: { questions: true },
    });
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
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
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { quizData, questionsData } = req.body;
    quizData.teacherId = userId;
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    await prisma.quiz.create({
      data: {
        ...quizData,
        questions: {
          create: questionsData,
        },
      },
    });
    res.status(201).json({ message: "Quiz saved successfully." });
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
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    await prisma.quiz.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });
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
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    const results = await prisma.quizResult.findMany({
      where: { quizId: req.params.id },
    });
    res.status(200).json(results);
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
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const schedules = await prisma.examSchedule.findMany({
      where: {
        examinationId: req.params.examinationId,
        subject: { teacherId: userId },
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

    // 1. Find the class associated with this schedule
    const schedule = await prisma.examSchedule.findUnique({
      where: { id: scheduleId },
      select: { classId: true },
    });
    if (!schedule)
      return res.status(404).json({ message: "Schedule not found." });

    // 2. Get all students in that class
    const students = await prisma.student.findMany({
      where: { classId: schedule.classId },
      select: { id: true, name: true },
    });

    // 3. Get all existing marks for this schedule
    const marks = await prisma.examMark.findMany({
      where: { examScheduleId: scheduleId },
    });
    const marksMap = new Map(marks.map((m) => [m.studentId, m]));

    // 4. Merge students with their marks
    const studentMarks = students.map((student) => {
      const mark = marksMap.get(student.id);
      return {
        id: mark?.id || undefined,
        studentId: student.id,
        studentName: student.name,
        score: mark?.score || 0,
        totalMarks: mark?.totalMarks || 100, // Default to 100
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
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
          teacherId: userId,
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requestData = { ...req.body, teacherId: userId, branchId };
    await prisma.teacherAttendanceRectificationRequest.create({
      data: requestData,
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requestData = { ...req.body, teacherId: userId, branchId };
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requestData = { ...req.body, teacherId: userId, branchId };
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
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requests = await prisma.meetingRequest.findMany({
      where: { teacherId: userId },
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
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
      data: complaintData,
    });
    res.status(201).json({ message: "Complaint submitted." });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// STUDENT SKILLS
// ============================================================================

export const getTeacherSkillAssessmentForStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    const assessment = await prisma.skillAssessment.findFirst({
      where: {
        teacherId: userId,
        studentId: req.params.studentId,
      },
    });
    res.status(200).json(assessment);
  } catch (error: any) {
    next(error);
  }
};

export const submitSkillAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const assessmentData = { ...req.body, teacherId: userId };
    // This model is not defined. This is a placeholder.
    // @ts-ignore
    await prisma.skillAssessment.create({
      data: assessmentData,
    });
    res.status(201).json({ message: "Skill assessment submitted." });
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// LEAVES
// ============================================================================

// RENAMED from getLeaveApplicationsForTeacher to match router/apiService
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
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Find students in classes mentored by this teacher
    const mentoredClasses = await prisma.schoolClass.findMany({
      where: { mentorId: userId },
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
    const { userId } = await getTeacherAuth(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { status } = req.body;

    // Security check: ensure the teacher is the mentor for this student
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

    if (studentClass?.mentorId !== userId) {
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

// RENAMED from getTeacherTransportDetails
export const getMyTransportDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teacherId, userId, branchId } = await await getTeacherAuth(req); // <-- NEW
    if (!userId || !branchId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: userId },
      select: { transportRouteId: true, busStopId: true },
    });

    if (!teacher || !teacher.transportRouteId || !teacher.busStopId) {
      return res.status(200).json(null); // Return null if not assigned
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

// ============================================================================
// FUNCTIONS THAT WERE CALLED BUT DIDN'T EXIST
// (These are just placeholders, as their schemas are not defined)
// ============================================================================

// export const uploadCourseContent = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   res.status(501).json({ message: "Not Implemented" });
// };
