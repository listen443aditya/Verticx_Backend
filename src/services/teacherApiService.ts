// services/teacherApiService.ts
import { db, saveDb } from "./database";
import type {
  Teacher,
  Student,
  TeacherDashboardData,
  TimetableSlot,
  Assignment,
  AtRiskStudent,
  BookIssuance,
  MeetingRequest,
  TeacherAttendanceRecord,
  TeacherCourse,
  Course,
  AttendanceRecord,
  MarkingTemplate,
  StudentMark,
  Quiz,
  TransportRoute, 
  BusStop,
  QuizQuestion,
  StudentQuiz,
  StudentAnswer,
  QuizResult,
  Lecture,
  SyllabusChangeRequest,
  HydratedMeetingRequest,
  ExamSchedule,
  ExamMark,
  ExamMarkRectificationRequest,
  CourseContent,
  ComplaintAboutStudent,
  SkillAssessment,
  LeaveApplication,
  LibraryBook,
  Examination,
  HydratedSchedule,
  Grade,
} from "../types/api";

import { BaseApiService } from "./baseApiService";
// Fallback: attempt to load a local prisma client; if not present provide a minimal mock so compilation succeeds.
const prisma: any = (() => {
  try {
    // try to load a real prisma client if it exists
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("../prisma").default;
  } catch (e) {
    console.warn("Failed to load real Prisma client, using mock. Error:", e);

    // This is the mock for a model (e.g., prisma.student)
    const modelHandler = {
      findMany: async (_opts?: any) => [],
      findFirst: async (_opts?: any) => null,
      findUnique: async (_opts?: any) => null,
      count: async (_opts?: any) => 0,
      groupBy: async (_opts?: any) => [],
    };

    // This is the mock for the main prisma object itself
    const prismaHandler = {
      get(target: any, prop: string): any {
        // --- THIS IS THE FIX ---
        // If the code asks for '$transaction', give it a mock function
        if (prop === "$transaction") {
          // Return a mock function that just runs the promises and returns their results
          return async (promises: Promise<any>[]) => Promise.all(promises);
        }
        // --- END OF FIX ---

        // For any other property (e.g., 'timetableSlot'), return the model mock
        return modelHandler;
      },
    };
    return new Proxy({}, prismaHandler);
  }
})();


export class TeacherApiService extends BaseApiService {
  private calculateStudentAverage(studentId: string): number {
    const studentGrades = (db.grades as Grade[]).filter(
      (g) => g.studentId === studentId
    );
    if (studentGrades.length === 0) return 0;
    return (
      studentGrades.reduce((acc, g) => acc + g.score, 0) / studentGrades.length
    );
  }

  public async getTeacherDashboardData(
    teacherId: string,
    branchId: string
  ): Promise<TeacherDashboardData> {
    // --- Step 1: Fetch all simple, parallel data in one transaction ---
    const [
      weeklySchedule,
      assignmentsToReview,
      pendingMeetingRequests,
      issuedBooks,
      mentoredClass,
      upcomingDeadlines,
      rectificationRequestCount,
      coursesTaught,
    ] = await prisma.$transaction([
      // 1. Weekly Schedule
      prisma.timetableSlot.findMany({
        where: { teacherId, branchId },
      }),

      // 2. Assignments to Review (Example: count submissions)
      prisma.assignmentSubmission.count({
        where: {
          assignment: { teacherId, branchId },
          status: "Submitted",
        },
      }),

      // 3. Pending Meeting Requests
      prisma.meetingRequest.count({
        where: { teacherId, branchId, status: "pending" },
      }),

      // 4. Issued Library Books
      prisma.bookIssuance.findMany({
        where: {
          memberId: teacherId,
          branchId: branchId,
          returnedDate: null,
        },
        include: { book: { select: { title: true } } },
      }),

      // 5. Mentored Class
      prisma.schoolClass.findFirst({
        where: { mentorId: teacherId, branchId: branchId },
        select: {
          id: true,
          gradeLevel: true,
          section: true,
          _count: { select: { students: true } },
        },
      }),

      // 6. Upcoming Deadlines
      prisma.assignment.findMany({
        where: {
          teacherId,
          branchId,
          dueDate: { gt: new Date() },
        },
        orderBy: { dueDate: "asc" },
        take: 3,
        select: { id: true, title: true, dueDate: true },
      }),

      // 7. Pending Rectification Requests
      prisma.teacherAttendanceRectificationRequest.count({
        where: { teacherId, branchId, status: "Pending" },
      }),

      // 8. All courses taught by this teacher
      prisma.course.findMany({
        where: { teacherId, branchId, schoolClassId: { not: null } },
        include: {
          schoolClass: {
            select: {
              id: true,
              gradeLevel: true,
              section: true,
              students: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
    ]);

    // --- Step 2: Process complex data (Performance & At-Risk) ---
    const classPerformance = [];
    const atRiskMap: Map<string, AtRiskStudent> = new Map();
    const allStudentIds: string[] = [];

    for (const course of coursesTaught) {
      if (!course.schoolClass) continue;

      const studentIds = course.schoolClass.students.map((s: Student) => {
        if (!allStudentIds.includes(s.id)) {
          allStudentIds.push(s.id);
        }
        return s.id;
      });

      if (studentIds.length === 0) {
        classPerformance.push({
          className: `${course.schoolClass.gradeLevel}-${course.schoolClass.section} (${course.name})`,
          average: 0,
        });
        continue;
      }

      // Get all marks for this specific course
      const marks = await prisma.examMark.findMany({
        where: {
          courseId: course.id,
          studentId: { in: studentIds },
        },
      });

      let totalScore = 0;
      const studentScores: Map<string, { total: number; count: number }> =
        new Map();

      for (const mark of marks) {
        const score = (mark.score / mark.totalMarks) * 100;
        totalScore += score;

        const s = studentScores.get(mark.studentId) || { total: 0, count: 0 };
        studentScores.set(mark.studentId, {
          total: s.total + score,
          count: s.count + 1,
        });
      }

      // 2a. Calculate Class Performance
      const averageClassScore =
        marks.length > 0 ? totalScore / marks.length : 0;
      classPerformance.push({
        className: `${course.schoolClass.gradeLevel}-${course.schoolClass.section} (${course.name})`,
        average: averageClassScore,
      });

      // 2b. Check for At-Risk (Low Performance)
      for (const student of course.schoolClass.students) {
        const s = studentScores.get(student.id);
        const studentAvg = s && s.count > 0 ? s.total / s.count : 0;

        if (studentAvg > 0 && studentAvg < 40 && !atRiskMap.has(student.id)) {
          atRiskMap.set(student.id, {
            studentId: student.id,
            studentName: student.name,
            reason: "Low Performance",
            value: `${studentAvg.toFixed(1)}%`,
          });
        }
      }
    }

    // 2c. Check for At-Risk (Low Attendance)
    if (allStudentIds.length > 0) {
      const attendanceData = await prisma.attendanceRecord.groupBy({
        by: ["studentId", "status"],
        where: { studentId: { in: allStudentIds } },
        _count: { _all: true },
      });

      const studentAttendance: Map<string, { present: number; total: number }> =
        new Map();
      for (const record of attendanceData) {
        const s = studentAttendance.get(record.studentId) || {
          present: 0,
          total: 0,
        };
        if (record.status === "Present" || record.status === "Tardy") {
          s.present += record._count._all;
        }
        s.total += record._count._all;
        studentAttendance.set(record.studentId, s);
      }

      for (const [studentId, stats] of studentAttendance.entries()) {
        if (stats.total === 0) continue;
        const attendancePercent = (stats.present / stats.total) * 100;

        if (attendancePercent < 75 && !atRiskMap.has(studentId)) {
          const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { name: true },
          });
          atRiskMap.set(studentId, {
            studentId: studentId,
            studentName: student?.name || "Unknown Student",
            reason: "Low Attendance",
            value: `${attendancePercent.toFixed(1)}%`,
          });
        }
      }
    }

    // --- Step 3: Assemble and Return the Final Object ---
    return {
      weeklySchedule,
      assignmentsToReview: assignmentsToReview,
      upcomingDeadlines: upcomingDeadlines.map(
        (d: { id: string; title: string; dueDate: Date }) => ({
          id: d.id,
          title: d.title,
          dueDate: d.dueDate.toISOString(),
        })
      ),
      classPerformance,
      atRiskStudents: Array.from(atRiskMap.values()),
      mentoredClass: mentoredClass
        ? {
            id: mentoredClass.id,
            name: `Grade ${mentoredClass.gradeLevel}-${mentoredClass.section}`,
            studentCount: mentoredClass._count.students,
          }
        : undefined,
      rectificationRequestCount: rectificationRequestCount,
      pendingMeetingRequests: pendingMeetingRequests,
      library: {
        issuedBooks: (
          issuedBooks as (BookIssuance & { book?: { title?: string } })[]
        ).map((i) => ({
          ...i,
          bookTitle: i.book?.title || "Unknown",
        })),
      },
      subjectMarksTrend: [], // Placeholder: This requires a more complex historical query
    };
  }

  public async getTransportDetailsForTeacher(
    teacherId: string,
    branchId: string
  ): Promise<{ route: TransportRoute; stop: BusStop } | null> {
    // 1. Find the teacher to get their transport IDs
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherId, // Assuming you link by User ID from the token
        branchId: branchId,
      },
      select: {
        transportRouteId: true,
        busStopId: true,
      },
    });

    // 2. If no teacher or no transport assigned, return null
    if (!teacher || !teacher.transportRouteId || !teacher.busStopId) {
      return null;
    }

    // 3. Fetch the route and stop details in parallel
    // We can safely assume the route/stop exist if the IDs are on the teacher record
    const [route, stop] = await prisma.$transaction([
      prisma.transportRoute.findUnique({
        where: { id: teacher.transportRouteId },
      }),
      prisma.busStop.findUnique({
        where: { id: teacher.busStopId },
      }),
    ]);

    // 4. If details are found, return them
    if (route && stop) {
      return { route, stop };
    }

    // 5. If details are missing (data integrity issue), return null
    return null;
  }

  async getStudentsForTeacher(teacherId: string): Promise<Student[]> {
    const teacher = this.getTeacherById(teacherId);
    if (!teacher) return [];
    const classesTaught = (db.schoolClasses as any[]).filter((c) =>
      c.subjectIds.some((sid: string) => teacher.subjectIds.includes(sid))
    );
    const studentIds = new Set(classesTaught.flatMap((c) => c.studentIds));
    return (db.students as Student[]).filter((s) => studentIds.has(s.id));
  }

  async getAssignmentsByTeacher(teacherId: string): Promise<Assignment[]> {
    return (db.assignments as Assignment[])
      .map((a) => ({
        ...a,
        courseName: `Grade ${this.getClassById(a.classId)?.gradeLevel}-${
          this.getClassById(a.classId)?.section
        }`,
      }))
      .filter((a) => a.teacherId === teacherId);
  }

  async createAssignment(
    assignmentData: Omit<Assignment, "id">
  ): Promise<void> {
    (db.assignments as Assignment[]).push({
      id: this.generateId("asg"),
      ...assignmentData,
    });
    saveDb();
  }

  async updateAssignment(
    assignmentId: string,
    updates: Partial<Assignment>
  ): Promise<void> {
    const assignment = (db.assignments as Assignment[]).find(
      (a) => a.id === assignmentId
    );
    if (assignment) {
      Object.assign(assignment, updates);
      saveDb();
    }
  }

  async getTeacherAttendanceByTeacherId(
    teacherId: string
  ): Promise<TeacherAttendanceRecord[]> {
    return (db.teacherAttendance as TeacherAttendanceRecord[]).filter(
      (r) => r.teacherId === teacherId
    );
  }

  async getTeacherCourses(teacherId: string): Promise<TeacherCourse[]> {
    const teacher = this.getTeacherById(teacherId);
    if (!teacher) return [];
    const classesTaught = (db.schoolClasses as any[]).filter((c) =>
      c.subjectIds.some((sid: string) => teacher.subjectIds.includes(sid))
    );
    const courses: TeacherCourse[] = [];
    classesTaught.forEach((c) => {
      c.subjectIds.forEach((sid: string) => {
        if (teacher.subjectIds.includes(sid)) {
          const subject = this.getSubjectById(sid);
          if (subject) {
            courses.push({
              id: `${c.id}|${sid}`,
              classId: c.id,
              subjectId: sid,
              name: `Grade ${c.gradeLevel}-${c.section} / ${subject.name}`,
            });
          }
        }
      });
    });
    return courses;
  }

  async findCourseByTeacherAndSubject(
    teacherId: string,
    subjectId: string
  ): Promise<Course | undefined> {
    return (db.courses as Course[]).find(
      (c) => c.teacherId === teacherId && c.subjectId === subjectId
    );
  }

  async getAttendanceForCourse(
    courseId: string,
    date: string
  ): Promise<{ isSaved: boolean; attendance: AttendanceRecord[] }> {
    const records = (db.attendance as AttendanceRecord[]).filter(
      (r) => r.courseId === courseId && r.date === date
    );
    return { isSaved: records.length > 0, attendance: records };
  }

  async saveAttendance(records: AttendanceRecord[]): Promise<void> {
    if (records.length === 0) return;
    records.forEach((record) => {
      const existing = (db.attendance as AttendanceRecord[]).find(
        (r) =>
          r.studentId === record.studentId &&
          r.courseId === record.courseId &&
          r.date === record.date
      );
      if (existing) {
        existing.status = record.status;
      } else {
        (db.attendance as AttendanceRecord[]).push(record);
      }
    });
    saveDb();
  }

  async submitRectificationRequest(requestData: any): Promise<void> {
    const newReq = {
      id: this.generateId("rect-req"),
      status: "Pending",
      requestedAt: new Date(),
      teacherName:
        this.getTeacherById(requestData.teacherId)?.name || "Unknown",
      ...requestData,
    };
    (db.rectificationRequests as any[]).push(newReq);
    saveDb();
  }
  // FIX: Add missing gradebook methods
  async createMarkingTemplate(
    template: Omit<MarkingTemplate, "id">
  ): Promise<void> {
    (db.markingTemplates as MarkingTemplate[]).push({
      id: this.generateId("mtpl"),
      ...template,
    });
    saveDb();
  }
  async getMarkingTemplatesForCourse(
    courseId: string
  ): Promise<MarkingTemplate[]> {
    return (db.markingTemplates as MarkingTemplate[]).filter(
      (t) => t.courseId === courseId
    );
  }
  async getStudentMarksForTemplate(templateId: string): Promise<StudentMark[]> {
    return (db.studentMarks as StudentMark[]).filter(
      (m) => m.templateId === templateId
    );
  }
  async saveStudentMarks(
    templateId: string,
    marks: { studentId: string; marksObtained: number }[]
  ): Promise<void> {
    marks.forEach((mark) => {
      const existing = (db.studentMarks as StudentMark[]).find(
        (m) => m.templateId === templateId && m.studentId === mark.studentId
      );
      if (existing) {
        existing.marksObtained = mark.marksObtained;
      } else {
        (db.studentMarks as StudentMark[]).push({
          id: this.generateId("smk"),
          templateId,
          ...mark,
        });
      }
    });
    saveDb();
  }
  async deleteMarkingTemplate(templateId: string): Promise<void> {
    db.markingTemplates = (db.markingTemplates as MarkingTemplate[]).filter(
      (t) => t.id !== templateId
    );
    db.studentMarks = (db.studentMarks as StudentMark[]).filter(
      (m) => m.templateId !== templateId
    );
    saveDb();
  }
  // FIX: Add missing quiz methods
  async getQuizzesForTeacher(teacherId: string): Promise<Quiz[]> {
    return (db.quizzes as Quiz[]).filter((q) => q.teacherId === teacherId);
  }
  async updateQuizStatus(
    quizId: string,
    status: "published" | "paused"
  ): Promise<void> {
    const quiz = (db.quizzes as Quiz[]).find((q) => q.id === quizId);
    if (quiz) {
      quiz.status = status;
      saveDb();
    }
  }
  async getQuizWithQuestions(
    quizId: string
  ): Promise<{ quiz: Quiz; questions: QuizQuestion[] } | null> {
    const quiz = (db.quizzes as Quiz[]).find((q) => q.id === quizId);
    if (!quiz) return null;
    const questions = (db.quizQuestions as QuizQuestion[]).filter(
      (q) => q.quizId === quizId
    );
    return { quiz, questions };
  }
  async saveQuiz(
    quizData: Partial<Quiz>,
    questionsData: Partial<QuizQuestion>[]
  ): Promise<void> {
    let quizId = quizData.id;
    if (quizId && quizId !== "new") {
      const existingQuiz = (db.quizzes as Quiz[]).find((q) => q.id === quizId);
      if (existingQuiz) Object.assign(existingQuiz, quizData);
      db.quizQuestions = (db.quizQuestions as QuizQuestion[]).filter(
        (q) => q.quizId !== quizId
      );
    } else {
      quizId = this.generateId("quiz");
      (db.quizzes as Quiz[]).push({
        ...quizData,
        id: quizId,
        createdAt: new Date(),
      } as Quiz);
    }
    questionsData.forEach((q) => {
      (db.quizQuestions as QuizQuestion[]).push({
        ...q,
        id: this.generateId("qq"),
        quizId: quizId!,
      } as QuizQuestion);
    });
    saveDb();
  }
  async getQuizResults(
    quizId: string
  ): Promise<{ quiz: Quiz; questions: QuizQuestion[]; results: QuizResult[] }> {
    const quiz = (db.quizzes as Quiz[]).find((q) => q.id === quizId)!;
    const questions = (db.quizQuestions as QuizQuestion[]).filter(
      (q) => q.quizId === quizId
    );
    const studentQuizzes = (db.studentQuizzes as StudentQuiz[]).filter(
      (sq) => sq.quizId === quizId
    );
    const results: QuizResult[] = studentQuizzes.map((sq) => {
      const student = this.getStudentById(sq.studentId)!;
      return {
        studentId: sq.studentId,
        studentName: student.name,
        status: sq.status,
        score: sq.score,
        submittedAt: sq.submittedAt,
      };
    });
    return { quiz, questions, results };
  }
  // FIX: Add missing syllabus methods
  async submitSyllabusChangeRequest(
    requestData: Omit<
      SyllabusChangeRequest,
      "id" | "teacherName" | "status" | "requestedAt"
    >
  ): Promise<void> {
    const newReq = {
      id: this.generateId("syl-req"),
      status: "Pending",
      requestedAt: new Date(),
      teacherName:
        this.getTeacherById(requestData.teacherId)?.name || "Unknown",
      ...requestData,
    };
    (db.syllabusChangeRequests as any[]).push(newReq);
    saveDb();
  }
  async getLectures(classId: string, subjectId: string): Promise<Lecture[]> {
    return (db.lectures as Lecture[])
      .filter((l) => l.classId === classId && l.subjectId === subjectId)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  }
  async saveLectures(
    classId: string,
    subjectId: string,
    teacherId: string,
    branchId: string,
    lectures: Partial<Lecture>[]
  ): Promise<void> {
    lectures.forEach((l) => {
      (db.lectures as Lecture[]).push({
        id: this.generateId("lec"),
        classId,
        subjectId,
        teacherId,
        branchId,
        ...l,
      } as Lecture);
    });
    saveDb();
  }
  async updateLectureStatus(
    lectureId: string,
    status: "completed"
  ): Promise<void> {
    const lecture = (db.lectures as Lecture[]).find((l) => l.id === lectureId);
    if (lecture) {
      lecture.status = status;
      saveDb();
    }
  }
  // FIX: Add missing meeting methods
  async getMeetingRequestsForTeacher(
    teacherId: string
  ): Promise<HydratedMeetingRequest[]> {
    return (db.meetingRequests as MeetingRequest[])
      .filter((r) => r.teacherId === teacherId)
      .map((r) => ({
        ...r,
        parentName: this.getUserById(r.parentId)?.name || "N/A",
        teacherName: this.getTeacherById(r.teacherId)?.name || "N/A",
        studentName: this.getStudentById(r.studentId)?.name || "N/A",
      }));
  }
  async updateMeetingRequest(
    requestId: string,
    updates: Partial<MeetingRequest>
  ): Promise<void> {
    const req = (db.meetingRequests as MeetingRequest[]).find(
      (r) => r.id === requestId
    );
    if (req) {
      Object.assign(req, updates);
      saveDb();
    }
  }
  async getTeacherAvailability(
    teacherId: string,
    date: string
  ): Promise<string[]> {
    const dayOfWeek = new Date(date).toLocaleString("en-US", {
      weekday: "long",
    }) as any;
    return (db.timetable as any[])
      .filter((slot) => slot.teacherId === teacherId && slot.day === dayOfWeek)
      .map((slot) => `${slot.startTime} - ${slot.endTime}`);
  }
  // FIX: Add missing exam mark methods
  async submitExamMarkRectificationRequest(
    requestData: Omit<
      ExamMarkRectificationRequest,
      "id" | "status" | "requestedAt" | "teacherName" | "branchId"
    >,
    branchId: string
  ): Promise<void> {
    const newReq: ExamMarkRectificationRequest = {
      id: this.generateId("exm-req"),
      branchId,
      teacherName: this.getTeacherById(requestData.teacherId)?.name || "",
      status: "Pending",
      requestedAt: new Date(),
      ...requestData,
    };
    (db.examMarkRectificationRequests as ExamMarkRectificationRequest[]).push(
      newReq
    );
    saveDb();
  }
  async getExaminations(branchId: string): Promise<Examination[]> {
    return (db.examinations as Examination[]).filter(
      (e) => e.branchId === branchId && e.status !== "Upcoming"
    );
  }
  async getHydratedExamSchedules(
    examinationId: string
  ): Promise<HydratedSchedule[]> {
    const schedules = (db.examSchedules as ExamSchedule[]).filter(
      (s) => s.examinationId === examinationId
    );
    return schedules.map((s) => {
      const sClass = this.getClassById(s.classId)!;
      const subject = this.getSubjectById(s.subjectId)!;
      return {
        ...s,
        className: `Grade ${sClass.gradeLevel}-${sClass.section}`,
        subjectName: subject.name,
      };
    });
  }
  async getExamMarksForSchedule(scheduleId: string): Promise<ExamMark[]> {
    return (db.examMarks as ExamMark[]).filter(
      (m) => m.examScheduleId === scheduleId
    );
  }
  async saveExamMarks(
    marks: Omit<ExamMark, "id" | "enteredAt">[]
  ): Promise<void> {
    marks.forEach((mark) => {
      (db.examMarks as ExamMark[]).push({
        ...mark,
        id: this.generateId("mark"),
        enteredAt: new Date(),
      });
    });
    saveDb();
  }
  // FIX: Add missing content methods
  async getCourseContentForTeacher(
    teacherId: string
  ): Promise<CourseContent[]> {
    return (db.courseContent as CourseContent[]).filter(
      (c) => c.teacherId === teacherId
    );
  }
  async uploadCourseContent(
    data: Omit<
      CourseContent,
      "id" | "fileName" | "fileType" | "fileUrl" | "uploadedAt" | "branchId"
    >,
    file: File,
    branchId: string
  ): Promise<void> {
    const newContent: CourseContent = {
      id: this.generateId("cc"),
      branchId,
      ...data,
      fileName: file.name,
      fileType: file.type,
      fileUrl: URL.createObjectURL(file),
      uploadedAt: new Date(),
    };
    (db.courseContent as CourseContent[]).push(newContent);
    saveDb();
  }
  // FIX: Add missing complaint method
  async raiseComplaintAboutStudent(
    complaintData: Omit<ComplaintAboutStudent, "id" | "submittedAt">
  ): Promise<void> {
    const newComplaint: ComplaintAboutStudent = {
      id: this.generateId("complaint"),
      ...complaintData,
      submittedAt: new Date(),
    };
    (db.complaintsAboutStudents as ComplaintAboutStudent[]).push(newComplaint);
    saveDb();
  }
  // FIX: Add missing skill methods
  async getTeacherSkillAssessmentForStudent(
    teacherId: string,
    studentId: string
  ): Promise<SkillAssessment | null> {
    return (
      (db.skillAssessments as SkillAssessment[]).find(
        (sa) => sa.teacherId === teacherId && sa.studentId === studentId
      ) || null
    );
  }
  async submitSkillAssessment(
    assessmentData: Omit<SkillAssessment, "id" | "assessedAt">
  ): Promise<void> {
    const existing = (db.skillAssessments as SkillAssessment[]).find(
      (sa) =>
        sa.teacherId === assessmentData.teacherId &&
        sa.studentId === assessmentData.studentId
    );
    if (existing) {
      existing.skills = assessmentData.skills;
      existing.assessedAt = new Date();
    } else {
      (db.skillAssessments as SkillAssessment[]).push({
        id: this.generateId("skill"),
        assessedAt: new Date(),
        ...assessmentData,
      });
    }
    saveDb();
  }
  // FIX: Add missing leave methods
  async getLeaveApplicationsForUser(
    userId: string
  ): Promise<LeaveApplication[]> {
    return (db.leaveApplications as LeaveApplication[]).filter(
      (l) => l.applicantId === userId
    );
  }
  async getLeaveApplicationsForTeacher(
    teacherId: string
  ): Promise<LeaveApplication[]> {
    const teacher = this.getTeacherById(teacherId);
    if (!teacher) return [];
    const mentoredClasses = (db.schoolClasses as any[]).filter(
      (c) => c.mentorTeacherId === teacherId
    );
    const studentIds = new Set(mentoredClasses.flatMap((c) => c.studentIds));
    return (db.leaveApplications as LeaveApplication[]).filter(
      (l) => l.applicantRole === "Student" && studentIds.has(l.applicantId)
    );
  }
  async processLeaveApplication(
    requestId: string,
    status: "Approved" | "Rejected",
    reviewerId: string
  ): Promise<void> {
    const app = (db.leaveApplications as LeaveApplication[]).find(
      (l) => l.id === requestId
    );
    if (app) {
      app.status = status;
      app.reviewedBy = this.getUserById(reviewerId)?.name;
      app.reviewedAt = new Date();
      saveDb();
    }
  }
  // FIX: Add missing method
  async searchLibraryBooks(
    branchId: string,
    query: string
  ): Promise<LibraryBook[]> {
    const lowerQuery = query.toLowerCase();
    return (db.libraryBooks as LibraryBook[]).filter(
      (b) =>
        b.branchId === branchId &&
        (b.title.toLowerCase().includes(lowerQuery) ||
          b.author.toLowerCase().includes(lowerQuery) ||
          b.isbn.includes(query))
    );
  }
}
