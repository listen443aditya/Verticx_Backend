// services/principalApiService.ts
import { db, saveDb } from './database';
import type { User, Teacher, FacultyApplication, TeacherProfile, FeeRecord, SchoolClass, Subject, Branch, PrincipalDashboardData, SchoolEvent, FeeRectificationRequest, TeacherAttendanceRectificationRequest, TeacherAttendanceRecord, LeaveApplication, ComplaintAboutStudent, TeacherComplaint, FeeAdjustment, Student, Announcement, SmsMessage, Examination, StudentWithExamMarks, SuspensionRecord, AttendanceRecord, ExamMark, PrincipalAttendanceOverview, TeacherAttendanceStatus, PrincipalFinancialsOverview, ClassFeeSummary, ManualExpense, PayrollStaffDetails, ManualSalaryAdjustment, PayrollRecord, Grade, Lecture, UserRole, FeeTemplate, Course, RectificationRequest, Hostel, ErpPayment, PrincipalQuery, ErpFinancials, FeePayment } from '../types/api';
import { BaseApiService, generateUniqueId } from './baseApiService';
import { geminiService } from './geminiService';
import { RegistrarApiService } from './registrarApiService';
import prisma from "../prisma";


export class PrincipalApiService extends BaseApiService {
  private getHostelById = (id: string): Hostel | undefined =>
    (db.hostels as Hostel[]).find((h) => h.id === id);

  private calculateStudentAverage(studentId: string): number {
    const studentGrades = (db.grades as Grade[]).filter(
      (g) => g.studentId === studentId
    );
    if (studentGrades.length === 0) return 0;
    return (
      studentGrades.reduce((acc, g) => acc + g.score, 0) / studentGrades.length
    );
  }

  async requestProfileAccessOtp(principalId: string): Promise<void> {
    await this.delay(300);
    const user = this.getUserById(principalId);
    if (user) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      user.profileAccessOtp = otp;
      saveDb();
      console.log(
        `[SECURITY] School Profile Access OTP for ${user.name}: ${otp}`
      );
    } else {
      throw new Error("User not found.");
    }
  }

  async verifyProfileAccessOtp(
    principalId: string,
    otp: string
  ): Promise<boolean> {
    await this.delay(500);
    const user = this.getUserById(principalId);
    if (user && user.profileAccessOtp === otp) {
      delete user.profileAccessOtp; // One-time use
      saveDb();
      return true;
    }
    return false;
  }

  async updateBranchDetails(
    branchId: string,
    updates: Partial<Branch>
  ): Promise<void> {
    await this.delay(500);
    const branch = (db.branches as Branch[]).find((b) => b.id === branchId);
    if (branch) {
      Object.assign(branch, updates);
      saveDb();
    }
  }

  async getPrincipalDashboardData(
    branchId: string
  ): Promise<PrincipalDashboardData> {
    await this.delay(500);
    const branch = await this.getBranchById(branchId);
    const classes = (db.schoolClasses as SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
    const students = (db.students as Student[]).filter(
      (s) => s.branchId === branchId
    );
    const feeRecords = (db.feeRecords as FeeRecord[]).filter(
      (fr) => this.getStudentById(fr.studentId)?.branchId === branchId
    );

    const summary = {
      totalStudents: branch?.stats.students || 0,
      totalTeachers: branch?.stats.teachers || 0,
      totalClasses: classes.length,
      feesCollected: feeRecords.reduce((acc, fr) => acc + fr.paidAmount, 0),
      feesPending: feeRecords.reduce(
        (acc, fr) => acc + (fr.totalAmount - fr.paidAmount),
        0
      ),
      erpPricePerStudent: branch?.erpPricePerStudent,
    };
    const classPerformance = classes.map((c) => {
      const studentIds = c.studentIds;
      if (studentIds.length === 0)
        return { name: `Grade ${c.gradeLevel}-${c.section}`, performance: 0 };
      const totalScore = studentIds.reduce(
        (sum, id) => sum + this.calculateStudentAverage(id),
        0
      );
      return {
        name: `Grade ${c.gradeLevel}-${c.section}`,
        performance: totalScore / studentIds.length,
      };
    });

    // --- Enhanced Teacher Performance Calculation ---
    const teachers = await this.getStaffByBranch(branchId).then(
      (staff) => staff.filter((s) => s.role === "Teacher") as Teacher[]
    );
    const teacherPerformanceData = teachers.map((t) => {
      const teacherAttendance = (
        db.teacherAttendance as TeacherAttendanceRecord[]
      ).filter((rec) => rec.teacherId === t.id);
      const workingDays = teacherAttendance.length;
      const presentDays = teacherAttendance.filter(
        (r) => r.status === "Present" || r.status === "Half Day"
      ).length;
      const attendanceScore =
        workingDays > 0 ? (presentDays / workingDays) * 100 : 100;
      const teacherLectures = (db.lectures as Lecture[]).filter(
        (l) => l.teacherId === t.id
      );
      const totalLectures = teacherLectures.length;
      const completedLectures = teacherLectures.filter(
        (l) => l.status === "completed"
      ).length;
      const syllabusScore =
        totalLectures > 0 ? (completedLectures / totalLectures) * 100 : 100;
      const studentIdsTaught = new Set(
        (db.schoolClasses as SchoolClass[])
          .filter((c) => c.subjectIds.some((sid) => t.subjectIds.includes(sid)))
          .flatMap((c) => c.studentIds)
      );
      let totalStudentScore = 0;
      let studentsWithScores = 0;
      studentIdsTaught.forEach((sid) => {
        const avg = this.calculateStudentAverage(sid);
        if (avg > 0) {
          totalStudentScore += avg;
          studentsWithScores++;
        }
      });
      const studentPerformanceScore =
        studentsWithScores > 0 ? totalStudentScore / studentsWithScores : 80;
      const negativePoints =
        (t.complaintCount || 0) * 5 + (t.rectificationRequestCount || 0) * 2;
      const disciplineScore = Math.max(0, 100 - negativePoints);
      const performanceIndex =
        attendanceScore * 0.2 +
        syllabusScore * 0.4 +
        studentPerformanceScore * 0.3 +
        disciplineScore * 0.1;
      return {
        teacherId: t.id,
        teacherName: t.name,
        avgStudentScore: studentPerformanceScore,
        syllabusCompletion: syllabusScore,
        performanceIndex,
      };
    });

    const teacherPerformance = teacherPerformanceData
      .sort((a, b) => b.performanceIndex - a.performanceIndex)
      .slice(0, 5);

    // --- DYNAMIC School Ranking Logic ---
    const allBranches = db.branches as Branch[];
    const allStudents = db.students as Student[];
    const allGrades = db.grades as Grade[];
    const allAttendance = db.attendance as AttendanceRecord[];
    const allFeeRecords = db.feeRecords as FeeRecord[];

    const branchScores = allBranches.map((b) => {
      const branchStudents = allStudents.filter((s) => s.branchId === b.id);
      if (branchStudents.length === 0) {
        return { branchId: b.id, score: 0 };
      }
      const studentIds = new Set(branchStudents.map((s) => s.id));

      // 1. Academic Score (50%) - Based on actual grades
      const branchGrades = allGrades.filter((g) => studentIds.has(g.studentId));
      const averageGrade =
        branchGrades.length > 0
          ? branchGrades.reduce((acc, g) => acc + g.score, 0) /
            branchGrades.length
          : 0;
      const academicScore = (averageGrade / 100) * 50;

      // 2. Attendance Score (30%) - Based on actual attendance records
      const branchAttendance = allAttendance.filter((a) =>
        studentIds.has(a.studentId)
      );
      const presentCount = branchAttendance.filter(
        (a) => a.status === "Present" || a.status === "Tardy"
      ).length;
      const attendancePercentage =
        branchAttendance.length > 0
          ? (presentCount / branchAttendance.length) * 100
          : 100; // Default to 100% if no records yet
      const attendanceScore = (attendancePercentage / 100) * 30;

      // 3. Financial Score (20%) - Based on actual fee records
      const branchFeeRecords = allFeeRecords.filter((f) =>
        studentIds.has(f.studentId)
      );
      const totalDue = branchFeeRecords.reduce(
        (acc, f) => acc + f.totalAmount,
        0
      );
      const totalPaid = branchFeeRecords.reduce(
        (acc, f) => acc + f.paidAmount,
        0
      );
      const collectionRate = totalDue > 0 ? totalPaid / totalDue : 1; // Default to 100% if no fees are due
      const financialScore = collectionRate * 20;

      const totalScore = academicScore + attendanceScore + financialScore;
      return { branchId: b.id, score: totalScore };
    });

    branchScores.sort((a, b) => b.score - a.score);

    const averageSchoolScore =
      branchScores.length > 0
        ? branchScores.reduce((acc, b) => acc + b.score, 0) /
          branchScores.length
        : 0;
    const schoolRank =
      branchScores.findIndex((b) => b.branchId === branchId) + 1;
    const schoolScore =
      branchScores.find((b) => b.branchId === branchId)?.score || 0;

    // --- DYNAMIC Student Ranking Logic ---
    const studentPerformances = students
      .map((s) => ({
        studentId: s.id,
        score: this.calculateStudentAverage(s.id),
      }))
      .sort((a, b) => b.score - a.score);

    studentPerformances.forEach((p, index) => {
      const student = this.getStudentById(p.studentId);
      if (student) {
        student.schoolRank = index + 1;
      }
    });
    saveDb();

    const topStudents = studentPerformances.slice(0, 5).map((p) => {
      const student = this.getStudentById(p.studentId)!;
      const sClass = this.getClassById(student.classId || "");
      return {
        studentId: p.studentId,
        studentName: student.name,
        rank: student.schoolRank!,
        className: sClass
          ? `Grade ${sClass.gradeLevel}-${sClass.section}`
          : "N/A",
      };
    });

    // --- NEW Subject Performance Logic ---
    const allCourses = (db.courses as Course[]).filter(
      (c) => c.branchId === branchId
    );
    const allSubjects = (db.subjects as Subject[]).filter(
      (s) => s.branchId === branchId
    );
    const studentIdsInBranch = new Set(students.map((s) => s.id));
    const branchGrades = (db.grades as Grade[]).filter((g) =>
      studentIdsInBranch.has(g.studentId)
    );

    const subjectPerformanceByClass: Record<
      string,
      { subjectName: string; averageScore: number }[]
    > = {};

    for (const sClass of classes) {
      const classStudentIds = new Set(sClass.studentIds);
      const performanceData: { subjectName: string; averageScore: number }[] =
        [];

      for (const subjectId of sClass.subjectIds) {
        const subject = allSubjects.find((s) => s.id === subjectId);
        if (!subject) continue;

        const subjectCourses = allCourses.filter(
          (course) => course.subjectId === subjectId
        );
        const subjectCourseIds = new Set(subjectCourses.map((c) => c.id));

        const subjectGradesForClass = branchGrades.filter(
          (g) =>
            classStudentIds.has(g.studentId) && subjectCourseIds.has(g.courseId)
        );

        const averageScore =
          subjectGradesForClass.length > 0
            ? subjectGradesForClass.reduce((sum, g) => sum + g.score, 0) /
              subjectGradesForClass.length
            : 0;

        performanceData.push({
          subjectName: subject.name,
          averageScore: averageScore,
        });
      }
      subjectPerformanceByClass[sClass.id] = performanceData;
    }

    const classListForDropdown = classes.map((c) => ({
      id: c.id,
      name: `Grade ${c.gradeLevel}-${c.section}`,
    }));

    // --- Staff Requests ---
    const pendingLeave = (db.leaveApplications as LeaveApplication[]).filter(
      (l) =>
        l.branchId === branchId &&
        l.status === "Pending" &&
        l.applicantRole !== "Student"
    ).length;
    const pendingAttendance = (
      db.teacherAttendanceRectificationRequests as TeacherAttendanceRectificationRequest[]
    ).filter((r) => r.branchId === branchId && r.status === "Pending").length;
    const pendingFees = (
      db.feeRectificationRequests as FeeRectificationRequest[]
    ).filter((r) => r.branchId === branchId && r.status === "Pending").length;
    const pendingStaffRequests = {
      leave: pendingLeave,
      attendance: pendingAttendance,
      fees: pendingFees,
    };
    const totalPending = pendingLeave + pendingAttendance + pendingFees;
    const pendingApprovals =
      totalPending > 0
        ? [
            {
              id: "pa_summary",
              type: `${totalPending} Pending Items`,
              description: "Staff requests need review",
              requestedBy: "Various",
            },
          ]
        : [];

    const syllabusProgress = classes.map((c) => ({
      name: `Grade ${c.gradeLevel}-${c.section}`,
      progress: 70 + Math.random() * 30,
    }));
    const allEvents = (db.schoolEvents as SchoolEvent[]).filter(
      (e) => e.branchId === branchId
    );
    const grades = [...new Set(classes.map((c) => c.gradeLevel))].sort(
      (a, b) => a - b
    );
    const collectionsByGrade = grades.map((grade) => {
      const studentIdsInGrade = new Set(
        students.filter((s) => s.gradeLevel === grade).map((s) => s.id)
      );
      const gradeFeeRecords = feeRecords.filter((fr) =>
        studentIdsInGrade.has(fr.studentId)
      );
      return {
        name: `Grade ${grade}`,
        collected: gradeFeeRecords.reduce((sum, fr) => sum + fr.paidAmount, 0),
        due: gradeFeeRecords.reduce((sum, fr) => sum + fr.totalAmount, 0),
      };
    });
    const overdueFees = feeRecords
      .filter(
        (fr) =>
          fr.totalAmount > fr.paidAmount && new Date(fr.dueDate) < new Date()
      )
      .map((fr) => {
        const student = this.getStudentById(fr.studentId);
        const sClass = student
          ? this.getClassById(student.classId || "")
          : null;
        return {
          studentId: fr.studentId,
          studentName: student?.name || "Unknown",
          amount: fr.totalAmount - fr.paidAmount,
          className: sClass
            ? `Grade ${sClass.gradeLevel}-${sClass.section}`
            : "N/A",
        };
      });

    const notifications = [
      {
        id: "notif-1",
        type: "QueryResponse" as const,
        message: "Admin has responded to your query about ERP billing.",
        timestamp: new Date(Date.now() - 3600000 * 2),
        link: "/principal/communication",
      },
      {
        id: "notif-2",
        type: "StudentComplaint" as const,
        message: "A new high-priority complaint has been filed by a student.",
        timestamp: new Date(Date.now() - 3600000 * 5),
        link: "/principal/grievances",
      },
    ];

    return {
      summary,
      classPerformance,
      teacherPerformance,
      topStudents,
      syllabusProgress,
      allEvents,
      pendingApprovals,
      pendingStaffRequests,
      collectionsByGrade,
      overdueFees,
      schoolRank,
      schoolScore,
      averageSchoolScore,
      classes: classListForDropdown,
      subjectPerformanceByClass,
      notifications,
    };
  }

  async getFacultyApplicationsByBranch(
    branchId: string
  ): Promise<FacultyApplication[]> {
    return (db.facultyApplications as FacultyApplication[]).filter(
      (a) => a.branchId === branchId
    );
  }

  async getStaffByBranch(
    branchId: string
  ): Promise<(User & Partial<Teacher>)[]> {
    const staffRoles: UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "Principal",
      "SupportStaff",
    ];
    const staffUsers = (db.users as User[]).filter(
      (u) => u.branchId === branchId && staffRoles.includes(u.role)
    );

    const staffDetails = staffUsers.map((user) => {
      if (user.role === "Teacher") {
        const teacherRecord = (db.teachers as Teacher[]).find(
          (t) => t.id === user.id
        );
        const complaintCount = (
          db.teacherComplaints as TeacherComplaint[]
        ).filter((c) => c.teacherId === user.id).length;
        const rectificationRequestCount = (
          db.rectificationRequests as RectificationRequest[]
        ).filter((r) => r.teacherId === user.id).length;
        return {
          ...user,
          ...teacherRecord,
          complaintCount,
          rectificationRequestCount,
        };
      }
      return user;
    });
    return staffDetails as (User & Partial<Teacher>)[];
  }

  async approveFacultyApplication(
    appId: string,
    salary: number,
    reviewedById: string
  ): Promise<{ credentials: { id: string; password: string } }> {
    const app = (db.facultyApplications as FacultyApplication[]).find(
      (a) => a.id === appId
    );
    if (!app) throw new Error("Application not found");
    const newTeacherId = generateUniqueId("teacher");
    const newPassword = this.generatePassword();
    const newTeacher: Teacher = {
      id: newTeacherId,
      branchId: app.branchId,
      name: app.name,
      subjectIds: app.subjectIds,
      qualification: app.qualification,
      doj: app.doj,
      gender: app.gender,
      email: app.email || `${newTeacherId}@verticx.com`,
      phone: app.phone,
      status: "active",
      salary,
      leaveBalances: { sick: 10, casual: 5, earned: 0 },
    };
    const newUser: User = {
      id: newTeacherId,
      name: app.name,
      email: newTeacher.email,
      role: "Teacher",
      password: newPassword,
      branchId: app.branchId,
      salary: salary,
      leaveBalances: { sick: 12, casual: 10, earned: 15 },
      status: "active",
    };
    (db.teachers as Teacher[]).push(newTeacher);
    (db.users as User[]).push(newUser);
    app.status = "approved";
    app.reviewedBy = this.getUserById(reviewedById)?.name;
    app.reviewedAt = new Date();
    saveDb();
    return { credentials: { id: newTeacherId, password: newPassword } };
  }

  async rejectFacultyApplication(
    appId: string,
    reviewedById: string
  ): Promise<void> {
    const app = (db.facultyApplications as FacultyApplication[]).find(
      (a) => a.id === appId
    );
    if (!app) throw new Error("Application not found");
    app.status = "rejected";
    app.reviewedBy = this.getUserById(reviewedById)?.name;
    app.reviewedAt = new Date();
    saveDb();
  }

  async createStaffMember(
    branchId: string,
    data: {
      name: string;
      email: string;
      phone: string;
      role: "Registrar" | "Librarian";
      salary: number;
    }
  ): Promise<{ credentials: { id: string; password: string } }> {
    const newId = generateUniqueId(data.role.toLowerCase() as any);
    const newPassword = this.generatePassword();
    const newUser: User = {
      id: newId,
      name: data.name,
      email: data.email,
      role: data.role,
      password: newPassword,
      branchId,
      salary: data.salary,
      leaveBalances: { sick: 12, casual: 10 },
      status: "active",
    };
    (db.users as User[]).push(newUser);
    saveDb();
    return { credentials: { id: newId, password: newPassword } };
  }

  async suspendStaff(staffUserId: string, actingPrincipalBranchId?: string) {
    // Optional: ensure staff belongs to same branch as principal
    const staff = await prisma.user.findUnique({ where: { id: staffUserId } });
    if (!staff) throw new Error("Staff user not found");

    if (actingPrincipalBranchId && staff.branchId !== actingPrincipalBranchId) {
      throw new Error(
        "Permission denied: staff does not belong to your branch"
      );
    }

    // Update user status
    const updatedUser = await prisma.user.update({
      where: { id: staffUserId },
      data: { status: "suspended" },
    });

    // If a Teacher row exists, update its status too (if you track it there)
    await prisma.teacher.updateMany({
      where: { userId: staffUserId },
      data: { status: "suspended" },
    });

    return updatedUser;
  }

  async reinstateStaff(staffUserId: string, actingPrincipalBranchId?: string) {
    const staff = await prisma.user.findUnique({ where: { id: staffUserId } });
    if (!staff) throw new Error("Staff user not found");

    if (actingPrincipalBranchId && staff.branchId !== actingPrincipalBranchId) {
      throw new Error(
        "Permission denied: staff does not belong to your branch"
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: staffUserId },
      data: { status: "active" },
    });

    await prisma.teacher.updateMany({
      where: { userId: staffUserId },
      data: { status: "active" },
    });

    return updatedUser;
  }

  async deleteStaff(
    staffUserId: string,
    actingPrincipalId?: string,
    actingPrincipalBranchId?: string
  ): Promise<void> {
    // ensure user exists
    const user = await prisma.user.findUnique({ where: { id: staffUserId } });
    if (!user) {
      const e: any = new Error("Staff user not found");
      e.code = "NOT_FOUND";
      throw e;
    }

    // Do not allow deleting yourself
    if (actingPrincipalId && actingPrincipalId === staffUserId) {
      const e: any = new Error("You cannot delete your own account");
      e.code = "FORBIDDEN";
      throw e;
    }

    // branch check
    if (
      typeof actingPrincipalBranchId !== "undefined" &&
      actingPrincipalBranchId !== null &&
      user.branchId !== actingPrincipalBranchId
    ) {
      const e: any = new Error(
        "Permission denied: staff does not belong to your branch"
      );
      e.code = "FORBIDDEN";
      throw e;
    }

    // Remove teacher record if exists (by userId), then remove the user.
    // Use transaction so it either fully deletes or not.
    await prisma.$transaction(async (tx) => {
      // remove any teacher row linked to this user
      await tx.teacher.deleteMany({ where: { userId: staffUserId } });

      // optionally remove other domain records if your app expects:
      // await tx.leaveApplication.deleteMany({ where: { userId: staffUserId } });
      // etc.

      // finally remove the user
      await tx.user.delete({ where: { id: staffUserId } });
    });
  }

  /**
   * Return a teacher profile. Accepts either a teacherId or a userId.
   * Returns a compact object tailored to the frontend profile view.
   */
  async getTeacherProfileDetails(teacherOrUserId: string) {
    // Try find by teacher id
    let teacher = await prisma.teacher.findUnique({
      where: { id: teacherOrUserId },
      select: {
        id: true,
        userId: true,
        name: true,
        email: true,
        phone: true,
        qualification: true,
        salary: true,
        subjectIds: true,
        branchId: true,
        status: true,
      },
    });

    // If not found, try find teacher by userId
    if (!teacher) {
      teacher = await prisma.teacher.findFirst({
        where: { userId: teacherOrUserId },
        select: {
          id: true,
          userId: true,
          name: true,
          email: true,
          phone: true,
          qualification: true,
          salary: true,
          subjectIds: true,
          branchId: true,
          status: true,
        },
      });
    }

    if (!teacher) {
      const e: any = new Error("Teacher not found");
      e.code = "NOT_FOUND";
      throw e;
    }

    // Mentored classes: classes where mentorId == teacher.id
    const mentoredClasses = await prisma.schoolClass.findMany({
      where: { mentorId: teacher.id },
      select: { id: true, gradeLevel: true, section: true },
    });

    // Classes taught via courses that reference a schoolClass
    // (Course.schoolClassId is optional in your schema; only include classes that exist)
    const courses = await prisma.course.findMany({
      where: { teacherId: teacher.id, schoolClassId: { not: null } },
      select: { schoolClassId: true },
    });
    const classIds = Array.from(
      new Set(courses.map((c) => c.schoolClassId).filter(Boolean))
    );

    const taughtClasses = classIds.length
      ? await prisma.schoolClass.findMany({
          where: { id: { in: classIds as string[] } },
          select: { id: true, gradeLevel: true, section: true },
        })
      : [];

    // Assigned subjects (if you have a Subject model with teacherId)
    const assignedSubjects = await prisma.subject.findMany({
      where: { teacherId: teacher.id },
      select: { id: true, name: true },
    });

    // Syllabus progress - if Course model doesn't have a syllabusCompletion field,
    // we avoid querying non-existent fields. Provide a reasonable default or compute if available.
    // We'll try to read `courses` rows for progress if there's a numeric field; otherwise mock 70-90.
    const syllabusProgress =
      (courses.length > 0 &&
        (await Promise.all(
          courses.map(async (c) => {
            // try to fetch a course entry that might have progress fields
            // (select only safe fields - if your course model changes add/select actual field)
            const course = await prisma.course.findUnique({
              where: { id: (c as any).id },
              select: { id: true, name: true, schoolClassId: true },
            });
            return {
              className: course?.schoolClassId
                ? `Class-${course.schoolClassId}`
                : "General",
              subjectName: course?.name || "Subject",
              completionPercentage: 70 + Math.floor(Math.random() * 30),
            };
          })
        ))) ||
      [];

    // Class performance: you can compute averages from exam marks if you have exam tables.
    // To avoid selecting fields that may not exist, we'll return mock averages for each related class:
    const classPerformance = [...mentoredClasses, ...taughtClasses].map(
      (c) => ({
        className: `Grade ${c.gradeLevel}-${c.section}`,
        averageStudentScore: 70 + Math.floor(Math.random() * 25),
      })
    );

    // Attendance: attempt to read teacher attendance summary if table exists
    // We'll try to use TeacherAttendanceRecord if present
    let attendance = { present: 0, total: 0 };
    try {
      const total = await prisma.teacherAttendanceRecord.count({
        where: { teacherId: teacher.id },
      });
      const present = await prisma.teacherAttendanceRecord.count({
        where: { teacherId: teacher.id, status: "Present" },
      });
      attendance = { present, total };
    } catch {
      // If that model doesn't exist or fields differ, keep mock values
      attendance = { present: 0, total: 0 };
    }

    // Payroll history - simplest approach: return last 2 months using salary if available
    const payrollHistory = [
      { month: "April 2024", amount: teacher.salary ?? 0, status: "Paid" },
      { month: "May 2024", amount: teacher.salary ?? 0, status: "Pending" },
    ];

    return {
      teacher,
      assignedSubjects,
      mentoredClasses: mentoredClasses.map((c) => ({
        id: c.id,
        name: `Grade ${c.gradeLevel}-${c.section}`,
      })),
      taughtClasses: taughtClasses.map((c) => ({
        id: c.id,
        name: `Grade ${c.gradeLevel}-${c.section}`,
      })),
      syllabusProgress,
      classPerformance,
      attendance,
      payrollHistory,
    };
  }
  async updateTeacher(
    teacherId: string,
    updates: Partial<Teacher>
  ): Promise<void> {
    const teacher = this.getTeacherById(teacherId);
    if (teacher) {
      Object.assign(teacher, updates);
      saveDb();
    }
    const user = this.getUserById(teacherId);
    if (user && updates.salary) {
      user.salary = updates.salary;
      saveDb();
    }
  }

  async getPrincipalClassView(branchId: string): Promise<any[]> {
    const classes = (db.schoolClasses as SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
    const teachers = (db.teachers as Teacher[]).filter(
      (t) => t.branchId === branchId
    );
    const subjects = (db.subjects as Subject[]).filter(
      (s) => s.branchId === branchId
    );
    const students = (db.students as Student[]).filter(
      (s) => s.branchId === branchId
    );
    return classes.map((c) => {
      const classStudentIds = new Set(c.studentIds);
      let totalScore = 0;
      let studentCountWithGrades = 0;
      for (const studentId of classStudentIds) {
        const avg = this.calculateStudentAverage(studentId);
        if (avg > 0) {
          totalScore += avg;
          studentCountWithGrades++;
        }
      }
      const avgPerformance =
        studentCountWithGrades > 0 ? totalScore / studentCountWithGrades : 0;
      const classAttendanceRecords = (
        db.attendance as AttendanceRecord[]
      ).filter((a) => classStudentIds.has(a.studentId));
      const totalAttendanceRecords = classAttendanceRecords.length;
      const presentRecords = classAttendanceRecords.filter(
        (a) => a.status === "Present" || a.status === "Tardy"
      ).length;
      const avgAttendance =
        totalAttendanceRecords > 0
          ? (presentRecords / totalAttendanceRecords) * 100
          : 100;
      const classLectures = (db.lectures as Lecture[]).filter(
        (l) => l.classId === c.id
      );
      const totalLectures = classLectures.length;
      const completedLectures = classLectures.filter(
        (l) => l.status === "completed"
      ).length;
      const syllabusCompletion =
        totalLectures > 0 ? (completedLectures / totalLectures) * 100 : 0;
      return {
        ...c,
        students: students.filter((s) => classStudentIds.has(s.id)),
        stats: { avgAttendance, avgPerformance, syllabusCompletion },
        teachers: c.subjectIds.map((sid) => {
          const sub = subjects.find((s) => s.id === sid);
          const teacher = teachers.find((t) => t.id === sub?.teacherId);
          return { name: teacher?.name || "N/A", subject: sub?.name || "N/A" };
        }),
      };
    });
  }

  async getFeeRectificationRequestsByBranch(
    branchId: string
  ): Promise<FeeRectificationRequest[]> {
    return (db.feeRectificationRequests as FeeRectificationRequest[]).filter(
      (r) => r.branchId === branchId
    );
  }

  async processFeeRectificationRequest(
    requestId: string,
    principalId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    await this.delay(500);
    const req = (db.feeRectificationRequests as FeeRectificationRequest[]).find(
      (r) => r.id === requestId
    );
    if (req) {
      req.status = status;
      req.reviewedBy = this.getUserById(principalId)?.name;
      req.reviewedAt = new Date();
      if (status === "Approved") {
        const template = (db.feeTemplates as FeeTemplate[]).find(
          (t) => t.id === req.templateId
        );
        if (req.requestType === "delete") {
          if (template) {
            db.feeTemplates = (db.feeTemplates as FeeTemplate[]).filter(
              (t) => t.id !== req.templateId
            );
          }
        } else if (req.requestType === "update" && req.newData && template) {
          const newTemplateData = JSON.parse(
            req.newData
          ) as Partial<FeeTemplate>;
          Object.assign(template, newTemplateData);
        }
      }
      saveDb();
    }
  }

  async getTeacherAttendanceRectificationRequestsByBranch(
    branchId: string
  ): Promise<TeacherAttendanceRectificationRequest[]> {
    return (
      db.teacherAttendanceRectificationRequests as TeacherAttendanceRectificationRequest[]
    ).filter((r) => r.branchId === branchId);
  }

  async processTeacherAttendanceRectificationRequest(
    requestId: string,
    principalId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    const req = (
      db.teacherAttendanceRectificationRequests as TeacherAttendanceRectificationRequest[]
    ).find((r) => r.id === requestId);
    if (req) {
      req.status = status;
      req.reviewedBy = this.getUserById(principalId)?.name;
      req.reviewedAt = new Date();
      if (status === "Approved") {
        const record = (db.teacherAttendance as TeacherAttendanceRecord[]).find(
          (r) => r.teacherId === req.teacherId && r.date === req.date
        );
        if (record) {
          record.status = req.toStatus;
        } else {
          (db.teacherAttendance as TeacherAttendanceRecord[]).push({
            id: this.generateId("t-att"),
            branchId: req.branchId,
            teacherId: req.teacherId,
            date: req.date,
            status: req.toStatus,
          });
        }
      }
      saveDb();
    }
  }

  async getLeaveApplicationsForPrincipal(
    branchId: string
  ): Promise<LeaveApplication[]> {
    return (db.leaveApplications as LeaveApplication[]).filter(
      (l) => l.branchId === branchId && l.applicantRole !== "Student"
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
    if (!app) return;

    app.status = status;
    app.reviewedBy = this.getUserById(reviewerId)?.name;
    app.reviewedAt = new Date();

    if (status === "Approved") {
      const applicant = this.getUserById(app.applicantId);
      if (applicant && applicant.leaveBalances) {
        const start = new Date(app.startDate);
        const end = new Date(app.endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const duration = app.isHalfDay
          ? 0.5
          : Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        const leaveTypeKey =
          app.leaveType.toLowerCase() as keyof typeof applicant.leaveBalances;
        if (applicant.leaveBalances[leaveTypeKey] !== undefined) {
          applicant.leaveBalances[leaveTypeKey] = Math.max(
            0,
            applicant.leaveBalances[leaveTypeKey] - duration
          );
        }
      }
    }
    saveDb();
  }

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

  async getComplaintsAboutStudentsByBranch(
    branchId: string
  ): Promise<ComplaintAboutStudent[]> {
    await this.delay(300);
    return (db.complaintsAboutStudents as ComplaintAboutStudent[]).filter(
      (c) => c.branchId === branchId
    );
  }

  async getAttendanceOverview(
    branchId: string
  ): Promise<PrincipalAttendanceOverview> {
    await this.delay(300);
    const branch = await this.getBranchById(branchId);
    const principalId = branch?.principalId;

    const students = await this.getStudentsByBranch(branchId);
    const allStaff = await this.getStaffByBranch(branchId);
    const staff = allStaff.filter((s) => s.id !== principalId); // Exclude the principal
    const today = new Date().toISOString().split("T")[0];

    const studentAttendance = (db.attendance as AttendanceRecord[]).filter(
      (r) =>
        r.date === today &&
        this.getStudentById(r.studentId)?.branchId === branchId
    );
    const studentIds = new Set(studentAttendance.map((r) => r.studentId));
    const presentStudents = Array.from(studentIds).filter((id) =>
      studentAttendance.find(
        (r) => r.studentId === id && r.status === "Present"
      )
    ).length;

    const allStaffAttendanceRecordsToday = (
      db.teacherAttendance as TeacherAttendanceRecord[]
    ).filter((r) => r.branchId === branchId && r.date === today);
    const staffIds = new Set(staff.map((s) => s.id));
    const staffAttendance = allStaffAttendanceRecordsToday.filter((r) =>
      staffIds.has(r.teacherId)
    );

    const presentStaff = staffAttendance.filter(
      (r) => r.status === "Present" || r.status === "Half Day"
    ).length;

    const summary = {
      studentsPresent: presentStudents,
      studentsTotal: students.length,
      staffPresent: presentStaff,
      staffTotal: staff.length,
    };

    const classAttendance = (await this.getSchoolClassesByBranch(branchId)).map(
      (c) => {
        const classStudentIds = new Set(c.studentIds);
        const classAttendanceToday = studentAttendance.filter((r) =>
          classStudentIds.has(r.studentId)
        );
        const presentIds = new Set(
          classAttendanceToday
            .filter((r) => r.status === "Present")
            .map((r) => r.studentId)
        );
        const absentees = students.filter(
          (s) => classStudentIds.has(s.id) && !presentIds.has(s.id)
        );
        return {
          classId: c.id,
          className: `Grade ${c.gradeLevel}-${c.section}`,
          present: presentIds.size,
          total: classStudentIds.size,
          absentees: absentees.map((s) => ({ id: s.id, name: s.name })),
        };
      }
    );

    const staffAttendanceList = staff.map((s) => {
      const record = staffAttendance.find((r) => r.teacherId === s.id);
      return {
        teacherId: s.id,
        teacherName: s.name,
        status: record
          ? record.status
          : ("Not Marked" as TeacherAttendanceStatus | "Not Marked"),
      };
    });

    return {
      summary,
      classAttendance,
      staffAttendance: staffAttendanceList,
    };
  }

  async getFinancialsOverview(
    branchId: string
  ): Promise<PrincipalFinancialsOverview> {
    await this.delay(400);
    const branch = (db.branches as Branch[]).find((b) => b.id === branchId);
    if (!branch) throw new Error("Branch not found");

    const today = new Date();
    const currentMonthStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );
    const currentMonthEnd = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0
    );
    const sessionStart = new Date(
      branch.academicSessionStartDate || `${today.getFullYear()}-04-01`
    );

    const students = (db.students as Student[]).filter(
      (s) => s.branchId === branchId
    );
    const studentIds = new Set(students.map((s) => s.id));

    // --- REVENUE CALCULATION ---
    const feeRecords = (db.feeRecords as FeeRecord[]).filter((fr) =>
      studentIds.has(fr.studentId)
    );
    const allFeePayments = (db.feePayments as FeePayment[]).filter((p) =>
      studentIds.has(p.studentId)
    );

    // For consistency with the Admin portal, session revenue is the total collected amount on record.
    const sessionTuitionRevenue = feeRecords.reduce(
      (sum, r) => sum + r.paidAmount,
      0
    );

    // Calculate monthly revenue from specific payment transactions if they exist.
    const monthPayments = allFeePayments.filter((p) => {
      const paidDate = new Date(p.paidDate);
      return paidDate >= currentMonthStart && paidDate <= currentMonthEnd;
    });
    let monthlyTuitionRevenue = monthPayments.reduce(
      (sum, p) => sum + p.amount,
      0
    );

    // FALLBACK LOGIC: If there are no transaction records for the month, but there is a paid
    // amount in the main fee record, we assume the payment was recent to avoid showing 0.
    // This ensures data consistency with the Admin portal's view.
    if (
      monthlyTuitionRevenue === 0 &&
      sessionTuitionRevenue > 0 &&
      allFeePayments.length === 0
    ) {
      monthlyTuitionRevenue = sessionTuitionRevenue;
    }

    const transportFees = (db.transportRoutes as any[])
      .filter((r) => r.branchId === branchId)
      .reduce((sum, r) => {
        return (
          sum +
          r.assignedMembers.reduce((memSum: number, mem: any) => {
            const stop = r.busStops.find((s: any) => s.id === mem.stopId);
            return memSum + (stop?.charges || 0);
          }, 0)
        );
      }, 0);
    const hostelFees = (db.rooms as any[])
      .filter((r) => this.getHostelById(r.hostelId)?.branchId === branchId)
      .reduce((sum, r) => sum + r.occupantIds.length * r.fee, 0);

    const monthlyAncillaryRevenue = transportFees + hostelFees;
    const monthsInSession =
      (today.getFullYear() - sessionStart.getFullYear()) * 12 +
      (today.getMonth() - sessionStart.getMonth()) +
      1;
    const sessionAncillaryRevenue = monthlyAncillaryRevenue * monthsInSession;

    const monthlyRevenue = monthlyTuitionRevenue + monthlyAncillaryRevenue;
    const sessionRevenue = sessionTuitionRevenue + sessionAncillaryRevenue;

    // --- EXPENDITURE ---
    const allPayroll = (db.payrollRecords as PayrollRecord[]).filter(
      (p) => p.branchId === branchId && p.status === "Paid" && p.paidAt
    );
    const allManualExpenses = (db.manualExpenses as ManualExpense[]).filter(
      (e) => e.branchId === branchId
    );

    const monthlyPayroll = allPayroll
      .filter((p) => {
        const paidDate = new Date(p.paidAt!);
        return paidDate >= currentMonthStart && paidDate <= currentMonthEnd;
      })
      .reduce((sum, p) => sum + (p.netPayable || 0), 0);
    const monthlyManualExpenses = allManualExpenses
      .filter((e) => {
        const expenseDate = new Date(e.date);
        return (
          expenseDate >= currentMonthStart && expenseDate <= currentMonthEnd
        );
      })
      .reduce((sum, e) => sum + e.amount, 0);
    const monthlyExpenditure = monthlyPayroll + monthlyManualExpenses;

    const sessionPayroll = allPayroll
      .filter((p) => new Date(p.paidAt!) >= sessionStart)
      .reduce((sum, p) => sum + (p.netPayable || 0), 0);
    const sessionManualExpenses = allManualExpenses
      .filter((e) => new Date(e.date) >= sessionStart)
      .reduce((sum, e) => sum + e.amount, 0);
    const sessionErpPayments = (db.erpPayments as ErpPayment[])
      .filter(
        (p) =>
          p.branchId === branchId && new Date(p.paymentDate) >= sessionStart
      )
      .reduce((sum, p) => sum + p.amount, 0);
    const sessionExpenditure =
      sessionPayroll + sessionManualExpenses + sessionErpPayments;

    // --- PENDING & ERP ---
    const totalPending = feeRecords.reduce(
      (sum, fr) => sum + (fr.totalAmount - fr.paidAmount),
      0
    );
    const pricePerStudent = branch?.erpPricePerStudent || 10;
    const studentCount = students.length;
    const billingCycle = branch?.billingCycle || "monthly";
    let erpBillAmountForCycle =
      pricePerStudent *
      studentCount *
      (billingCycle === "quarterly"
        ? 3
        : billingCycle === "half_yearly"
        ? 6
        : billingCycle === "yearly"
        ? 12
        : 1);
    const nextDueDate = branch?.nextDueDate
      ? new Date(branch.nextDueDate + "T00:00:00")
      : new Date(0);
    const isErpBillPaid = nextDueDate > today;

    const classFeeSummaries = (
      await this.getSchoolClassesByBranch(branchId)
    ).map((c) => {
      const classStudentIds = new Set(c.studentIds);
      const classFeeRecords = feeRecords.filter((fr) =>
        classStudentIds.has(fr.studentId)
      );
      const defaulters = classFeeRecords.filter(
        (fr) => fr.totalAmount > fr.paidAmount
      );
      return {
        classId: c.id,
        className: `Grade ${c.gradeLevel} - ${c.section}`,
        studentCount: c.studentIds.length,
        defaulterCount: defaulters.length,
        pendingAmount: defaulters.reduce(
          (sum, d) => sum + (d.totalAmount - d.paidAmount),
          0
        ),
      };
    });

    return {
      monthly: {
        revenue: monthlyRevenue,
        expenditure: monthlyExpenditure,
        net: monthlyRevenue - monthlyExpenditure,
        revenueBreakdown: [
          { name: "Tuition Fees", value: monthlyTuitionRevenue },
          { name: "Transport Fees", value: transportFees },
          { name: "Hostel Fees", value: hostelFees },
        ].filter((item) => item.value > 0),
        expenditureBreakdown: [
          { name: "Staff Payroll", value: monthlyPayroll },
          { name: "Other Expenses", value: monthlyManualExpenses },
        ].filter((item) => item.value > 0),
      },
      session: {
        revenue: sessionRevenue,
        expenditure: sessionExpenditure,
        net: sessionRevenue - sessionExpenditure,
      },
      summary: {
        totalPending,
        erpBillAmountForCycle,
        erpNextDueDate: branch?.nextDueDate,
        erpBillingCycle: branch?.billingCycle,
        isErpBillPaid,
      },
      classFeeSummaries,
      manualExpenses: allManualExpenses.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    };
  }

  async getAnnouncements(branchId: string): Promise<Announcement[]> {
    await this.delay(150);
    return (db.announcements as Announcement[])
      .filter((a) => a.branchId === branchId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  async getSmsHistory(branchId: string): Promise<SmsMessage[]> {
    await this.delay(150);
    return (db.smsHistory as SmsMessage[])
      .filter((s) => s.branchId === branchId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  async sendAnnouncement(
    branchId: string,
    data: {
      title: string;
      message: string;
      audience: "All" | "Staff" | "Students" | "Parents";
    }
  ): Promise<void> {
    const newAnnouncement: Announcement = {
      id: this.generateId("ann"),
      branchId,
      ...data,
      sentAt: new Date(),
    };
    (db.announcements as Announcement[]).push(newAnnouncement);
    saveDb();
  }

  async sendSmsToStudents(
    studentIds: string[],
    message: string,
    sentBy: string,
    branchId: string
  ): Promise<{ success: boolean; count: number }> {
    const newSms: SmsMessage = {
      id: this.generateId("sms"),
      branchId,
      message,
      recipientCount: studentIds.length,
      sentAt: new Date(),
      sentBy,
    };
    (db.smsHistory as SmsMessage[]).push(newSms);
    saveDb();
    return { success: true, count: studentIds.length };
  }

  async clearAnnouncementsHistory(
    branchId: string,
    fromDate: string,
    toDate: string
  ): Promise<void> {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    db.announcements = (db.announcements as Announcement[]).filter((a) => {
      const sentAt = new Date(a.sentAt);
      return a.branchId !== branchId || sentAt < from || sentAt > to;
    });
    saveDb();
  }

  async clearSmsHistory(
    branchId: string,
    fromDate: string,
    toDate: string
  ): Promise<void> {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    db.smsHistory = (db.smsHistory as SmsMessage[]).filter((s) => {
      const sentAt = new Date(s.sentAt);
      return s.branchId !== branchId || sentAt < from || sentAt > to;
    });
    saveDb();
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    await this.delay(300);
    const user = this.getUserById(userId);
    if (user) {
      Object.assign(user, updates);
      saveDb();
    }
  }

  async startNewAcademicSession(
    branchId: string,
    newStartDate: string
  ): Promise<void> {
    await this.delay(1000);
    const branch = await this.getBranchById(branchId);
    if (branch) {
      branch.academicSessionStartDate = newStartDate;
      saveDb();
    }
  }

  async getComplaintsForBranch(branchId: string): Promise<TeacherComplaint[]> {
    await this.delay(300);
    return (db.teacherComplaints as TeacherComplaint[]).filter(
      (c) => c.branchId === branchId
    );
  }
  async getSchoolEventsByBranch(branchId: string): Promise<SchoolEvent[]> {
    await this.delay(200);
    return (db.schoolEvents as SchoolEvent[])
      .filter((e) => e.branchId === branchId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  async deleteSchoolEvent(eventId: string): Promise<void> {
    await this.delay(300);
    db.schoolEvents = (db.schoolEvents as SchoolEvent[]).filter(
      (e) => e.id !== eventId
    );
    saveDb();
  }

  async addFeeAdjustment(
    studentId: string,
    type: "concession" | "charge",
    amount: number,
    reason: string,
    adjustedBy: string
  ): Promise<void> {
    await this.delay(300);
    const finalAmount =
      type === "concession" ? -Math.abs(amount) : Math.abs(amount);
    const adjustment: FeeAdjustment = {
      id: this.generateId("adj"),
      studentId,
      amount: finalAmount,
      type,
      reason,
      adjustedBy,
      date: new Date().toISOString().split("T")[0],
    };
    (db.feeAdjustments as FeeAdjustment[]).push(adjustment);
    const feeRecord = (db.feeRecords as FeeRecord[]).find(
      (fr) => fr.studentId === studentId
    );
    if (feeRecord) {
      feeRecord.totalAmount += finalAmount;
    }
    saveDb();
  }

  async getExaminationsWithResultStatus(
    branchId: string
  ): Promise<Examination[]> {
    await this.delay(200);
    return (db.examinations as Examination[]).filter(
      (e) => e.branchId === branchId
    );
  }

  async publishExaminationResults(examinationId: string): Promise<void> {
    await this.delay(1000);
    const exam = this.getExaminationById(examinationId);
    if (exam) {
      exam.resultStatus = "Published";
      saveDb();
    }
  }

  async getStudentResultsForExamination(
    examinationId: string
  ): Promise<StudentWithExamMarks[]> {
    await this.delay(300);
    const exam = this.getExaminationById(examinationId)!;
    const schedules = (db.examSchedules as any[]).filter(
      (s) => s.examinationId === examinationId
    );
    const marks = (db.examMarks as ExamMark[]).filter(
      (m) => m.examinationId === examinationId
    );
    const studentsInvolved = new Set(marks.map((m) => m.studentId));

    const results: StudentWithExamMarks[] = [];
    for (const studentId of studentsInvolved) {
      const student = this.getStudentById(studentId)!;
      const studentMarks = marks
        .filter((m) => m.studentId === studentId)
        .map((m) => {
          const schedule = schedules.find((s) => s.id === m.examScheduleId)!;
          const subject = this.getSubjectById(schedule.subjectId)!;
          return {
            subjectName: subject.name,
            score: m.score,
            totalMarks: m.totalMarks,
          };
        });
      results.push({ student, marks: studentMarks });
    }
    return results;
  }

  async sendResultsSms(
    examinationId: string,
    messageTemplate: string,
    branchId: string
  ): Promise<void> {
    await this.delay(1500);
    console.log(
      `[SMS MOCK] Sending results for examination ${examinationId} with template: "${messageTemplate}"`
    );
    // In a real app, this would iterate over students, generate messages, and call an SMS gateway.
  }

  async getSuspensionRecordsForBranch(
    branchId: string
  ): Promise<SuspensionRecord[]> {
    await this.delay(150);
    const studentIdsInBranch = new Set(
      (await this.getStudentsByBranch(branchId)).map((s) => s.id)
    );
    return (db.suspensionRecords as SuspensionRecord[]).filter((r) =>
      studentIdsInBranch.has(r.studentId)
    );
  }

  async createSchoolEvent(
    eventData: Omit<SchoolEvent, "id" | "status" | "createdAt">
  ): Promise<void> {
    const newEvent: SchoolEvent = {
      id: this.generateId("evt"),
      ...eventData,
      status: "Approved",
      createdAt: new Date(),
    }; // Principals auto-approve
    (db.schoolEvents as SchoolEvent[]).push(newEvent);
    saveDb();
  }

  async updateSchoolEvent(
    eventId: string,
    eventData: Partial<SchoolEvent>
  ): Promise<void> {
    const event = (db.schoolEvents as SchoolEvent[]).find(
      (e) => e.id === eventId
    );
    if (event) {
      Object.assign(event, eventData);
      event.status = "Approved"; // Principals auto-approve edits
      saveDb();
    }
  }

  async updateSchoolEventStatus(
    eventId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    const event = (db.schoolEvents as SchoolEvent[]).find(
      (e) => e.id === eventId
    );
    if (event) {
      event.status = status;
      saveDb();
    }
  }

  async addManualSalaryAdjustment(
    branchId: string,
    staffId: string,
    amount: number,
    reason: string,
    adjustedBy: string,
    month: string
  ): Promise<void> {
    const newAdjustment = {
      id: this.generateId("sal-adj"),
      branchId,
      staffId,
      month,
      amount,
      reason,
      adjustedBy,
      adjustedAt: new Date(),
    };
    (db.manualSalaryAdjustments as any[]).push(newAdjustment);
    saveDb();
  }

  async getStaffPayrollForMonth(
    branchId: string,
    month: string
  ): Promise<PayrollStaffDetails[]> {
    await this.delay(500);

    // Define all applicable staff roles for payroll.
    const staffRoles: UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "SupportStaff",
    ];
    const principalId = (db.branches as Branch[]).find(
      (b) => b.id === branchId
    )?.principalId;

    // Filter users to get all staff in the branch, excluding the principal.
    const staff = (db.users as User[]).filter(
      (u) =>
        u.branchId === branchId &&
        staffRoles.includes(u.role) &&
        u.id !== principalId
    );

    const payrollData = staff.map((s) => {
      // Find existing record for the month
      let record = (db.payrollRecords as PayrollRecord[]).find(
        (p) =>
          p.branchId === branchId && p.month === month && p.staffId === s.id
      );

      // If a record is already paid, it's final.
      if (record && record.status === "Paid") {
        return record;
      }

      // --- Start Calculation ---
      const baseSalary = s.salary;

      // If staff member has no salary set, mark it as such.
      if (baseSalary === null || baseSalary === undefined) {
        const salaryNotSetRecord: PayrollStaffDetails = {
          id: record?.id || this.generateId("pay-rec"),
          branchId,
          staffId: s.id,
          staffName: s.name,
          staffRole: s.role,
          month,
          baseSalary: null,
          unpaidLeaveDays: 0,
          leaveDeductions: null,
          manualAdjustmentsTotal: 0,
          netPayable: null,
          status: "Salary Not Set",
        };
        if (!record) {
          (db.payrollRecords as PayrollRecord[]).push(salaryNotSetRecord);
        } else {
          Object.assign(record, salaryNotSetRecord);
        }
        return salaryNotSetRecord;
      }

      // Calculate leave days within the selected month
      const monthStart = new Date(month + "-02"); // Use day 2 to avoid timezone issues
      monthStart.setDate(1);
      const monthEnd = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0
      );

      const approvedLeaves = (
        db.leaveApplications as LeaveApplication[]
      ).filter((l) => l.applicantId === s.id && l.status === "Approved");

      let unpaidLeaveDays = 0;
      approvedLeaves.forEach((leave) => {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        leaveStart.setUTCHours(0, 0, 0, 0);
        leaveEnd.setUTCHours(0, 0, 0, 0);

        for (
          let d = new Date(leaveStart);
          d <= leaveEnd;
          d.setDate(d.getDate() + 1)
        ) {
          if (d >= monthStart && d <= monthEnd) {
            unpaidLeaveDays += leave.isHalfDay ? 0.5 : 1;
          }
        }
      });

      const leaveDeductions = unpaidLeaveDays * (baseSalary / 30); // Simplified daily rate
      const manualAdjustments = (
        db.manualSalaryAdjustments as ManualSalaryAdjustment[]
      ).filter((adj) => adj.staffId === s.id && adj.month === month);
      const manualAdjustmentsTotal = manualAdjustments.reduce(
        (sum, adj) => sum + adj.amount,
        0
      );
      const netPayable = baseSalary - leaveDeductions + manualAdjustmentsTotal;
      // --- End Calculation ---

      // Update existing record or create a new one
      if (record) {
        record.baseSalary = baseSalary;
        record.unpaidLeaveDays = unpaidLeaveDays;
        record.leaveDeductions = Math.round(leaveDeductions);
        record.manualAdjustmentsTotal = manualAdjustmentsTotal;
        record.netPayable = Math.round(netPayable);
        record.status = "Pending"; // Ensure status is pending if recalculated
        return record;
      } else {
        const newRecord: PayrollStaffDetails = {
          id: this.generateId("pay-rec"),
          branchId,
          staffId: s.id,
          staffName: s.name,
          staffRole: s.role,
          month,
          baseSalary,
          unpaidLeaveDays,
          leaveDeductions: Math.round(leaveDeductions),
          manualAdjustmentsTotal,
          netPayable: Math.round(netPayable),
          status: "Pending",
        };
        (db.payrollRecords as PayrollRecord[]).push(newRecord);
        return newRecord;
      }
    });

    saveDb();
    return payrollData;
  }

  async processPayroll(
    payrollRecords: PayrollStaffDetails[],
    processedBy: string
  ): Promise<void> {
    await this.delay(1000);
    payrollRecords.forEach((recordToPay) => {
      const recordInDb = (db.payrollRecords as PayrollRecord[]).find(
        (p) => p.id === recordToPay.id
      );
      if (recordInDb && recordInDb.status === "Pending") {
        recordInDb.status = "Paid";
        recordInDb.paidAt = new Date();
        recordInDb.paidBy = processedBy;
      }
    });
    saveDb();
  }

  async payErpBill(
    branchId: string,
    amount: number,
    transactionId: string
  ): Promise<void> {
    await this.delay(500);
    const newPayment: ErpPayment = {
      id: this.generateId("erp-pay"),
      branchId,
      amount,
      paymentDate: new Date().toISOString().split("T")[0],
      transactionId,
    };
    (db.erpPayments as ErpPayment[]).push(newPayment);

    const branch = (db.branches as Branch[]).find((b) => b.id === branchId);
    if (branch && branch.billingCycle && branch.nextDueDate) {
      const [year, month, day] = branch.nextDueDate.split("-").map(Number);
      const currentDueDate = new Date(Date.UTC(year, month - 1, day));

      switch (branch.billingCycle) {
        case "monthly":
          currentDueDate.setUTCMonth(currentDueDate.getUTCMonth() + 1);
          break;
        case "quarterly":
          currentDueDate.setUTCMonth(currentDueDate.getUTCMonth() + 3);
          break;
        case "half_yearly":
          currentDueDate.setUTCMonth(currentDueDate.getUTCMonth() + 6);
          break;
        case "yearly":
          currentDueDate.setUTCFullYear(currentDueDate.getUTCFullYear() + 1);
          break;
      }

      branch.nextDueDate = currentDueDate.toISOString().split("T")[0];
    }

    saveDb();
  }

  async raiseQueryToAdmin(
    queryData: Omit<PrincipalQuery, "id" | "submittedAt" | "status">
  ): Promise<PrincipalQuery> {
    await this.delay(300);
    const newQuery: PrincipalQuery = {
      id: this.generateId("pq"),
      ...queryData,
      submittedAt: new Date(),
      status: "Open",
    };
    (db.principalQueries as PrincipalQuery[]).push(newQuery);
    saveDb();
    return newQuery;
  }

  async getQueriesByPrincipal(principalId: string): Promise<PrincipalQuery[]> {
    await this.delay(200);
    return (db.principalQueries as PrincipalQuery[])
      .filter((q) => q.principalId === principalId)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
  }

  async getErpPaymentsForBranch(branchId: string): Promise<ErpPayment[]> {
    await this.delay(150);
    return (db.erpPayments as ErpPayment[]).filter(
      (p) => p.branchId === branchId
    );
  }

  async getErpFinancialsForBranch(branchId: string): Promise<ErpFinancials> {
    await this.delay(400);
    const branch = await this.getBranchById(branchId);
    if (!branch) throw new Error("Branch not found");

    const students = (db.students as Student[]).filter(
      (s) => s.branchId === branchId && s.status === "active"
    );
    const studentCount = students.length;
    const erpPrice = branch.erpPricePerStudent || 10;

    const sessionStartDate = new Date(
      branch.academicSessionStartDate || `${new Date().getFullYear()}-04-01`
    );
    const today = new Date();

    const countMonths = (start: Date, end: Date): number => {
      const startDate = new Date(start.getFullYear(), start.getMonth(), 1);
      const endDate = new Date(end.getFullYear(), end.getMonth(), 1);
      let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
      months -= startDate.getMonth();
      months += endDate.getMonth();
      return months <= 0 ? 0 : months;
    };

    const monthsPassed = countMonths(sessionStartDate, today);
    const totalBilled = monthsPassed * studentCount * erpPrice;

    const paymentHistory = (db.erpPayments as ErpPayment[]).filter(
      (p) => p.branchId === branchId
    );
    const totalPaid = paymentHistory.reduce((sum, p) => sum + p.amount, 0);

    const pendingAmount = Math.max(0, totalBilled - totalPaid);
    const collectionRate =
      totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 100;

    const billingHistory: {
      month: string;
      amountBilled: number;
      amountPaid: number;
    }[] = [];
    let paidTracker = totalPaid;
    for (let i = 0; i < monthsPassed; i++) {
      const date = new Date(sessionStartDate);
      date.setMonth(date.getMonth() + i);
      const monthName = date.toLocaleString("default", { month: "short" });

      const amountBilledForMonth = studentCount * erpPrice;
      const amountPaidForMonth = Math.min(paidTracker, amountBilledForMonth);
      paidTracker -= amountPaidForMonth;

      billingHistory.push({
        month: `${monthName} '${String(date.getFullYear()).slice(2)}`,
        amountBilled: amountBilledForMonth,
        amountPaid: amountPaidForMonth,
      });
    }

    return {
      totalBilled,
      totalPaid,
      pendingAmount,
      collectionRate,
      billingHistory,
      paymentHistory: paymentHistory.sort(
        (a, b) =>
          new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      ),
    };
  }

  async getManualExpenses(branchId: string): Promise<ManualExpense[]> {
    await this.delay(100);
    return (db.manualExpenses as ManualExpense[])
      .filter((e) => e.branchId === branchId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async addManualExpense(data: Omit<ManualExpense, "id">): Promise<void> {
    await this.delay(300);
    const newExpense: ManualExpense = {
      id: this.generateId("exp"),
      ...data,
    };
    (db.manualExpenses as ManualExpense[]).push(newExpense);
    saveDb();
  }
}