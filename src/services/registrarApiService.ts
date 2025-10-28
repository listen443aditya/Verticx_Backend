// services/registrarApiService.ts
import { db, saveDb } from "./database";
import type {
  User,
  Student,
  Teacher,
  Parent,
  SchoolClass,
  Subject,
  FeeTemplate,
  Application,
  RegistrarDashboardData,
  FeeRecord,
  TimetableConfig,
  TimetableSlot,
  SuspensionRecord,
  RectificationRequest,
  SyllabusChangeRequest,
  Lecture,
  ExamMarkRectificationRequest,
  Announcement,
  SmsMessage,
  SchoolDocument,
  Hostel,
  Room,
  InventoryItem,
  InventoryLog,
  TransportRoute,
  ConcessionRequest,
  FeeRectificationRequest,
  Examination,
  ExamSchedule,
  UserRole,
  ClassFeeSummary,
  DefaulterDetails,
  SchoolEvent,
  AttendanceRecord,
  TeacherAttendanceRecord,
  TeacherAttendanceStatus,
  LeaveApplication,
  LeaveSetting,
  Grade,
  ExamMark,
  LibraryBook,
  ClassDetails,
  AttendanceStatus,
  AttendanceListItem,
  FacultyApplication,
  FeePayment,
  Course,
  AcademicRequestSummary,
  MonthlyFee,
} from "../types/api";
import { BaseApiService, generateUniqueId } from "./baseApiService";
import prisma from "../prisma";

export class RegistrarApiService extends BaseApiService {
  async getRegistrarDashboardData(
    branchId: string
  ): Promise<RegistrarDashboardData> {
    await this.delay(500);
    const branch = await this.getBranchById(branchId);
    if (!branch) throw new Error("Branch not found");

    const applications = (db.applications as Application[]).filter(
      (a) => a.branchId === branchId && a.status === "pending"
    );
    const students = (db.students as Student[]).filter(
      (s) => s.branchId === branchId
    );
    const feeRecords = (db.feeRecords as FeeRecord[]).filter(
      (fr) => this.getStudentById(fr.studentId)?.branchId === branchId
    );
    const teachers = (db.teachers as Teacher[]).filter(
      (t) => t.branchId === branchId
    ); // Academic Requests Calculation

    const pendingRectification = (
      db.rectificationRequests as RectificationRequest[]
    ).filter((r) => r.branchId === branchId && r.status === "Pending");
    const pendingSyllabus = (
      db.syllabusChangeRequests as SyllabusChangeRequest[]
    ).filter((r) => r.branchId === branchId && r.status === "Pending");
    const pendingExamMarks = (
      db.examMarkRectificationRequests as ExamMarkRectificationRequest[]
    ).filter((r) => r.branchId === branchId && r.status === "Pending");

    const allPendingAcademicRequests: (
      | RectificationRequest
      | SyllabusChangeRequest
      | ExamMarkRectificationRequest
    )[] = [...pendingRectification, ...pendingSyllabus, ...pendingExamMarks];

    allPendingAcademicRequests.sort(
      (a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );

    const academicRequestsCount = allPendingAcademicRequests.length;

    const recentAcademicRequests: AcademicRequestSummary[] =
      allPendingAcademicRequests.slice(0, 3).map((req) => {
        let type: AcademicRequestSummary["type"];
        let description: string;

        if ("details" in req && "studentName" in req.details) {
          // RectificationRequest or ExamMarkRectificationRequest
          if ("from" in req.details) {
            type = "Grade/Attendance";
            description = `By ${req.teacherName} for ${req.details.studentName}`;
          } else {
            type = "Exam Marks";
            description = `By ${req.teacherName} for ${req.details.studentName}`;
          }
        } else {
          // SyllabusChangeRequest
          type = "Syllabus Change";
          description = `By ${(req as SyllabusChangeRequest).teacherName}`;
        }
        return {
          id: req.id,
          type,
          description,
          requestedAt: req.requestedAt,
        };
      });

    const summary = {
      pendingAdmissions: applications.length,
      pendingAcademicRequests: academicRequestsCount,
      feesPending: feeRecords.reduce(
        (acc, fr) => acc + (fr.totalAmount - fr.paidAmount),
        0
      ),
      feesCollected: feeRecords.reduce((acc, fr) => acc + fr.paidAmount, 0),
      unassignedFaculty: teachers.filter(
        (t) => !t.subjectIds || t.subjectIds.length === 0
      ).length,
    }; // --- FIXED Real-time Fee Collection Overview ---

    const ACADEMIC_MONTHS_FULL = [
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

    const sessionStartDate = new Date(
      branch.academicSessionStartDate || `${new Date().getFullYear()}-04-01`
    );
    const today = new Date("2024-09-15"); // To ensure demo data extends to September as requested.
    let monthsToDisplay = 0;
    if (today.getFullYear() > sessionStartDate.getFullYear()) {
      monthsToDisplay = 12 - sessionStartDate.getMonth() + today.getMonth() + 1;
    } else if (today.getFullYear() === sessionStartDate.getFullYear()) {
      monthsToDisplay = today.getMonth() - sessionStartDate.getMonth() + 1;
    }
    monthsToDisplay = Math.min(12, Math.max(0, monthsToDisplay));

    const currentSessionMonthsFull = ACADEMIC_MONTHS_FULL.slice(
      0,
      monthsToDisplay
    );
    const currentSessionMonthsShort = currentSessionMonthsFull.map((m) =>
      m.substring(0, 3)
    );

    const monthlyTotals: { [month: string]: { due: number; paid: number } } =
      {};
    currentSessionMonthsShort.forEach((m) => {
      monthlyTotals[m] = { due: 0, paid: 0 };
    });

    for (const student of students) {
      const sClass = this.getClassById(student.classId || "");
      if (!sClass || !sClass.feeTemplateId) continue;
      const feeTemplate = (db.feeTemplates as any[]).find(
        (ft) => ft.id === sClass.feeTemplateId
      );
      if (!feeTemplate || !feeTemplate.monthlyBreakdown) continue;

      feeTemplate.monthlyBreakdown.forEach((mb: MonthlyFee) => {
        const monthShort = mb.month.substring(0, 3);
        if (monthlyTotals[monthShort]) {
          monthlyTotals[monthShort].due += mb.total || 0;
        }
      });

      const feeRecord = feeRecords.find((fr) => fr.studentId === student.id);
      if (feeRecord) {
        let paidTracker = feeRecord.paidAmount;
        paidTracker -= Math.min(
          paidTracker,
          feeRecord.previousSessionDues || 0
        );

        for (const monthFullName of currentSessionMonthsFull) {
          const templateMonthDetail = feeTemplate.monthlyBreakdown.find(
            (m: MonthlyFee) => m.month === monthFullName
          );
          if (!templateMonthDetail) continue;

          const dueForMonth = templateMonthDetail.total || 0;
          const paidForMonth = Math.min(paidTracker, dueForMonth);

          const monthShort = monthFullName.substring(0, 3);
          monthlyTotals[monthShort].paid += paidForMonth;
          paidTracker -= paidForMonth;

          if (paidTracker <= 0) break;
        }
      }
    }

    const feeOverview = currentSessionMonthsShort.map((month) => ({
      month,
      paid: monthlyTotals[month].paid,
      pending: Math.max(
        0,
        monthlyTotals[month].due - monthlyTotals[month].paid
      ),
    }));

    const todaysAttendance = (
      db.teacherAttendance as TeacherAttendanceRecord[]
    ).filter(
      (r) =>
        r.branchId === branchId &&
        r.date === new Date().toISOString().split("T")[0]
    );
    const teacherAttendanceStatus: {
      teacherId: string;
      teacherName: string;
      status: "Absent" | "Not Marked";
    }[] = [];
    for (const teacher of teachers) {
      const attendanceRecord = todaysAttendance.find(
        (r) => r.teacherId === teacher.id
      );
      if (!attendanceRecord) {
        teacherAttendanceStatus.push({
          teacherId: teacher.id,
          teacherName: teacher.name,
          status: "Not Marked",
        });
      } else if (attendanceRecord.status === "Absent") {
        teacherAttendanceStatus.push({
          teacherId: teacher.id,
          teacherName: teacher.name,
          status: "Absent",
        });
      }
    }

    const pendingEvents = (db.schoolEvents as SchoolEvent[]).filter(
      (e) => e.branchId === branchId && e.status === "Pending"
    );
    const classFeeSummaries = await this.getClassFeeSummaries(branchId);

    return {
      summary,
      admissionRequests: applications,
      feeOverview,
      teacherAttendanceStatus,
      classFeeSummaries,
      pendingEvents,
      academicRequests: {
        count: academicRequestsCount,
        requests: recentAcademicRequests,
      },
    };
  }

  async updateApplicationStatus(
    appId: string,
    status: "approved" | "denied"
  ): Promise<void> {
    const app = (db.applications as Application[]).find((a) => a.id === appId);
    if (app) {
      app.status = status;
      saveDb();
    }
  }

  async getApplications(branchId: string): Promise<Application[]> {
    return (db.applications as Application[]).filter(
      (a) => a.branchId === branchId
    );
  }

  async submitFacultyApplication(
    data: Partial<Teacher>,
    branchId: string,
    registrarId: string
  ): Promise<void> {
    const newApp = {
      id: this.generateId("fac-app"),
      branchId,
      name: data.name!,
      qualification: data.qualification!,
      doj: data.doj!,
      gender: data.gender!,
      email: data.email,
      phone: data.phone,
      subjectIds: data.subjectIds!,
      status: "pending",
      submittedAt: new Date(),
      submittedBy: this.getUserById(registrarId)?.name || "Registrar",
    };
    (db.facultyApplications as any[]).push(newApp);
    saveDb();
  }

  async admitStudent(
    studentData: Partial<Student>,
    branchId: string
  ): Promise<{ credentials: { id: string; password: string } }> {
    const newStudentId = generateUniqueId("student");
    const newPassword = this.generatePassword();
    const newStudent: Student = {
      id: newStudentId,
      branchId,
      name: studentData.name!,
      gradeLevel: studentData.gradeLevel!,
      parentId: "",
      classId: studentData.classId,
      status: "active",
      dob: studentData.dob!,
      address: studentData.address!,
      gender: studentData.gender,
      guardianInfo: studentData.guardianInfo!,
      leaveBalances: { sick: 10, planned: 5 },
    };
    const newStudentUser: User = {
      id: newStudentId,
      name: studentData.name!,
      email: `${newStudentId}@student.verticx.com`,
      role: "Student",
      password: newPassword,
      branchId,
    };
    let parent = (db.parents as Parent[]).find(
      (p) => p.id === (studentData.guardianInfo as any).email
    );
    if (!parent) {
      const parentId = this.generateId("parent");
      parent = {
        id: parentId,
        name: studentData.guardianInfo!.name,
        childrenIds: [],
      };
      (db.parents as Parent[]).push(parent);
      const newParentUser: User = {
        id: parentId,
        name: studentData.guardianInfo!.name,
        email: studentData.guardianInfo!.email,
        role: "Parent",
        password: this.generatePassword(),
        childrenIds: [newStudentId],
        branchId,
      };
      (db.users as User[]).push(newParentUser);
    } else {
      parent.childrenIds.push(newStudentId);
    }
    newStudent.parentId = parent.id;
    (db.students as Student[]).push(newStudent);
    (db.users as User[]).push(newStudentUser);
    saveDb();
    return { credentials: { id: newStudentId, password: newPassword } };
  }

  async createFeeTemplate(template: Omit<FeeTemplate, "id">): Promise<void> {
    (db.feeTemplates as FeeTemplate[]).push({
      id: this.generateId("fee-tpl"),
      ...template,
    });
    saveDb();
  } // ✨ FIX: Added missing getFeeTemplates method

  async getFeeTemplates(branchId: string): Promise<FeeTemplate[]> {
    return (db.feeTemplates as FeeTemplate[]).filter(
      (t) => t.branchId === branchId
    );
  }

  async requestFeeTemplateUpdate(
    templateId: string,
    newData: Partial<FeeTemplate>,
    reason: string,
    registrarId: string
  ): Promise<void> {
    const original = (db.feeTemplates as FeeTemplate[]).find(
      (t) => t.id === templateId
    )!;
    const req: FeeRectificationRequest = {
      id: this.generateId("fee-req"),
      branchId: original.branchId,
      registrarId,
      registrarName: this.getUserById(registrarId)?.name || "",
      templateId,
      requestType: "update",
      originalData: JSON.stringify(original),
      newData: JSON.stringify(newData),
      reason,
      status: "Pending",
      requestedAt: new Date(),
    };
    (db.feeRectificationRequests as FeeRectificationRequest[]).push(req);
    saveDb();
  }

  async requestFeeTemplateDeletion(
    templateId: string,
    reason: string,
    registrarId: string
  ): Promise<void> {
    const original = (db.feeTemplates as FeeTemplate[]).find(
      (t) => t.id === templateId
    )!;
    const req: FeeRectificationRequest = {
      id: this.generateId("fee-req"),
      branchId: original.branchId,
      registrarId,
      registrarName: this.getUserById(registrarId)?.name || "",
      templateId,
      requestType: "delete",
      originalData: JSON.stringify(original),
      reason,
      status: "Pending",
      requestedAt: new Date(),
    };
    (db.feeRectificationRequests as FeeRectificationRequest[]).push(req);
    saveDb();
  }

  async promoteStudents(
    studentIds: string[],
    targetClassId: string,
    academicSession: string
  ): Promise<void> {
    await this.delay(1000);
    const targetClass = this.getClassById(targetClassId);
    if (!targetClass) throw new Error("Target class not found");
    const newGradeLevel = targetClass.gradeLevel;

    for (const studentId of studentIds) {
      const student = this.getStudentById(studentId);
      if (!student) continue; // 1. Calculate outstanding balance from the old session

      const feeRecord = (db.feeRecords as FeeRecord[]).find(
        (fr) => fr.studentId === studentId
      );
      const outstandingBalance = feeRecord
        ? feeRecord.totalAmount - feeRecord.paidAmount
        : 0; // 2. Archive previous records

      const oldClass = this.getClassById(student.classId || "");
      const studentGrades = (db.grades as Grade[]).filter(
        (g) => g.studentId === studentId
      );
      const studentAttendance = (db.attendance as AttendanceRecord[]).filter(
        (a) => a.studentId === studentId
      );
      const archiveRecord = {
        id: this.generateId("archive"),
        studentId,
        academicSession,
        grades: studentGrades,
        attendance: studentAttendance,
        finalClass: oldClass
          ? `Grade ${oldClass.gradeLevel} - ${oldClass.section}`
          : `Grade ${student.gradeLevel}`,
        archivedAt: new Date(),
      };
      (db.archivedStudentRecords as any[]).push(archiveRecord); // 3. Clean up old records for the new session

      db.grades = (db.grades as Grade[]).filter(
        (g) => g.studentId !== studentId
      );
      db.attendance = (db.attendance as AttendanceRecord[]).filter(
        (a) => a.studentId !== studentId
      ); // 4. Update fee record for the new session

      const newFeeTemplate = (db.feeTemplates as FeeTemplate[]).find(
        (ft) => ft.id === targetClass.feeTemplateId
      );
      const newSessionFeeAmount = newFeeTemplate ? newFeeTemplate.amount : 0;
      const newTotalAmount = newSessionFeeAmount + outstandingBalance;

      if (feeRecord) {
        feeRecord.totalAmount = newTotalAmount;
        feeRecord.paidAmount = 0; // Reset paid amount for the new session
        feeRecord.previousSessionDues =
          outstandingBalance > 0 ? outstandingBalance : 0;
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(10);
        feeRecord.dueDate = nextMonth;
      } else if (newTotalAmount > 0) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(10);
        (db.feeRecords as FeeRecord[]).push({
          studentId,
          totalAmount: newTotalAmount,
          paidAmount: 0,
          previousSessionDues: outstandingBalance > 0 ? outstandingBalance : 0,
          dueDate: nextMonth,
        });
      } // 5. Update student's class and grade

      if (oldClass) {
        oldClass.studentIds = oldClass.studentIds.filter(
          (id) => id !== studentId
        );
      }
      student.gradeLevel = newGradeLevel;
      student.classId = targetClassId;
      if (!targetClass.studentIds.includes(studentId)) {
        targetClass.studentIds.push(studentId);
      }
    }
    saveDb();
  }

  async demoteStudents(
    studentIds: string[],
    targetClassId: string
  ): Promise<void> {
    await this.delay(800);
    const targetClass = this.getClassById(targetClassId);
    if (!targetClass) throw new Error("Target class not found");
    const newGradeLevel = targetClass.gradeLevel;
    for (const studentId of studentIds) {
      const student = this.getStudentById(studentId);
      if (!student) continue;
      const oldClass = this.getClassById(student.classId || "");
      if (oldClass) {
        oldClass.studentIds = oldClass.studentIds.filter(
          (id) => id !== studentId
        );
      }
      student.gradeLevel = newGradeLevel;
      student.classId = targetClassId;
      if (!targetClass.studentIds.includes(studentId)) {
        targetClass.studentIds.push(studentId);
      }
    }
    saveDb();
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

  async getRectificationRequestsByBranch(
    branchId: string
  ): Promise<RectificationRequest[]> {
    await this.delay(200);
    return (db.rectificationRequests as RectificationRequest[]).filter(
      (r) => r.branchId === branchId
    );
  }

  async getSyllabusChangeRequestsByBranch(
    branchId: string
  ): Promise<SyllabusChangeRequest[]> {
    await this.delay(200);
    return (db.syllabusChangeRequests as SyllabusChangeRequest[]).filter(
      (r) => r.branchId === branchId
    );
  }

  async getExamMarkRectificationRequestsByBranch(
    branchId: string
  ): Promise<ExamMarkRectificationRequest[]> {
    await this.delay(200);
    return (
      db.examMarkRectificationRequests as ExamMarkRectificationRequest[]
    ).filter((r) => r.branchId === branchId);
  }

  async getTimetableConfig(classId: string): Promise<TimetableConfig | null> {
    await this.delay(100);
    return (
      (db.timetableConfigs as TimetableConfig[]).find(
        (c) => c.classId === classId
      ) || null
    );
  }

  async createTimetableConfig(
    classId: string,
    timeSlots: { startTime: string; endTime: string }[]
  ): Promise<void> {
    await this.delay(300);
    let config = (db.timetableConfigs as TimetableConfig[]).find(
      (c) => c.classId === classId
    );
    if (config) {
      config.timeSlots = timeSlots;
    } else {
      config = { id: this.generateId("tt-conf"), classId, timeSlots };
      (db.timetableConfigs as TimetableConfig[]).push(config);
    }
    saveDb();
  }

  async getAvailableTeachersForSlot(
    branchId: string,
    day: string,
    startTime: string
  ): Promise<Teacher[]> {
    await this.delay(150);
    const busyTeacherIds = new Set(
      (db.timetable as TimetableSlot[])
        .filter((s) => s.day === day && s.startTime === startTime)
        .map((s) => s.teacherId)
    );
    return (db.teachers as Teacher[]).filter(
      (t) => t.branchId === branchId && !busyTeacherIds.has(t.id)
    );
  }

  async setTimetableSlot(slotData: Omit<TimetableSlot, "id">): Promise<void> {
    await this.delay(200);
    const existing = (db.timetable as TimetableSlot[]).find(
      (s) =>
        s.classId === slotData.classId &&
        s.day === slotData.day &&
        s.startTime === slotData.startTime
    );
    if (existing) {
      Object.assign(existing, slotData);
    } else {
      (db.timetable as TimetableSlot[]).push({
        id: this.generateId("tt-slot"),
        ...slotData,
      });
    }
    saveDb();
  }

  async deleteTimetableSlot(slotId: string): Promise<void> {
    await this.delay(200);
    db.timetable = (db.timetable as TimetableSlot[]).filter(
      (s) => s.id !== slotId
    );
    saveDb();
  }

  async deleteStudent(studentId: string): Promise<void> {
    await this.delay(500);
    db.students = (db.students as Student[]).filter((s) => s.id !== studentId);
    db.users = (db.users as User[]).filter((u) => u.id !== studentId);
    (db.schoolClasses as SchoolClass[]).forEach((c) => {
      c.studentIds = c.studentIds.filter((id) => id !== studentId);
    });
    db.attendance = (db.attendance as AttendanceRecord[]).filter(
      (a) => a.studentId !== studentId
    );
    db.grades = (db.grades as Grade[]).filter((g) => g.studentId !== studentId);
    db.feeRecords = (db.feeRecords as FeeRecord[]).filter(
      (f) => f.studentId !== studentId
    );
    saveDb();
  }

  async suspendStudent(
    studentId: string,
    reason: SuspensionRecord["reason"],
    endDate: string
  ): Promise<void> {
    await this.delay(300);
    const student = this.getStudentById(studentId);
    if (student) {
      student.status = "suspended";
      const newRecord: SuspensionRecord = {
        id: this.generateId("susp"),
        studentId,
        reason,
        endDate,
        createdAt: new Date(),
      };
      (db.suspensionRecords as SuspensionRecord[]).push(newRecord);
      saveDb();
    }
  }

  async removeSuspension(studentId: string): Promise<void> {
    await this.delay(300);
    const student = this.getStudentById(studentId);
    if (student) {
      student.status = "active";
    }
    db.suspensionRecords = (db.suspensionRecords as SuspensionRecord[]).filter(
      (r) => r.studentId !== studentId
    );
    saveDb();
  }

  async markFeesAsPaidAndUnsuspend(studentId: string): Promise<void> {
    await this.delay(500);
    const feeRecord = (db.feeRecords as FeeRecord[]).find(
      (fr) => fr.studentId === studentId
    );
    if (feeRecord) {
      feeRecord.paidAmount = feeRecord.totalAmount;
    }
    await this.removeSuspension(studentId);
  }

  async processRectificationRequest(
    requestId: string,
    reviewerId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    await this.delay(500);
    const req = (db.rectificationRequests as RectificationRequest[]).find(
      (r) => r.id === requestId
    );
    if (req) {
      req.status = status;
      req.reviewedBy = this.getUserById(reviewerId)?.name;
      req.reviewedAt = new Date();
      if (status === "Approved") {
        if (req.type === "Attendance") {
          console.log(
            `Approving attendance change for ${req.details.studentName} from ${req.details.from} to ${req.details.to}`
          );
        } else if (req.type === "Grade") {
          console.log(
            `Approving grade change for ${req.details.studentName} from ${req.details.from} to ${req.details.to}`
          );
        }
      }
      saveDb();
    }
  }

  async processExamMarkRectificationRequest(
    requestId: string,
    reviewerId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    await this.delay(500);
    const req = (
      db.examMarkRectificationRequests as ExamMarkRectificationRequest[]
    ).find((r) => r.id === requestId);
    if (req) {
      req.status = status;
      req.reviewedBy = this.getUserById(reviewerId)?.name;
      req.reviewedAt = new Date();
      if (status === "Approved") {
        const mark = (db.examMarks as ExamMark[]).find(
          (m) =>
            m.studentId === req.details.studentId &&
            m.examScheduleId === req.details.examScheduleId
        );
        if (mark) {
          mark.score = Number(req.details.toScore);
        }
      }
      saveDb();
    }
  }

  async processSyllabusChangeRequest(
    requestId: string,
    reviewerId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    await this.delay(500);
    const req = (db.syllabusChangeRequests as SyllabusChangeRequest[]).find(
      (r) => r.id === requestId
    );
    if (req) {
      req.status = status;
      req.reviewedBy = this.getUserById(reviewerId)?.name;
      req.reviewedAt = new Date();
      if (status === "Approved") {
        if (req.requestType === "delete") {
          db.lectures = (db.lectures as Lecture[]).filter(
            (l) => l.id !== req.lectureId
          );
        } else if (req.requestType === "update" && req.newData) {
          const lecture = (db.lectures as Lecture[]).find(
            (l) => l.id === req.lectureId
          );
          if (lecture) {
            const newLectureData = JSON.parse(req.newData) as Partial<Lecture>;
            Object.assign(lecture, newLectureData);
          }
        }
      }
      saveDb();
    }
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

  async getFacultyApplicationsByBranch(
    branchId: string
  ): Promise<FacultyApplication[]> {
    return (db.facultyApplications as FacultyApplication[]).filter(
      (a) => a.branchId === branchId
    );
  }

  async getClassFeeSummaries(branchId: string): Promise<ClassFeeSummary[]> {
    const classes = (db.schoolClasses as SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
    const feeRecords = (db.feeRecords as FeeRecord[]).filter(
      (fr) => this.getStudentById(fr.studentId)?.branchId === branchId
    );

    return classes.map((c) => {
      const studentIds = new Set(c.studentIds);
      const classFeeRecords = feeRecords.filter((fr) =>
        studentIds.has(fr.studentId)
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
  }

  async getTimetableForClass(classId: string): Promise<TimetableSlot[]> {
    await this.delay(100);
    return (db.timetable as TimetableSlot[]).filter(
      (s) => s.classId === classId
    );
  }

  async getDailyAttendanceForClass(
    classId: string,
    date: string
  ): Promise<{ isSaved: boolean; attendance: AttendanceListItem[] }> {
    const studentsInClass = await this.getStudentsForClass(classId);
    const studentIds = new Set(studentsInClass.map((s) => s.id));
    const attendanceForDay = (db.attendance as AttendanceRecord[]).filter(
      (r) => r.date === date && studentIds.has(r.studentId)
    );

    const isSaved = attendanceForDay.length > 0;
    const attendanceStatusMap = new Map<string, AttendanceStatus>();
    attendanceForDay.forEach((rec) => {
      if (attendanceStatusMap.get(rec.studentId) !== "Absent") {
        attendanceStatusMap.set(rec.studentId, rec.status);
      }
    });

    const attendanceList = studentsInClass.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      status: attendanceStatusMap.get(s.id) || "Present", // Default to Present if not marked
    }));

    return { isSaved, attendance: attendanceList };
  }

  async getAllStaffForBranch(
    branchId: string
  ): Promise<(User & { attendancePercentage?: number })[]> {
    const staffRoles: UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "Principal",
      "SupportStaff",
    ];

    // 1️⃣ Fetch staff from Prisma
    const staff = await prisma.user.findMany({
      where: {
        branchId: branchId ?? undefined,
        role: { in: staffRoles },
      },
      include: {
        teacher: true,
      },
    });

    // 2️⃣ Fetch attendance records
    const allTeacherAttendance = await prisma.teacherAttendanceRecord.findMany({
      where: { branchId: branchId ?? undefined },
    });

    // 3️⃣ Compute attendance %
    return staff.map((s) => {
      const staffRecords = allTeacherAttendance.filter(
        (r) => r.teacherId === s.id
      );

      const presentDays = staffRecords.filter(
        (r) => r.status === "Present" || r.status === "HalfDay"
      ).length;

      const totalDays = staffRecords.length;

      // ✅ Normalize Prisma output for strict User type
      const normalizedUser: User = {
        ...s,
        branchId: s.branchId ?? undefined,
        phone: s.phone ?? undefined,
        designation: s.designation ?? undefined,
        status:
          s.status === null
            ? "active" // default fallback if null
            : (s.status as "active" | "suspended" | undefined),
      };
      return {
        ...normalizedUser,
        attendancePercentage:
          totalDays > 0 ? (presentDays / totalDays) * 100 : 100,
      };
    });
  }

  async getTeacherAttendance(
    branchId: string,
    date: string
  ): Promise<{ isSaved: boolean; attendance: TeacherAttendanceRecord[] }> {
    const records = (db.teacherAttendance as TeacherAttendanceRecord[]).filter(
      (r) => r.branchId === branchId && r.date === date
    );
    return { isSaved: records.length > 0, attendance: records };
  }

  async saveTeacherAttendance(
    records: Omit<TeacherAttendanceRecord, "id">[]
  ): Promise<void> {
    records.forEach((record) => {
      const existing = (db.teacherAttendance as TeacherAttendanceRecord[]).find(
        (r) => r.teacherId === record.teacherId && r.date === record.date
      );
      if (existing) {
        existing.status = record.status;
      } else {
        (db.teacherAttendance as TeacherAttendanceRecord[]).push({
          id: this.generateId("t-att"),
          ...record,
        });
      }
    });
    saveDb();
  }

  async getLeaveSettingsForBranch(branchId: string): Promise<LeaveSetting[]> {
    const defaultSettings: LeaveSetting[] = [
      {
        id: `${branchId}-Student`,
        branchId,
        role: "Student",
        settings: { Sick: 10, Planned: 5 },
      },
      {
        id: `${branchId}-Teacher`,
        branchId,
        role: "Teacher",
        settings: { Sick: 12, Casual: 10, Earned: 15 },
      },
      {
        id: `${branchId}-Registrar`,
        branchId,
        role: "Registrar",
        settings: { Sick: 12, Casual: 10 },
      },
      {
        id: `${branchId}-Librarian`,
        branchId,
        role: "Librarian",
        settings: { Sick: 12, Casual: 10 },
      },
      {
        id: `${branchId}-SupportStaff`,
        branchId,
        role: "SupportStaff",
        settings: { Sick: 10, Casual: 5 },
      },
    ];

    const savedSettings = (db.leaveSettings as LeaveSetting[]).filter(
      (s) => s.branchId === branchId
    );

    if (savedSettings.length === 0) {
      (db.leaveSettings as LeaveSetting[]).push(...defaultSettings);
      saveDb();
      return defaultSettings;
    }

    defaultSettings.forEach((def) => {
      if (!savedSettings.some((s) => s.role === def.role)) {
        savedSettings.push(def);
        (db.leaveSettings as LeaveSetting[]).push(def);
      }
    });
    saveDb();

    return savedSettings;
  }

  async updateLeaveSettingsForBranch(
    branchId: string,
    settingsToUpdate: LeaveSetting[]
  ): Promise<void> {
    settingsToUpdate.forEach((setting) => {
      const index = (db.leaveSettings as LeaveSetting[]).findIndex(
        (s) => s.id === setting.id
      );
      if (index > -1) {
        db.leaveSettings[index] = setting;
      } else {
        (db.leaveSettings as LeaveSetting[]).push(setting);
      }
    });
    saveDb();
  }

  async createSchoolClass(
    branchId: string,
    data: { gradeLevel: number; section: string }
  ): Promise<void> {
    const newClass: SchoolClass = {
      id: this.generateId("class"),
      branchId,
      studentIds: [],
      subjectIds: [],
      ...data,
    };
    (db.schoolClasses as SchoolClass[]).push(newClass);
    saveDb();
  }

  async updateSchoolClass(
    classId: string,
    data: { gradeLevel: number; section: string }
  ): Promise<void> {
    const sClass = this.getClassById(classId);
    if (sClass) {
      Object.assign(sClass, data);
      saveDb();
    }
  }

  async deleteSchoolClass(classId: string): Promise<void> {
    const sClass = this.getClassById(classId);
    if (sClass) {
      sClass.studentIds.forEach((studentId) => {
        const student = this.getStudentById(studentId);
        if (student) student.classId = undefined;
      });
    }
    db.schoolClasses = (db.schoolClasses as SchoolClass[]).filter(
      (c) => c.id !== classId
    );
    saveDb();
  }

  async updateClassSubjects(
    classId: string,
    subjectIds: string[]
  ): Promise<void> {
    const sClass = this.getClassById(classId);
    if (sClass) {
      sClass.subjectIds = subjectIds;
      saveDb();
    }
  }

  async assignStudentsToClass(
    classId: string,
    studentIds: string[]
  ): Promise<void> {
    const sClass = this.getClassById(classId);
    if (sClass) {
      studentIds.forEach((studentId) => {
        if (!sClass.studentIds.includes(studentId)) {
          sClass.studentIds.push(studentId);
          const student = this.getStudentById(studentId);
          if (student) student.classId = classId;
        }
      });
      saveDb();
    }
  }

  async removeStudentFromClass(
    classId: string,
    studentId: string
  ): Promise<void> {
    const sClass = this.getClassById(classId);
    if (sClass) {
      sClass.studentIds = sClass.studentIds.filter((id) => id !== studentId);
      const student = this.getStudentById(studentId);
      if (student) student.classId = undefined;
      saveDb();
    }
  } // FIX: Added missing assignClassMentor method

  async assignClassMentor(classId: string, teacherId: string): Promise<void> {
    const sClass = this.getClassById(classId);
    if (sClass) {
      sClass.classMentorId = teacherId;
      saveDb();
    }
  } // FIX: Added missing assignFeeTemplateToClass method

  async assignFeeTemplateToClass(
    classId: string,
    feeTemplateId: string
  ): Promise<void> {
    const sClass = this.getClassById(classId);
    if (sClass) {
      sClass.feeTemplateId = feeTemplateId;
      saveDb();
    }
  }

  async updateSubject(
    subjectId: string,
    updates: Partial<Subject>
  ): Promise<void> {
    const subject = this.getSubjectById(subjectId);
    if (subject) {
      Object.assign(subject, updates);
      saveDb();
    }
  }

  async deleteSubject(subjectId: string): Promise<void> {
    db.subjects = (db.subjects as Subject[]).filter((s) => s.id !== subjectId);
    (db.schoolClasses as SchoolClass[]).forEach((c) => {
      c.subjectIds = c.subjectIds.filter((id) => id !== subjectId);
    });
    saveDb();
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

  async getSchoolDocuments(branchId: string): Promise<SchoolDocument[]> {
    return (db.schoolDocuments as SchoolDocument[]).filter(
      (d) => d.branchId === branchId
    );
  }

  async createSchoolEvent(
    eventData: Omit<SchoolEvent, "id" | "status" | "createdAt">,
    userRole: UserRole
  ): Promise<void> {
    const newEvent: SchoolEvent = {
      id: this.generateId("evt"),
      ...eventData,
      status: "Pending",
      createdAt: new Date(),
    };
    (db.schoolEvents as SchoolEvent[]).push(newEvent);
    saveDb();
  }

  async updateSchoolEvent(
    eventId: string,
    eventData: Partial<SchoolEvent>,
    userRole: UserRole
  ): Promise<void> {
    const event = (db.schoolEvents as SchoolEvent[]).find(
      (e) => e.id === eventId
    );
    if (event) {
      Object.assign(event, eventData);
      event.status = "Pending";
      saveDb();
    }
  }

  async getHostels(branchId: string): Promise<Hostel[]> {
    return (db.hostels as Hostel[]).filter((h) => h.branchId === branchId);
  }

  async getAllRoomsByBranch(branchId: string): Promise<Room[]> {
    const hostelIds = new Set(
      (await this.getHostels(branchId)).map((h) => h.id)
    );
    return (db.rooms as Room[]).filter((r) => hostelIds.has(r.hostelId));
  }

  async deleteHostel(hostelId: string): Promise<void> {
    const roomsToDelete = (db.rooms as Room[]).filter(
      (r) => r.hostelId === hostelId
    );
    if (roomsToDelete.some((r) => r.occupantIds.length > 0)) {
      throw new Error(
        "Cannot delete hostel with occupants. Please unassign all students first."
      );
    }
    db.rooms = (db.rooms as Room[]).filter((r) => r.hostelId !== hostelId);
    db.hostels = (db.hostels as Hostel[]).filter((h) => h.id !== hostelId);
    saveDb();
  }

  async getInventory(branchId: string): Promise<InventoryItem[]> {
    return (db.inventoryItems as InventoryItem[]).filter(
      (i) => i.branchId === branchId
    );
  }

  async getInventoryLogs(branchId: string): Promise<InventoryLog[]> {
    const itemIds = new Set(
      (await this.getInventory(branchId)).map((i) => i.id)
    );
    return (db.inventoryLogs as InventoryLog[]).filter((l) =>
      itemIds.has(l.itemId)
    );
  }

  async createInventoryItem(
    data: Partial<InventoryItem>,
    reason: string,
    user: string,
    branchId: string
  ): Promise<void> {
    const newItem: InventoryItem = {
      id: this.generateId("inv"),
      branchId,
      ...data,
    } as InventoryItem;
    (db.inventoryItems as InventoryItem[]).push(newItem);
    const newLog: InventoryLog = {
      id: this.generateId("log"),
      itemId: newItem.id,
      change: newItem.quantity,
      reason,
      timestamp: new Date(),
      user,
    };
    (db.inventoryLogs as InventoryLog[]).push(newLog);
    saveDb();
  }

  async updateInventoryItem(
    itemId: string,
    data: Partial<InventoryItem>,
    reason: string,
    user: string
  ): Promise<void> {
    const item = (db.inventoryItems as InventoryItem[]).find(
      (i) => i.id === itemId
    );
    if (item) {
      const change = (data.quantity || 0) - item.quantity;
      if (change !== 0) {
        const newLog: InventoryLog = {
          id: this.generateId("log"),
          itemId,
          change,
          reason,
          timestamp: new Date(),
          user,
        };
        (db.inventoryLogs as InventoryLog[]).push(newLog);
      }
      Object.assign(item, data);
      saveDb();
    }
  }

  async deleteInventoryItem(itemId: string): Promise<void> {
    db.inventoryItems = (db.inventoryItems as InventoryItem[]).filter(
      (i) => i.id !== itemId
    );
    db.inventoryLogs = (db.inventoryLogs as InventoryLog[]).filter(
      (l) => l.itemId !== itemId
    );
    saveDb();
  }

  async getUnassignedMembers(
    branchId: string
  ): Promise<{ students: Student[]; teachers: Teacher[] }> {
    const students = (db.students as Student[]).filter(
      (s) => s.branchId === branchId && !s.transportInfo
    );
    const teachers = (db.teachers as Teacher[]).filter(
      (t) => t.branchId === branchId && !t.transportInfo
    );
    return { students, teachers };
  }

  async assignMemberToRoute(
    routeId: string,
    memberId: string,
    memberType: "Student" | "Teacher",
    stopId: string
  ): Promise<void> {
    const route = (db.transportRoutes as TransportRoute[]).find(
      (r) => r.id === routeId
    );
    if (route) {
      if (!route.assignedMembers.some((m) => m.memberId === memberId)) {
        route.assignedMembers.push({ memberId, memberType, stopId });
        const member =
          memberType === "Student"
            ? this.getStudentById(memberId)
            : this.getTeacherById(memberId);
        if (member) {
          member.transportInfo = { routeId, stopId };
        }
        saveDb();
      }
    }
  }

  async removeMemberFromRoute(
    routeId: string,
    memberId: string
  ): Promise<void> {
    const route = (db.transportRoutes as TransportRoute[]).find(
      (r) => r.id === routeId
    );
    if (route) {
      const memberType = route.assignedMembers.find(
        (m) => m.memberId === memberId
      )?.memberType;
      route.assignedMembers = route.assignedMembers.filter(
        (m) => m.memberId !== memberId
      );
      const member =
        memberType === "Student"
          ? this.getStudentById(memberId)
          : this.getTeacherById(memberId);
      if (member) {
        member.transportInfo = undefined;
      }
      saveDb();
    }
  }

  async updateTransportRoute(
    routeId: string,
    data: Partial<TransportRoute>
  ): Promise<void> {
    const route = (db.transportRoutes as TransportRoute[]).find(
      (r) => r.id === routeId
    );
    if (route) {
      Object.assign(route, data);
      saveDb();
    }
  }

  async createTransportRoute(data: Omit<TransportRoute, "id">): Promise<void> {
    // ✨ FIX: Changed signature and object creation to prevent overwriting the ID
    const newRoute: TransportRoute = {
      ...data,
      id: this.generateId("route"),
    };
    (db.transportRoutes as TransportRoute[]).push(newRoute);
    saveDb();
  }

  async getTransportRoutes(branchId: string): Promise<TransportRoute[]> {
    return (db.transportRoutes as TransportRoute[]).filter(
      (r) => r.branchId === branchId
    );
  }

  async deleteTransportRoute(routeId: string): Promise<void> {
    const route = (db.transportRoutes as TransportRoute[]).find(
      (r) => r.id === routeId
    );
    if (route) {
      route.assignedMembers.forEach((m) => {
        const member =
          m.memberType === "Student"
            ? this.getStudentById(m.memberId)
            : this.getTeacherById(m.memberId);
        if (member) member.transportInfo = undefined;
      });
    }
    db.transportRoutes = (db.transportRoutes as TransportRoute[]).filter(
      (r) => r.id !== routeId
    );
    saveDb();
  }

  async getDefaultersForClass(classId: string): Promise<DefaulterDetails[]> {
    const sClass = this.getClassById(classId)!;
    const studentIds = new Set(sClass.studentIds);
    const feeRecords = (db.feeRecords as FeeRecord[]).filter(
      (fr) => studentIds.has(fr.studentId) && fr.totalAmount > fr.paidAmount
    );
    return feeRecords.map((fr) => {
      const student = this.getStudentById(fr.studentId)!;
      return {
        studentId: student.id,
        studentName: student.name,
        rollNo: student.rollNo,
        pendingAmount: fr.totalAmount - fr.paidAmount,
        guardianPhone: student.guardianInfo.phone,
      };
    });
  }

  async createExamination(
    branchId: string,
    data: { name: string; startDate: string; endDate: string }
  ): Promise<void> {
    const newExam: Examination = {
      id: this.generateId("exam"),
      branchId,
      ...data,
      status: "Upcoming",
      resultStatus: "Pending",
    };
    (db.examinations as Examination[]).push(newExam);
    saveDb();
  }

  async createExamSchedule(data: Omit<ExamSchedule, "id">): Promise<void> {
    const newSchedule: ExamSchedule = {
      id: this.generateId("ex-sch"),
      ...data,
    };
    (db.examSchedules as ExamSchedule[]).push(newSchedule);
    saveDb();
  }

  async getExaminations(branchId: string): Promise<Examination[]> {
    return (db.examinations as Examination[]).filter(
      (e) => e.branchId === branchId
    );
  }

  async getExamSchedules(examinationId: string): Promise<ExamSchedule[]> {
    return (db.examSchedules as ExamSchedule[]).filter(
      (s) => s.examinationId === examinationId
    );
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

  async resetStudentAndParentPasswords(
    studentId: string,
    sentBy: string,
    branchId: string
  ): Promise<{
    student: { id: string; pass: string };
    parent: { id: string; pass: string } | null;
  }> {
    const studentUser = this.getUserById(studentId)!;
    const student = this.getStudentById(studentId)!;
    const parentUser = this.getUserById(student.parentId);

    const newStudentPass = this.generatePassword();
    studentUser.password = newStudentPass;

    const result: any = {
      student: { id: studentUser.id, pass: newStudentPass },
      parent: null,
    };

    if (parentUser) {
      const newParentPass = this.generatePassword();
      parentUser.password = newParentPass;
      result.parent = { id: parentUser.id, pass: newParentPass };
      console.log(
        `SMS to parent ${parentUser.name} with new creds for student and parent`
      );
    }
    saveDb();
    return result;
  }

  async getLeaveApplicationsForRegistrar(
    branchId: string
  ): Promise<LeaveApplication[]> {
    return (db.leaveApplications as LeaveApplication[]).filter(
      (l) => l.branchId === branchId && l.applicantRole === "Student"
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

          if (app.applicantRole === "Student") {
            const student = this.getStudentById(app.applicantId);
            if (student && student.classId) {
              const sClass = this.getClassById(student.classId);
              const courseIds = (db.courses as Course[])
                .filter((c) => sClass?.subjectIds.includes(c.subjectId))
                .map((c) => c.id);

              for (
                let d = new Date(start);
                d <= end;
                d.setDate(d.getDate() + 1)
              ) {
                const dateString = d.toISOString().split("T")[0];
                courseIds.forEach((courseId) => {
                  const existingRecord = (
                    db.attendance as AttendanceRecord[]
                  ).find(
                    (r) =>
                      r.studentId === app.applicantId &&
                      r.date === dateString &&
                      r.courseId === courseId
                  );
                  if (!existingRecord) {
                    (db.attendance as AttendanceRecord[]).push({
                      studentId: app.applicantId,
                      courseId: courseId,
                      date: dateString,
                      status: "Absent",
                      classId: student.classId,
                    });
                  } else {
                    existingRecord.status = "Absent";
                  }
                });
              }
            }
          }
        }
      }
      saveDb();
    }
  }

  async createHostel(data: Hostel, branchId: string): Promise<void> {
    const newHostel: Hostel = {
      ...data,
      id: this.generateId("hstl"),
      branchId,
    };
    (db.hostels as Hostel[]).push(newHostel);
    (data as any).rooms?.forEach((room: any) => {
      const newRoom: Room = {
        ...room,
        id: this.generateId("room"),
        hostelId: newHostel.id,
        occupantIds: [],
      };
      (db.rooms as Room[]).push(newRoom);
    });
    saveDb();
  }

  async updateHostel(
    hostelId: string,
    data: Partial<Hostel & { rooms: Partial<Room>[] }>
  ): Promise<void> {
    const hostel = (db.hostels as Hostel[]).find((h) => h.id === hostelId);
    if (hostel) {
      Object.assign(hostel, {
        name: data.name,
        warden: data.warden,
        wardenNumber: data.wardenNumber,
      }); // This logic assumes we can delete and re-add rooms for simplicity. A real app would need a more robust merge.
      db.rooms = (db.rooms as Room[]).filter((r) => r.hostelId !== hostelId);
      data.rooms?.forEach((room) => {
        const newRoom: Room = {
          ...room,
          id: this.generateId("room"),
          hostelId: hostel.id,
          occupantIds: [],
        } as Room;
        (db.rooms as Room[]).push(newRoom);
      });
      saveDb();
    }
  }

  async getRooms(hostelId: string): Promise<Room[]> {
    return (db.rooms as Room[]).filter((r) => r.hostelId === hostelId);
  }

  async assignStudentToRoom(studentId: string, roomId: string): Promise<void> {
    const room = (db.rooms as Room[]).find((r) => r.id === roomId);
    const student = this.getStudentById(studentId);
    if (room && student && room.occupantIds.length < room.capacity) {
      student.roomId = roomId;
      room.occupantIds.push(studentId);
      saveDb();
    }
  }

  async removeStudentFromRoom(studentId: string): Promise<void> {
    const student = this.getStudentById(studentId);
    if (student && student.roomId) {
      const room = (db.rooms as Room[]).find((r) => r.id === student.roomId);
      if (room) {
        room.occupantIds = room.occupantIds.filter((id) => id !== studentId);
      }
      student.roomId = undefined;
      saveDb();
    }
  } // New staff management methods

  async getSupportStaffByBranch(branchId: string): Promise<User[]> {
    await this.delay(200);
    return (db.users as User[]).filter(
      (u) => u.branchId === branchId && u.role === "SupportStaff"
    );
  }

  async createSupportStaff(
    branchId: string,
    data: {
      name: string;
      email: string;
      phone?: string;
      designation: string;
      salary: number;
    }
  ): Promise<{ credentials: { id: string; password: string } }> {
    const newId = this.generateId("SST");
    const newPassword = this.generatePassword();
    const newUser: User = {
      id: newId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: "SupportStaff",
      designation: data.designation,
      branchId,
      password: newPassword,
      salary: data.salary,
      leaveBalances: { sick: 10, casual: 5 }, // Default balances from settings
      status: "active",
    };
    (db.users as User[]).push(newUser);
    saveDb();
    return { credentials: { id: newId, password: newPassword } };
  }

  async updateTeacher(
    teacherId: string,
    updates: Partial<Teacher>
  ): Promise<void> {
    const teacher = this.getTeacherById(teacherId);
    if (teacher) {
      Object.assign(teacher, updates);
    }
    const user = this.getUserById(teacherId);
    if (user) {
      if (updates.name) user.name = updates.name;
      if (updates.email) user.email = updates.email;
      if (updates.phone) user.phone = updates.phone;
      if (updates.salary) user.salary = updates.salary;
    }
    saveDb();
  }

  async updateSupportStaff(
    staffId: string,
    updates: Partial<User>
  ): Promise<void> {
    const staff = this.getUserById(staffId);
    if (staff && staff.role === "SupportStaff") {
      Object.assign(staff, updates);
      saveDb();
    }
  }

  async deleteSupportStaff(staffId: string): Promise<void> {
    db.users = (db.users as User[]).filter((u) => u.id !== staffId);
    saveDb();
  }
}