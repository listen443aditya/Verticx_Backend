// services/studentApiService.ts
import { db, saveDb } from "./database";
import type {
  Student,
  StudentDashboardData,
  AttendanceRecord,
  GradeWithCourse,
  CourseContent,
  StudentQuiz,
  Quiz,
  QuizQuestion,
  LecturePlan,
  TeacherFeedback,
  TeacherComplaint,
  ComplaintAboutStudent,
  StudentProfile,
  FeePayment,
  FeeAdjustment,
  FeeHistoryItem,
  TimetableSlot,
  TimetableConfig,
  Assignment,
  BookIssuance,
  SchoolEvent,
  TransportRoute,
  Hostel,
  Room,
  FeeRecord,
  LeaveApplication,
  LibraryBook,
  MonthlyFee,
  MonthlyDue,
  Branch,
  Grade,
  StudentSyllabusProgress,
} from "../types/api";
import { BaseApiService } from "./baseApiService";

const SKILL_LIST = [
  "Problem Solving",
  "Creativity",
  "Teamwork",
  "Leadership",
  "Communication",
];

const ACADEMIC_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export class StudentApiService extends BaseApiService {
  // Helper to calculate overall marks for any student
  private calculateOverallMarksPercentage(studentId: string): number {
    const studentGrades = (db.grades as Grade[]).filter(
      (g) => g.studentId === studentId
    );
    if (studentGrades.length === 0) return 0;
    const totalScore = studentGrades.reduce((acc, g) => acc + g.score, 0);
    return totalScore / studentGrades.length;
  }

  async getStudentDashboardData(
    studentId: string
  ): Promise<StudentDashboardData> {
    await this.delay(400);
    const profileDetails = await this.getStudentProfileDetails(studentId);
    if (!profileDetails) throw new Error("Student not found");

    const student = profileDetails.student;
    const branch = (await this.getBranchById(student.branchId)) as Branch;
    const classId = student.classId;
    const sClass = classId ? this.getClassById(classId) : null;
    const mentorId = sClass?.mentorTeacherId;
    const mentor = mentorId ? this.getTeacherById(mentorId) : null;

    const announcements = (db.announcements as any[])
      .filter(
        (a) =>
          a.branchId === student.branchId &&
          (a.audience === "All" || a.audience === "Students")
      )
      .slice(0, 3);

    const examSchedule = (db.examSchedules as any[])
      .filter((es) => es.classId === classId)
      .map((es) => ({
        ...es,
        subjectName: this.getSubjectById(es.subjectId)?.name || "Unknown",
      }));

    const overallMarksPercentage =
      this.calculateOverallMarksPercentage(studentId);

    // --- Real Rank Calculation ---
    let classRank = 0;
    let schoolRank = 0;

    if (sClass) {
      const classStudents = await this.getStudentsForClass(sClass.id);
      const classPerformances = classStudents
        .map((s) => ({
          studentId: s.id,
          score: this.calculateOverallMarksPercentage(s.id),
        }))
        .sort((a, b) => b.score - a.score);
      classRank =
        classPerformances.findIndex((p) => p.studentId === studentId) + 1;
    }

    const schoolStudents = await this.getStudentsByBranch(student.branchId);
    const schoolPerformances = schoolStudents
      .map((s) => ({
        studentId: s.id,
        score: this.calculateOverallMarksPercentage(s.id),
      }))
      .sort((a, b) => b.score - a.score);
    schoolRank =
      schoolPerformances.findIndex((p) => p.studentId === studentId) + 1;

    // --- Real Class Average Calculation ---
    const performanceWithAverages = profileDetails.grades.map((g) => {
      const allGradesForCourse = (db.grades as Grade[]).filter(
        (grade) => grade.courseId === g.courseId
      );
      const classAverage =
        allGradesForCourse.length > 0
          ? allGradesForCourse.reduce((acc, grade) => acc + grade.score, 0) /
            allGradesForCourse.length
          : 0;
      return { subject: g.courseName, score: g.score, classAverage };
    });

    // --- Enhanced Fee Calculation Logic ---
    const feeRecord = (db.feeRecords as FeeRecord[]).find(
      (f) => f.studentId === studentId
    );
    const feeTemplate = sClass?.feeTemplateId
      ? (db.feeTemplates as any[]).find((ft) => ft.id === sClass.feeTemplateId)
      : null;

    const totalAnnualFee = feeRecord?.totalAmount || 0;
    const totalPaid = feeRecord?.paidAmount || 0;
    const previousSessionDues = feeRecord?.previousSessionDues || 0;
    let paidTracker = totalPaid;

    // First, account for previous session dues
    const previousDuesPaid = Math.min(paidTracker, previousSessionDues);
    paidTracker -= previousDuesPaid;

    let monthlyDues: MonthlyDue[] = [];
    let currentMonthDue = 0;

    if (feeTemplate?.monthlyBreakdown) {
      const sessionStartMonth = new Date(
        branch.academicSessionStartDate || "2024-04-01"
      ).getMonth();
      const academicYearMonths = [
        ...ACADEMIC_MONTHS.slice(sessionStartMonth),
        ...ACADEMIC_MONTHS.slice(0, sessionStartMonth),
      ];
      const currentRealMonth = new Date().getMonth();

      monthlyDues = academicYearMonths.map((monthName, index) => {
        const templateMonthDetail = feeTemplate.monthlyBreakdown.find(
          (m: MonthlyFee) => m.month === monthName
        );
        const monthTotal = templateMonthDetail?.total || 0;

        const monthIndex = ACADEMIC_MONTHS.indexOf(monthName);
        const year =
          monthIndex < sessionStartMonth
            ? new Date().getFullYear() + 1
            : new Date().getFullYear();

        const paidForMonth = Math.min(paidTracker, monthTotal);
        paidTracker -= paidForMonth;
        const balance = monthTotal - paidForMonth;

        let status: "Paid" | "Partially Paid" | "Due" = "Due";
        if (balance <= 0) status = "Paid";
        else if (paidForMonth > 0) status = "Partially Paid";

        if (monthIndex === currentRealMonth) {
          currentMonthDue = monthTotal;
        }

        return {
          month: monthName,
          year,
          total: monthTotal,
          paid: paidForMonth,
          balance,
          status,
        };
      });
    }

    const totalOutstanding = totalAnnualFee - totalPaid;
    const today = new Date();
    const dueDate = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      10
    ).toLocaleDateString();

    // --- Enhanced Self Study Progress Calculation ---
    const studentLectures = await this.getLecturesForStudent(studentId);
    const allClassLectures = studentLectures.flatMap((plan) => plan.lectures);
    const totalLectures = allClassLectures.length;
    const teacherCompletedLectures = allClassLectures.filter(
      (l) => l.status === "completed"
    ).length;
    const completedLectureIds = await this.getStudentSelfStudyProgress(
      studentId
    );
    const studentCompletedLectures = completedLectureIds.length;

    const selfStudyProgress = {
      totalLectures,
      studentCompletedLectures,
      teacherCompletedLectures,
    };

    return {
      student,
      branch,
      branchId: student.branchId,
      profile: {
        id: student.id,
        name: student.name,
        class: profileDetails.classInfo,
        classId: student.classId,
        rollNo: student.rollNo,
        profilePictureUrl: student.profilePictureUrl,
        mentor: { name: mentor?.name || "Not Assigned", email: mentor?.email },
      },
      performance: performanceWithAverages,
      ranks: { class: classRank, school: schoolRank },
      attendance: {
        monthlyPercentage:
          (profileDetails.attendance.present /
            (profileDetails.attendance.total || 1)) *
          100,
        history: profileDetails.attendanceHistory,
      },
      assignments: {
        pending: (db.assignments as Assignment[]).filter(
          (a) => a.classId === classId
        ),
        graded: [],
      },
      library: {
        issuedBooks: (db.bookIssuances as BookIssuance[])
          .filter((i) => i.memberId === studentId && !i.returnedDate)
          .map((i) => ({ ...i, bookTitle: this.getBookTitle(i.bookId) })),
      },
      fees: {
        totalOutstanding,
        dueDate,
        currentMonthDue,
        monthlyDues,
        previousSessionDues,
        totalAnnualFee,
        totalPaid,
        previousSessionDuesPaid: previousDuesPaid,
      },
      events: (db.schoolEvents as SchoolEvent[]).filter(
        (e) => e.branchId === student.branchId
      ),
      announcements,
      aiSuggestion:
        "Focus on improving your scores in History by reviewing class notes.",
      timetable: (db.timetable as TimetableSlot[]).filter(
        (t) => t.classId === classId
      ),
      timetableConfig:
        (db.timetableConfigs as TimetableConfig[]).find(
          (tc) => tc.classId === classId
        ) || null,
      examSchedule,
      overallMarksPercentage,
      skills: profileDetails.skills,
      monthlyFeeBreakdown: feeTemplate?.monthlyBreakdown,
      selfStudyProgress,
    };
  }

  async updateStudent(
    studentId: string,
    updates: Partial<Student>
  ): Promise<void> {
    const student = this.getStudentById(studentId);
    if (student) {
      Object.assign(student, updates);
      saveDb();
    }
  }

  async recordFeePayment(paymentResponse: any): Promise<void> {
    await this.delay(500);
    const { razorpay_payment_id, notes } = paymentResponse;
    const { studentId, amountPaid, paidMonths, previousDuesPaid } = notes;

    const feeRecord = (db.feeRecords as FeeRecord[]).find(
      (fr) => fr.studentId === studentId
    );
    if (feeRecord) {
      feeRecord.paidAmount += amountPaid;

      if (previousDuesPaid > 0 && feeRecord.previousSessionDues) {
        feeRecord.previousSessionDues = Math.max(
          0,
          feeRecord.previousSessionDues - previousDuesPaid
        );
      }

      const payment: FeePayment = {
        id: this.generateId("pay"),
        studentId,
        amount: amountPaid,
        paidDate: new Date().toISOString().split("T")[0],
        transactionId: razorpay_payment_id,
        details: `Online payment for ${paidMonths.join(", ")}`,
      };
      (db.feePayments as FeePayment[]).push(payment);
      saveDb();
    } else {
      throw new Error("Could not find fee record to update.");
    }
  }

  async payStudentFees(
    studentId: string,
    amount: number,
    details: string
  ): Promise<void> {
    await this.delay(1000);
    const feeRecord = (db.feeRecords as FeeRecord[]).find(
      (fr) => fr.studentId === studentId
    );
    if (feeRecord) {
      const payment: FeePayment = {
        id: this.generateId("pay"),
        studentId,
        amount,
        details,
        paidDate: new Date().toISOString().split("T")[0],
        transactionId: this.generateId("txn"),
      };
      (db.feePayments as FeePayment[]).push(payment);

      feeRecord.paidAmount += amount;

      saveDb();
    } else {
      throw new Error("Fee record not found for student.");
    }
  }

  async getStudentAttendance(studentId: string): Promise<AttendanceRecord[]> {
    return (db.attendance as AttendanceRecord[]).filter(
      (a) => a.studentId === studentId
    );
  }

  async getLeaveApplicationsForUser(
    userId: string
  ): Promise<LeaveApplication[]> {
    return (db.leaveApplications as LeaveApplication[]).filter(
      (l) => l.applicantId === userId
    );
  }

  async getStudentGrades(studentId: string): Promise<GradeWithCourse[]> {
    return (db.grades as GradeWithCourse[])
      .filter((g) => g.studentId === studentId)
      .map((g) => ({ ...g, courseName: this.getCourseNameById(g.courseId) }));
  }

  async getCourseContentForStudent(
    studentId: string
  ): Promise<CourseContent[]> {
    const student = this.getStudentById(studentId);
    if (!student || !student.classId) return [];
    const sClass = this.getClassById(student.classId);
    if (!sClass) return [];
    const courseIds = new Set(
      (db.courses as any[])
        .filter((c) => sClass.subjectIds.includes(c.subjectId))
        .map((c) => c.id)
    );
    return (db.courseContent as CourseContent[]).filter((cc) =>
      courseIds.has(cc.courseId)
    );
  }

  async getAvailableQuizzesForStudent(
    studentId: string
  ): Promise<(StudentQuiz & { quizTitle: string })[]> {
    const studentQuizzes = (db.studentQuizzes as StudentQuiz[]).filter(
      (sq) => sq.studentId === studentId && sq.status === "pending"
    );
    return studentQuizzes.map((sq) => {
      const quiz = (db.quizzes as Quiz[]).find((q) => q.id === sq.quizId)!;
      return { ...sq, quizTitle: quiz.title };
    });
  }

  async getStudentQuizForAttempt(studentQuizId: string): Promise<{
    studentQuiz: StudentQuiz;
    quiz: Quiz;
    questions: QuizQuestion[];
  } | null> {
    const studentQuiz = (db.studentQuizzes as StudentQuiz[]).find(
      (sq) => sq.id === studentQuizId
    );
    if (!studentQuiz) return null;
    const quiz = (db.quizzes as Quiz[]).find(
      (q) => q.id === studentQuiz.quizId
    );
    if (!quiz) return null;
    const questions = (db.quizQuestions as QuizQuestion[]).filter((q) =>
      studentQuiz.assignedQuestionIds.includes(q.id)
    );
    return { studentQuiz, quiz, questions };
  }

  async submitStudentQuiz(
    studentQuizId: string,
    answers: { questionId: string; selectedOptionIndex: number }[]
  ): Promise<void> {
    const studentQuiz = (db.studentQuizzes as StudentQuiz[]).find(
      (sq) => sq.id === studentQuizId
    );
    if (!studentQuiz) return;
    let correctCount = 0;
    answers.forEach((answer) => {
      (db.studentAnswers as any[]).push({
        id: this.generateId("sa"),
        studentQuizId,
        ...answer,
      });
      const question = (db.quizQuestions as QuizQuestion[]).find(
        (q) => q.id === answer.questionId
      );
      if (
        question &&
        question.correctOptionIndex === answer.selectedOptionIndex
      ) {
        correctCount++;
      }
    });
    studentQuiz.status = "completed";
    studentQuiz.score = (correctCount / answers.length) * 100;
    studentQuiz.submittedAt = new Date();
    saveDb();
  }

  async getLecturesForStudent(studentId: string): Promise<LecturePlan[]> {
    const student = this.getStudentById(studentId);
    if (!student || !student.classId) return [];
    const sClass = this.getClassById(student.classId)!;
    const plans: LecturePlan[] = [];
    for (const subjectId of sClass.subjectIds) {
      const subject = this.getSubjectById(subjectId)!;
      const lectures = (db.lectures as any[]).filter(
        (l) => l.classId === sClass.id && l.subjectId === subjectId
      );
      plans.push({ subjectName: subject.name, lectures });
    }
    return plans;
  }

  async getStudentFeedbackHistory(
    studentId: string
  ): Promise<TeacherFeedback[]> {
    return (db.teacherFeedback as TeacherFeedback[]).filter(
      (f) => f.studentId === studentId
    );
  }

  async submitTeacherFeedback(
    feedbackData: Omit<TeacherFeedback, "id" | "feedbackDate">
  ): Promise<void> {
    const newFeedback: TeacherFeedback = {
      id: this.generateId("tf"),
      feedbackDate: new Date(),
      ...feedbackData,
    };
    (db.teacherFeedback as TeacherFeedback[]).push(newFeedback);
    saveDb();
  }

  async getComplaintsByStudent(studentId: string): Promise<TeacherComplaint[]> {
    return (db.teacherComplaints as TeacherComplaint[]).filter(
      (c) => c.studentId === studentId
    );
  }

  async resolveStudentComplaint(complaintId: string): Promise<void> {
    const complaint = (db.teacherComplaints as TeacherComplaint[]).find(
      (c) => c.id === complaintId
    );
    if (complaint) {
      complaint.status = "Resolved by Student";
      complaint.resolvedAt = new Date();
      saveDb();
    }
  }

  async getComplaintsAboutStudent(
    studentId: string
  ): Promise<ComplaintAboutStudent[]> {
    return (db.complaintsAboutStudents as ComplaintAboutStudent[]).filter(
      (c) => c.studentId === studentId
    );
  }

  async submitTeacherComplaint(
    complaintData: Omit<
      TeacherComplaint,
      "id" | "submittedAt" | "branchId" | "studentName" | "teacherName"
    >
  ): Promise<void> {
    const student = this.getStudentById(complaintData.studentId)!;
    const teacher = complaintData.teacherId
      ? this.getTeacherById(complaintData.teacherId)
      : null;
    const newComplaint: TeacherComplaint = {
      id: this.generateId("tc"),
      branchId: student.branchId,
      studentName: student.name,
      teacherName: teacher?.name,
      ...complaintData,
      submittedAt: new Date(),
    };
    (db.teacherComplaints as TeacherComplaint[]).push(newComplaint);
    saveDb();
  }

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

  async getFeeRecordForStudent(studentId: string): Promise<FeeRecord | null> {
    return (
      (db.feeRecords as FeeRecord[]).find((fr) => fr.studentId === studentId) ||
      null
    );
  }

  async getStudentSelfStudyProgress(studentId: string): Promise<string[]> {
    await this.delay(50);
    return (db.studentSyllabusProgress as StudentSyllabusProgress[])
      .filter((p) => p.studentId === studentId)
      .map((p) => p.lectureId);
  }

  async updateStudentSelfStudyProgress(
    studentId: string,
    lectureId: string,
    isCompleted: boolean
  ): Promise<void> {
    await this.delay(100);
    const progress = db.studentSyllabusProgress as StudentSyllabusProgress[];
    const existingIndex = progress.findIndex(
      (p) => p.studentId === studentId && p.lectureId === lectureId
    );

    if (isCompleted && existingIndex === -1) {
      progress.push({
        id: `${studentId}-${lectureId}`,
        studentId,
        lectureId,
        completedAt: new Date(),
      });
    } else if (!isCompleted && existingIndex > -1) {
      progress.splice(existingIndex, 1);
    }
    saveDb();
  }
}
