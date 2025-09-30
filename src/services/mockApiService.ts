/**
 * @file verticx-backend/src/services/mockApiService.ts
 * @description A complete, unified mock API service for the backend.
 * This class simulates a database and implements all the business logic
 * previously found in the separate frontend ApiService files. It serves as
 * a stand-in for a real database service layer.
 */

import type * as Api from "../types/api";
// import { geminiService } from './geminiService'; // Uncomment if using Gemini Service

// =================================================================
// 1. MOCK DATABASE SIMULATION
// =================================================================
let db: { [key: string]: any[] } = {};

const saveDb = () => {
  // In a Node.js mock environment, this is a no-op. Data persists in the `db` object.
};

const ALL_FEATURES = {
  principal_students: true,
  principal_faculty: true,
  principal_classes: true,
  principal_finance: true,
  principal_attendance: true,
  principal_results: true,
  principal_staff_requests: true,
  principal_grievances: true,
  principal_events: true,
  principal_communication: true,
  principal_reports: true,
  principal_profile: true,
  principal_complaints: true,
  registrar_admissions: true,
  registrar_academic_requests: true,
  registrar_students: true,
  registrar_faculty: true,
  registrar_classes: true,
  registrar_fees: true,
  registrar_attendance: true,
  registrar_timetable: true,
  registrar_library: true,
  registrar_hostel: true,
  registrar_transport: true,
  registrar_inventory: true,
  registrar_documents: true,
  registrar_events: true,
  registrar_reports: true,
  registrar_communication: true,
  registrar_bulk_movement: true,
  teacher_attendance: true,
  teacher_gradebook: true,
  teacher_quizzes: true,
  teacher_syllabus: true,
  teacher_content: true,
  student_syllabus: true,
  student_content: true,
  student_assignments: true,
  student_grades: true,
  student_attendance: true,
  student_feedback: true,
  student_complaints: true,
  student_ask_ai: true,
  parent_academics: true,
  parent_fees: true,
  parent_complaints: true,
  parent_contact_teacher: true,
  online_payments_enabled: true,
  erp_billing_enabled: true,
};

const ALL_DB_KEYS = [
  "branches",
  "users",
  "parents",
  "students",
  "teachers",
  "subjects",
  "schoolClasses",
  "courses",
  "feeTemplates",
  "timetableConfigs",
  "timetable",
  "grades",
  "assignments",
  "attendance",
  "teacherAttendance",
  "feePayments",
  "feeAdjustments",
  "feeRecords",
  "syllabusProgress",
  "suspensionRecords",
  "libraryBooks",
  "bookIssuances",
  "registrationRequests",
  "applications",
  "announcements",
  "complaintsAboutStudents",
  "teacherComplaints",
  "lectures",
  "leaveApplications",
  "quizzes",
  "quizQuestions",
  "studentQuizzes",
  "studentAnswers",
  "meetingRequests",
  "facultyApplications",
  "schoolDocuments",
  "schoolEvents",
  "transportRoutes",
  "hostels",
  "rooms",
  "inventoryItems",
  "inventoryLogs",
  "concessionRequests",
  "smsHistory",
  "rectificationRequests",
  "courseContent",
  "teacherFeedback",
  "syllabusChangeRequests",
  "adminSmsHistory",
  "adminEmailHistory",
  "adminNotificationHistory",
  "examinations",
  "examSchedules",
  "examMarks",
  "examMarkRectificationRequests",
  "skillAssessments",
  "markingTemplates",
  "studentMarks",
  "systemSettings",
  "teacherAttendanceRectificationRequests",
  "feeRectificationRequests",
  "leaveSettings",
  "archivedStudentRecords",
  "manualExpenses",
  "manualSalaryAdjustments",
  "payrollRecords",
  "erpPayments",
  "auditLogs",
  "principalQueries",
  "studentSyllabusProgress",
];

const initializeMockData = () => {
  for (const key of ALL_DB_KEYS) {
    db[key] = [];
  }
  const mockData = {
    users: [
      {
        id: "superadmin",
        name: "Super Admin",
        email: "superadmin@verticx.com",
        role: "SuperAdmin",
        password: "superadmin123",
        phone: "9876543210",
      },
      {
        id: "admin-1",
        name: "Admin User",
        email: "admin@verticx.com",
        role: "Admin",
        password: "admin123",
      },
      {
        id: "principal-1",
        name: "Dr. Evelyn Reed",
        email: "principal.north@verticx.com",
        role: "Principal",
        password: "principal123",
        branchId: "branch-north",
        phone: "9876543211",
        salary: 120000,
        leaveBalances: { sick: 12, casual: 10 },
      },
      {
        id: "principal-2",
        name: "Mr. Alan Grant",
        email: "principal.south@verticx.com",
        role: "Principal",
        password: "principal123",
        branchId: "branch-south",
        salary: 115000,
        leaveBalances: { sick: 12, casual: 10 },
      },
      {
        id: "VRTX-REG-001",
        name: "Robert Muldoon",
        email: "registrar.north@verticx.com",
        role: "Registrar",
        password: "registrar123",
        branchId: "branch-north",
        salary: 60000,
        leaveBalances: { sick: 12, casual: 10 },
      },
      {
        id: "VRTX-TCH-001",
        name: "Dr. Ian Malcolm",
        email: "ian.malcolm@verticx.com",
        role: "Teacher",
        password: "teacher123",
        branchId: "branch-north",
        salary: 75000,
        leaveBalances: { sick: 12, casual: 10, earned: 15 },
      },
      {
        id: "VRTX-TCH-002",
        name: "Ellie Sattler",
        email: "ellie.sattler@verticx.com",
        role: "Teacher",
        password: "teacher123",
        branchId: "branch-north",
        salary: 72000,
        leaveBalances: { sick: 12, casual: 10, earned: 15 },
      },
      {
        id: "VRTX-STU-0001",
        name: "Alex Murphy",
        email: "alex.murphy@student.verticx.com",
        role: "Student",
        password: "student123",
        branchId: "branch-north",
      },
      {
        id: "parent-1",
        name: "Sarah Connor",
        email: "parent.sarah@verticx.com",
        role: "Parent",
        password: "parent123",
        childrenIds: ["VRTX-STU-0001"],
      },
      {
        id: "VRTX-LIB-001",
        name: "Barbara Gordon",
        email: "librarian.north@verticx.com",
        role: "Librarian",
        password: "librarian123",
        branchId: "branch-north",
        salary: 45000,
        leaveBalances: { sick: 12, casual: 10 },
      },
    ],
    branches: [
      {
        id: "branch-north",
        registrationId: "SCH-N-01",
        name: "North Branch",
        location: "City North, State",
        principalId: "principal-1",
        registrarId: "VRTX-REG-001",
        status: "active",
        email: "north@verticx.com",
        helplineNumber: "123-456-7890",
        erpPricePerStudent: 10,
        billingCycle: "monthly",
        nextDueDate: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          10
        )
          .toISOString()
          .split("T")[0],
        enabledFeatures: { ...ALL_FEATURES },
        academicSessionStartDate: "2024-04-01",
        paymentGatewayPublicKey: "rzp_test_ILgsfZC32z1234",
        stats: {
          students: 1,
          teachers: 2,
          staff: 4,
          healthScore: 92.5,
          avgPerformance: 85.0,
          feeDefaulters: 1,
        },
      },
      {
        id: "branch-south",
        registrationId: "SCH-S-02",
        name: "South Branch",
        location: "City South, State",
        principalId: "principal-2",
        status: "active",
        email: "south@verticx.com",
        helplineNumber: "123-456-7891",
        erpPricePerStudent: 12,
        billingCycle: "monthly",
        nextDueDate: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          10
        )
          .toISOString()
          .split("T")[0],
        enabledFeatures: { ...ALL_FEATURES },
        academicSessionStartDate: "2024-04-01",
        stats: {
          students: 0,
          teachers: 0,
          staff: 1,
          healthScore: 95.0,
          avgPerformance: 88.0,
          feeDefaulters: 0,
        },
      },
    ],
    parents: [
      { id: "parent-1", name: "Sarah Connor", childrenIds: ["VRTX-STU-0001"] },
    ],
    students: [
      {
        id: "VRTX-STU-0001",
        branchId: "branch-north",
        name: "Alex Murphy",
        gradeLevel: 10,
        parentId: "parent-1",
        classId: "class-10a-north",
        status: "active",
        dob: "2008-05-15",
        address: "123 Cyber Street",
        gender: "Male",
        guardianInfo: {
          name: "Sarah Connor",
          email: "parent.sarah@verticx.com",
          phone: "555-0101",
        },
        schoolRank: 15,
        rollNo: "10A-01",
        leaveBalances: { sick: 10, planned: 5 },
      },
    ],
    teachers: [
      {
        id: "VRTX-TCH-001",
        branchId: "branch-north",
        name: "Dr. Ian Malcolm",
        subjectIds: ["sub-math-10", "sub-cs-10"],
        qualification: "PhD Mathematics",
        doj: "2020-08-01",
        gender: "Male",
        email: "ian.malcolm@verticx.com",
        phone: "555-0201",
        status: "active",
        salary: 75000,
        leaveBalances: { sick: 12, casual: 10, earned: 15 },
      },
      {
        id: "VRTX-TCH-002",
        branchId: "branch-north",
        name: "Ellie Sattler",
        subjectIds: ["sub-bio-10"],
        qualification: "PhD Paleobotany",
        doj: "2019-07-15",
        gender: "Female",
        email: "ellie.sattler@verticx.com",
        phone: "555-0202",
        status: "active",
        salary: 72000,
        leaveBalances: { sick: 12, casual: 10, earned: 15 },
      },
    ],
    subjects: [
      {
        id: "sub-math-10",
        branchId: "branch-north",
        name: "Mathematics G10",
        teacherId: "VRTX-TCH-001",
      },
      {
        id: "sub-cs-10",
        branchId: "branch-north",
        name: "Computer Science G10",
        teacherId: "VRTX-TCH-001",
      },
      {
        id: "sub-bio-10",
        branchId: "branch-north",
        name: "Biology G10",
        teacherId: "VRTX-TCH-002",
      },
    ],
    schoolClasses: [
      {
        id: "class-10a-north",
        branchId: "branch-north",
        gradeLevel: 10,
        section: "A",
        subjectIds: ["sub-math-10", "sub-cs-10", "sub-bio-10"],
        studentIds: ["VRTX-STU-0001"],
        mentorTeacherId: "VRTX-TCH-001",
        feeTemplateId: "fee-tpl-g10-north",
      },
    ],
    courses: [
      {
        id: "course-math-10a",
        name: "Mathematics 10A",
        branchId: "branch-north",
        subjectId: "sub-math-10",
        teacherId: "VRTX-TCH-001",
      },
    ],
    grades: [
      {
        studentId: "VRTX-STU-0001",
        courseId: "course-math-10a",
        assessment: "Mid-Term Exam",
        score: 88,
        term: "Fall 2024",
      },
    ],
    feeTemplates: [
      {
        id: "fee-tpl-g10-north",
        branchId: "branch-north",
        name: "Grade 10 Standard Fees",
        amount: 120000,
        gradeLevel: 10,
        monthlyBreakdown: Array(12)
          .fill(0)
          .map((_, i) => ({
            month: new Date(0, i).toLocaleString("default", { month: "long" }),
            total: 10000,
            breakdown: [
              { component: "Tuition", amount: 8000 },
              { component: "Misc", amount: 2000 },
            ],
          })),
      },
    ],
    feeRecords: [
      {
        studentId: "VRTX-STU-0001",
        totalAmount: 120000,
        paidAmount: 80000,
        dueDate: new Date("2025-03-10"),
        previousSessionDues: 5000,
      },
    ],
    auditLogs: [
      {
        id: "log-1",
        userId: "admin-1",
        userName: "Admin User",
        action: 'Approved registration for "South Branch"',
        timestamp: new Date(Date.now() - 3600000 * 1),
      },
      {
        id: "log-2",
        userId: "admin-1",
        userName: "Admin User",
        action: "Updated status for 'North Branch' to suspended",
        timestamp: new Date(Date.now() - 3600000 * 3),
      },
    ],
    principalQueries: [
      {
        id: "pq-1",
        branchId: "branch-north",
        principalId: "principal-1",
        principalName: "Dr. Evelyn Reed",
        schoolName: "North Branch",
        subject: "Billing Discrepancy",
        queryText:
          "We were billed for 150 students but we only have 148 active students this month. Please clarify.",
        submittedAt: new Date(Date.now() - 86400000 * 2),
        status: "Open",
      },
      {
        id: "pq-2",
        branchId: "branch-south",
        principalId: "principal-2",
        principalName: "Mr. Alan Grant",
        schoolName: "South Branch",
        subject: "Feature Request: Canteen Module",
        queryText:
          "It would be great to have a module for managing canteen inventory and daily sales.",
        submittedAt: new Date(Date.now() - 86400000 * 5),
        status: "Resolved",
        adminNotes:
          "Thank you for the suggestion. We have added it to our product roadmap for Q4.",
        resolvedAt: new Date(Date.now() - 86400000 * 3),
        resolvedBy: "Admin User",
      },
    ],
    systemSettings: [
      {
        id: "global",
        defaultErpPrice: 10,
        globalFeatureToggles: { ...ALL_FEATURES },
        loginPageAnnouncement:
          "Welcome to Verticx ERP. Mid-term examinations begin next month.",
      },
    ],
    erpPayments: [
      {
        id: "erp-pay-1",
        branchId: "branch-north",
        amount: 10,
        paymentDate: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          5
        )
          .toISOString()
          .split("T")[0],
        transactionId: "VRTX-ERP-MOCK-001",
      },
    ],
  };
  for (const key of ALL_DB_KEYS) {
    db[key] = (mockData as any)[key] || [];
  }
};

initializeMockData();

// =================================================================
// 2. HELPER FUNCTIONS & BASE CLASS
// =================================================================
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
const generatePassword = () => Math.random().toString(36).slice(-8);
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

const generateUniqueId = (
  type:
    | "student"
    | "teacher"
    | "registrar"
    | "librarian"
    | "supportstaff"
    | "principal"
) => {
  let prefix: string;
  let count: number;
  const allUsers = db.users as Api.User[];
  switch (type) {
    case "student":
      prefix = "STU";
      count = db.students.length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(4, "0")}`;
    case "teacher":
      prefix = "TCH";
      count = db.teachers.length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(3, "0")}`;
    case "registrar":
      prefix = "REG";
      count = allUsers.filter((u) => u.role === "Registrar").length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(3, "0")}`;
    case "librarian":
      prefix = "LIB";
      count = allUsers.filter((u) => u.role === "Librarian").length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(3, "0")}`;
    case "supportstaff":
      prefix = "SST";
      count = allUsers.filter((u) => u.role === "SupportStaff").length;
      return `VRTX-${prefix}-${(count + 1).toString().padStart(3, "0")}`;
    default:
      return `${type}-${Math.random().toString(36).substr(2, 9)}`;
  }
};

class BaseApiService {
  protected delay = delay;
  protected generateId = (prefix: string) =>
    `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  protected generatePassword = generatePassword;

  // --- Core Data Accessors ---
  protected getUserById = (id: string): Api.User | undefined =>
    (db.users as Api.User[]).find((u) => u.id === id);
  protected getStudentById = (id: string): Api.Student | undefined =>
    (db.students as Api.Student[]).find((s) => s.id === id);
  protected getTeacherById = (id: string): Api.Teacher | undefined =>
    (db.teachers as Api.Teacher[]).find((t) => t.id === id);
  protected getClassById = (id: string): Api.SchoolClass | undefined =>
    (db.schoolClasses as Api.SchoolClass[]).find((c) => c.id === id);
  protected getSubjectById = (id: string): Api.Subject | undefined =>
    (db.subjects as Api.Subject[]).find((s) => s.id === id);
  protected getCourseById = (id: string): Api.Course | undefined =>
    (db.courses as Api.Course[]).find((c) => c.id === id);
  protected getCourseNameById = (id: string): string =>
    this.getCourseById(id)?.name || "Unknown Course";
  protected getExaminationById = (id: string): Api.Examination | undefined =>
    (db.examinations as Api.Examination[]).find((e) => e.id === id);
  protected getLibraryBookById = (
    bookId: string
  ): Api.LibraryBook | undefined =>
    (db.libraryBooks as Api.LibraryBook[]).find((b) => b.id === bookId);
  protected getBookTitle = (bookId: string): string =>
    this.getLibraryBookById(bookId)?.title || "Unknown";
  protected getMemberName = (
    memberId: string,
    memberType: "Student" | "Teacher"
  ): string => {
    const member =
      memberType === "Student"
        ? this.getStudentById(memberId)
        : this.getTeacherById(memberId);
    return member?.name || "Unknown Member";
  };

  // --- Common Async Fetchers ---
  protected async getBranchById(branchId: string): Promise<Api.Branch | null> {
    await this.delay(100);
    return (db.branches as Api.Branch[]).find((b) => b.id === branchId) || null;
  }
  protected async getStudentsByBranch(
    branchId: string
  ): Promise<Api.Student[]> {
    await this.delay(150);
    return (db.students as Api.Student[]).filter(
      (s) => s.branchId === branchId
    );
  }
  protected async getStudentsForClass(classId: string): Promise<Api.Student[]> {
    const sClass = this.getClassById(classId);
    if (!sClass) return [];
    return (db.students as Api.Student[]).filter((s) =>
      sClass.studentIds.includes(s.id)
    );
  }
  protected async getSchoolClassesByBranch(
    branchId: string
  ): Promise<Api.SchoolClass[]> {
    return (db.schoolClasses as Api.SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
  }
  protected async getSubjectsByBranch(
    branchId: string
  ): Promise<Api.Subject[]> {
    return (db.subjects as Api.Subject[]).filter(
      (s) => s.branchId === branchId
    );
  }
  protected async getTeachersByBranch(
    branchId: string
  ): Promise<Api.Teacher[]> {
    return (db.teachers as Api.Teacher[]).filter(
      (t) => t.branchId === branchId
    );
  }

  protected async getStudentProfileDetails(
    studentId: string
  ): Promise<Api.StudentProfile | null> {
    const student = this.getStudentById(studentId);
    if (!student) return null;
    const grades = (db.grades as Api.GradeWithCourse[])
      .filter((g) => g.studentId === studentId)
      .map((g) => ({ ...g, courseName: this.getCourseNameById(g.courseId) }));
    const attendanceHistory = (db.attendance as Api.AttendanceRecord[]).filter(
      (a) => a.studentId === studentId
    );
    const present = attendanceHistory.filter(
      (a) => a.status === "Present"
    ).length;
    const total = attendanceHistory.length;
    const feeRecord = (db.feeRecords as Api.FeeRecord[]).find(
      (f) => f.studentId === studentId
    );
    const feeHistory: Api.FeeHistoryItem[] = [
      ...(db.feePayments as Api.FeePayment[]).filter(
        (p) => p.studentId === studentId
      ),
      ...(db.feeAdjustments as Api.FeeAdjustment[]).filter(
        (a) => a.studentId === studentId
      ),
    ];

    const allAssessments = (db.skillAssessments as any[]).filter(
      (sa) => sa.studentId === studentId
    );
    const aggregatedSkills: Record<string, { total: number; count: number }> =
      {};
    allAssessments.forEach((assessment) => {
      Object.entries(assessment.skills).forEach(([skill, value]) => {
        if (!aggregatedSkills[skill])
          aggregatedSkills[skill] = { total: 0, count: 0 };
        aggregatedSkills[skill].total += value as number;
        aggregatedSkills[skill].count++;
      });
    });

    const skills = SKILL_LIST.map((skill) => ({
      skill,
      value: aggregatedSkills[skill]
        ? aggregatedSkills[skill].total / aggregatedSkills[skill].count
        : 0,
    }));

    return {
      student,
      grades,
      attendance: { present, absent: total - present, total },
      attendanceHistory,
      classInfo: student.classId
        ? `Grade ${this.getClassById(student.classId)?.gradeLevel}-${
            this.getClassById(student.classId)?.section
          }`
        : "N/A",
      feeStatus: {
        total: feeRecord?.totalAmount || 0,
        paid: feeRecord?.paidAmount || 0,
        dueDate: feeRecord?.dueDate,
      },
      feeHistory,
      rank: {
        class: Math.floor(Math.random() * 10) + 1,
        school: student.schoolRank || 0,
      },
      skills,
      recentActivity: [],
    };
  }
  protected async getTransportDetailsForMember(
    memberId: string,
    memberType: "Student" | "Teacher"
  ): Promise<{ route: Api.TransportRoute; stop: any } | null> {
    for (const route of db.transportRoutes as Api.TransportRoute[]) {
      const assignment = route.assignedMembers.find(
        (m: any) => m.memberId === memberId && m.memberType === memberType
      );
      if (assignment) {
        const stop = route.busStops.find(
          (s: any) => s.id === assignment.stopId
        );
        if (stop) return { route, stop };
      }
    }
    return null;
  }

  protected async getAccommodationDetailsForStudent(
    studentId: string
  ): Promise<{ hostel: Api.Hostel; room: Api.Room } | null> {
    const student = this.getStudentById(studentId);
    if (!student?.roomId) return null;
    const room = (db.rooms as Api.Room[]).find((r) => r.id === student.roomId);
    if (!room) return null;
    const hostel = (db.hostels as Api.Hostel[]).find(
      (h) => h.id === room.hostelId
    );
    if (!hostel) return null;
    return { hostel, room };
  }
}

// =================================================================
// 3. UNIFIED MOCK API SERVICE
// =================================================================
class MockApiService extends BaseApiService {
  // =================================================================
  // AUTHENTICATION & SHARED LOGIC (from sharedApiService.ts)
  // =================================================================
  async login(
    identifier: string,
    password: string
  ): Promise<(Api.User & { otpRequired?: boolean }) | null> {
    await this.delay(500);
    const user = (db.users as Api.User[]).find(
      (u) =>
        (u.email === identifier || u.id === identifier) &&
        u.password === password
    );
    if (user) {
      if (
        user.role === "SuperAdmin" ||
        user.role === "Principal" ||
        user.role === "Registrar"
      ) {
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        user.currentOtp = otp;
        saveDb();
        console.log(`[MOCK API] OTP for ${user.name} (${user.role}): ${otp}`);
        return { ...user, otpRequired: true };
      }
      const userToReturn = { ...user };
      if (
        userToReturn.role === "Parent" &&
        !userToReturn.branchId &&
        userToReturn.childrenIds?.length
      ) {
        const firstChild = (db.students as Api.Student[]).find(
          (s) => s.id === userToReturn.childrenIds![0]
        );
        if (firstChild) {
          userToReturn.branchId = firstChild.branchId;
        }
      }
      return userToReturn;
    }
    return null;
  }
  async verifyOtp(userId: string, otp: string): Promise<Api.User | null> {
    await this.delay(500);
    const userInDb = this.getUserById(userId);
    if (userInDb && userInDb.currentOtp === otp) {
      delete userInDb.currentOtp;
      saveDb();
      const userToReturn = { ...userInDb };
      delete (userToReturn as any).currentOtp;
      return userToReturn;
    }
    return null;
  }
  async registerSchool(data: {
    principalName: string;
    schoolName: string;
    email: string;
    phone: string;
    location: string;
    registrationId: string;
  }): Promise<void> {
    await this.delay(1000);
    if (
      (db.branches as Api.Branch[]).find(
        (b) => b.registrationId === data.registrationId
      ) ||
      (db.registrationRequests as Api.RegistrationRequest[]).find(
        (r) =>
          r.registrationId === data.registrationId && r.status === "pending"
      )
    ) {
      throw new Error(
        "This School Registration ID is already taken or pending approval."
      );
    }
    const newRequest: Api.RegistrationRequest = {
      id: this.generateId("req"),
      submittedAt: new Date(),
      status: "pending",
      ...data,
    };
    (db.registrationRequests as Api.RegistrationRequest[]).push(newRequest);
    saveDb();
  }
  async changePassword(
    userId: string,
    current: string,
    newPass: string
  ): Promise<void> {
    await this.delay(500);
    const user = (db.users as Api.User[]).find((u) => u.id === userId);
    if (!user || user.password !== current) {
      throw new Error("Invalid current password.");
    }
    user.password = newPass;
    saveDb();
  }
  async resetUserPassword(userId: string): Promise<{ newPassword: string }> {
    await this.delay(800);
    const user = (db.users as Api.User[]).find((u) => u.id === userId);
    if (!user) throw new Error("User not found");
    const newPassword = this.generatePassword();
    user.password = newPassword;
    console.log(
      `Password for ${user.name} (${user.id}) has been reset to: ${newPassword}`
    );
    saveDb();
    return { newPassword: newPassword };
  }
  async updateUserProfile(
    userId: string,
    updates: { name?: string; email?: string; phone?: string }
  ): Promise<Api.User> {
    await this.delay(300);
    const user = (db.users as Api.User[]).find((u) => u.id === userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.role === "Student") {
      throw new Error("Students cannot change their profile details.");
    }
    Object.assign(user, updates);
    if (user.role === "Teacher") {
      const teacher = (db.teachers as Api.Teacher[]).find(
        (t) => t.id === userId
      );
      if (teacher) {
        Object.assign(teacher, updates);
      }
    }
    saveDb();
    return { ...user };
  }
  async createLeaveApplication(
    data: Omit<Api.LeaveApplication, "id" | "status">
  ): Promise<void> {
    const newApp: Api.LeaveApplication = {
      id: this.generateId("leave"),
      status: "Pending",
      ...data,
    };
    (db.leaveApplications as Api.LeaveApplication[]).push(newApp);
    saveDb();
  }
  async getLeaveApplicationsForUser(
    userId: string
  ): Promise<Api.LeaveApplication[]> {
    return (db.leaveApplications as Api.LeaveApplication[]).filter(
      (l) => l.applicantId === userId
    );
  }
  async getLeaveSettingsForBranch(
    branchId: string
  ): Promise<Api.LeaveSetting[]> {
    const defaultSettings: Api.LeaveSetting[] = [
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
    const savedSettings = (db.leaveSettings as Api.LeaveSetting[]).filter(
      (s) => s.branchId === branchId
    );
    if (savedSettings.length === 0) {
      (db.leaveSettings as Api.LeaveSetting[]).push(...defaultSettings);
      saveDb();
      return defaultSettings;
    }
    defaultSettings.forEach((def) => {
      if (!savedSettings.some((s) => s.role === def.role)) {
        savedSettings.push(def);
        (db.leaveSettings as Api.LeaveSetting[]).push(def);
      }
    });
    saveDb();
    return savedSettings;
  }
  async getStaffListForBranch(branchId: string): Promise<Api.User[]> {
    await this.delay(150);
    const staffRoles: Api.UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "Principal",
      "SupportStaff",
    ];
    return (db.users as Api.User[]).filter(
      (u) => u.branchId === branchId && staffRoles.includes(u.role)
    );
  }
  async getStaffAttendanceAndLeaveForMonth(
    staffId: string,
    year: number,
    month: number
  ): Promise<{
    attendance: Api.TeacherAttendanceRecord[];
    leaves: Api.LeaveApplication[];
  }> {
    await this.delay(250);
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    const attendance = (
      db.teacherAttendance as Api.TeacherAttendanceRecord[]
    ).filter((r) => {
      const recordDate = new Date(r.date);
      return (
        r.teacherId === staffId &&
        recordDate >= startDate &&
        recordDate <= endDate
      );
    });
    const leaves = (db.leaveApplications as Api.LeaveApplication[]).filter(
      (l) => {
        if (l.applicantId !== staffId || l.status !== "Approved") {
          return false;
        }
        const leaveStart = new Date(l.startDate);
        const leaveEnd = new Date(l.endDate);
        return leaveStart <= endDate && leaveEnd >= startDate;
      }
    );
    return { attendance, leaves };
  }
  async getAllStaffForBranch(
    branchId: string
  ): Promise<(Api.User & { attendancePercentage?: number })[]> {
    const staffRoles: Api.UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "Principal",
      "SupportStaff",
    ];
    const staff = (db.users as Api.User[]).filter(
      (u) => u.branchId === branchId && staffRoles.includes(u.role)
    );
    const allTeacherAttendance = (
      db.teacherAttendance as Api.TeacherAttendanceRecord[]
    ).filter((r) => r.branchId === branchId);
    return staff.map((s) => {
      const staffRecords = allTeacherAttendance.filter(
        (r) => r.teacherId === s.id
      );
      const presentDays = staffRecords.filter(
        (r) => r.status === "Present" || r.status === "Half Day"
      ).length;
      const totalDays = staffRecords.length;
      return {
        ...s,
        attendancePercentage:
          totalDays > 0 ? (presentDays / totalDays) * 100 : 100,
      };
    });
  }
  async getSuperAdminContactDetails(): Promise<Api.User | null> {
    await this.delay(50);
    return (
      (db.users as Api.User[]).find((u) => u.role === "SuperAdmin") || null
    );
  }

  // =================================================================
  // ADMIN LOGIC (from adminApiService.ts)
  // =================================================================
  private async logAdminAction(userId: string, action: string) {
    const user = this.getUserById(userId);
    if (!user) return;
    const logEntry: Api.AuditLog = {
      id: this.generateId("log"),
      userId,
      userName: user.name,
      action,
      timestamp: new Date(),
    };
    (db.auditLogs as Api.AuditLog[]).push(logEntry);
    saveDb();
  }
  async getRegistrationRequests(): Promise<Api.RegistrationRequest[]> {
    await this.delay(300);
    return (db.registrationRequests as Api.RegistrationRequest[]).filter(
      (r) => r.status === "pending" || !r.status
    );
  }
  async approveRequest(
    requestId: string
  ): Promise<{ principalEmail: string; principalPassword: string }> {
    await this.delay(1000);
    const request = (db.registrationRequests as Api.RegistrationRequest[]).find(
      (r) => r.id === requestId
    );
    if (!request) throw new Error("Request not found");
    const principalPassword = this.generatePassword();
    const principalEmail = request.email;
    const newPrincipal: Api.User = {
      id: generateUniqueId("principal"),
      name: request.principalName,
      email: principalEmail,
      role: "Principal",
      password: principalPassword,
    };
    const newBranch: Partial<Api.Branch> = {
      id: this.generateId("branch"),
      name: request.schoolName,
      location: request.location,
      registrationId: request.registrationId,
      principalId: newPrincipal.id,
      status: "active",
      email: request.email,
      helplineNumber: request.phone,
      enabledFeatures: ALL_FEATURES,
      stats: {
        students: 0,
        teachers: 0,
        staff: 0,
        healthScore: 100,
        avgPerformance: 0,
        feeDefaulters: 0,
      },
    };
    newPrincipal.branchId = newBranch.id;
    (db.users as Api.User[]).push(newPrincipal);
    (db.branches as Api.Branch[]).push(newBranch as Api.Branch);
    request.status = "approved";
    console.log(
      `Approved ${request.schoolName}. Principal credentials - Email: ${principalEmail}, Password: ${principalPassword}`
    );
    await this.logAdminAction(
      "admin-1",
      `Approved registration for "${request.schoolName}".`
    );
    saveDb();
    return { principalEmail, principalPassword };
  }
  async denyRequest(requestId: string): Promise<void> {
    await this.delay(500);
    const request = (db.registrationRequests as Api.RegistrationRequest[]).find(
      (r) => r.id === requestId
    );
    if (request) {
      request.status = "denied";
      await this.logAdminAction(
        "admin-1",
        `Denied registration for "${request.schoolName}".`
      );
      saveDb();
    }
  }
  async getBranches(status?: "active"): Promise<Api.Branch[]> {
    await this.delay(200);
    let branches = (db.branches as Api.Branch[]).map((branch) => {
      const studentsInBranch = (db.students as Api.Student[]).filter(
        (s) => s.branchId === branch.id
      );
      const studentIds = new Set(studentsInBranch.map((s) => s.id));
      const teachersInBranch = (db.teachers as Api.Teacher[]).filter(
        (t) => t.branchId === branch.id
      );
      const gradesInBranch = (db.grades as Api.Grade[]).filter((g) =>
        studentIds.has(g.studentId)
      );
      const avgPerformance =
        gradesInBranch.length > 0
          ? gradesInBranch.reduce((sum, g) => sum + g.score, 0) /
            gradesInBranch.length
          : 0;
      const attendanceInBranch = (
        db.attendance as Api.AttendanceRecord[]
      ).filter((a) => studentIds.has(a.studentId));
      const presentCount = attendanceInBranch.filter(
        (a) => a.status === "Present" || a.status === "Tardy"
      ).length;
      const attendancePercentage =
        attendanceInBranch.length > 0
          ? (presentCount / attendanceInBranch.length) * 100
          : 100;
      const feeRecordsInBranch = (db.feeRecords as Api.FeeRecord[]).filter(
        (f) => studentIds.has(f.studentId)
      );
      const totalDue = feeRecordsInBranch.reduce(
        (sum, f) => sum + f.totalAmount,
        0
      );
      const totalPaid = feeRecordsInBranch.reduce(
        (sum, f) => sum + f.paidAmount,
        0
      );
      const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 100;
      const feeDefaulters = feeRecordsInBranch.filter(
        (f) => f.paidAmount < f.totalAmount
      ).length;
      const healthScore =
        avgPerformance * 0.4 +
        attendancePercentage * 0.3 +
        collectionRate * 0.3;
      branch.stats = {
        students: studentsInBranch.length,
        teachers: teachersInBranch.length,
        staff: (db.users as Api.User[]).filter(
          (u) =>
            u.branchId === branch.id &&
            u.role !== "Student" &&
            u.role !== "Parent"
        ).length,
        healthScore: parseFloat(healthScore.toFixed(1)),
        avgPerformance: parseFloat(avgPerformance.toFixed(1)),
        feeDefaulters: feeDefaulters,
        attendancePercentage: parseFloat(attendancePercentage.toFixed(1)),
      };
      return branch;
    });
    saveDb();
    if (status) {
      return branches.filter((b) => b.status === status);
    }
    return branches;
  }
  async getAdminDashboardData(
    role?: Api.UserRole
  ): Promise<Api.AdminDashboardData> {
    await this.delay(500);
    const branches = await this.getBranches();
    const activeBranches = branches.filter((b) => b.status === "active");
    const students = db.students as Api.Student[];
    const teachers = db.teachers as Api.Teacher[];
    const feeRecords = db.feeRecords as Api.FeeRecord[];
    let feesCollectedValue: number;
    if (role === "SuperAdmin") {
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const erpPaymentsThisMonth = (db.erpPayments as Api.ErpPayment[]).filter(
        (p) => {
          const paymentDate = new Date(p.paymentDate);
          return (
            paymentDate.getMonth() === currentMonth &&
            paymentDate.getFullYear() === currentYear
          );
        }
      );
      feesCollectedValue = erpPaymentsThisMonth.reduce(
        (sum, p) => sum + p.amount,
        0
      );
    } else {
      feesCollectedValue = feeRecords.reduce((sum, r) => sum + r.paidAmount, 0);
    }
    const pendingPrincipalQueries = (
      db.principalQueries as Api.PrincipalQuery[]
    ).filter((q) => q.status === "Open");
    const summary = {
      totalSchools: branches.length,
      totalStudents: students.length,
      totalTeachers: teachers.length,
      activeBranches: activeBranches.length,
      feesCollected: feesCollectedValue,
      feesPending: feeRecords.reduce(
        (sum, r) => sum + (r.totalAmount - r.paidAmount),
        0
      ),
      pendingPrincipalQueries: pendingPrincipalQueries.length,
    };
    const topPerformingSchools = [...activeBranches]
      .sort((a, b) => b.stats.healthScore - a.stats.healthScore)
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        name: b.name,
        healthScore: b.stats.healthScore,
      }));
    const bottomPerformingSchools = [...activeBranches]
      .sort((a, b) => a.stats.healthScore - b.stats.healthScore)
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        name: b.name,
        healthScore: b.stats.healthScore,
      }));
    const pendingRequests = (
      db.registrationRequests as Api.RegistrationRequest[]
    ).filter((r) => r.status === "pending");
    const academicMonths = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
    const feeTrend = academicMonths.map((month) => ({
      month,
      collected: Math.floor(280000 + Math.random() * 100000),
      pending: Math.floor(20000 + Math.random() * 50000),
    }));
    const performanceTrend = academicMonths.map((month, i) => ({
      month,
      averageScore: parseFloat((82 + i * 0.7 + Math.random() * 2).toFixed(1)),
    }));
    return {
      summary,
      feeTrend,
      liveFeed: [
        {
          id: "1",
          type: "alert",
          message: "High number of fee defaulters at North Branch",
          school: "North Branch",
          timestamp: new Date(),
        },
      ],
      topPerformingSchools,
      bottomPerformingSchools,
      pendingRequests: {
        count: pendingRequests.length,
        requests: pendingRequests.slice(0, 5),
      },
      principalQueries: {
        count: pendingPrincipalQueries.length,
        queries: pendingPrincipalQueries.slice(0, 5),
      },
      performanceTrend,
    };
  }
  async updateBranchStatus(
    branchId: string,
    status: Api.Branch["status"]
  ): Promise<void> {
    await this.delay(300);
    const branch = (db.branches as Api.Branch[]).find((b) => b.id === branchId);
    if (branch) {
      branch.status = status;
      await this.logAdminAction(
        "admin-1",
        `Updated status for "${branch.name}" to ${status}.`
      );
      saveDb();
    }
  }
  async deleteBranch(branchId: string): Promise<void> {
    await this.delay(800);
    const branchToDelete = (db.branches as Api.Branch[]).find(
      (b) => b.id === branchId
    );
    db.branches = (db.branches as Api.Branch[]).filter(
      (b) => b.id !== branchId
    );
    db.users = (db.users as Api.User[]).filter((u) => u.branchId !== branchId);
    db.students = (db.students as Api.Student[]).filter(
      (s) => s.branchId !== branchId
    );
    db.teachers = (db.teachers as Api.Teacher[]).filter(
      (t) => t.branchId !== branchId
    );
    if (branchToDelete) {
      await this.logAdminAction(
        "admin-1",
        `Deleted branch "${branchToDelete.name}" (ID: ${branchId}).`
      );
    }
    saveDb();
  }
  async getAllUsers(): Promise<Api.User[]> {
    await this.delay(200);
    return db.users as Api.User[];
  }
  async getSystemWideFinancials(
    startDate?: string,
    endDate?: string
  ): Promise<Api.SystemWideFinancials> {
    await this.delay(400);
    const branches = await this.getBranches();
    const allFeeRecords = db.feeRecords as Api.FeeRecord[];
    const totalPending = allFeeRecords.reduce(
      (sum, r) => sum + (r.totalAmount - r.paidAmount),
      0
    );
    let totalCollected: number;
    let feePaymentsToConsider = db.feePayments as Api.FeePayment[];
    let manualExpensesToConsider = db.manualExpenses as Api.ManualExpense[];
    let erpPaymentsToConsider = db.erpPayments as Api.ErpPayment[];
    let payrollRecordsToConsider = (
      db.payrollRecords as Api.PayrollRecord[]
    ).filter((p) => p.status === "Paid");
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      feePaymentsToConsider = feePaymentsToConsider.filter((p) => {
        const paidDate = new Date(p.paidDate);
        return paidDate >= start && paidDate <= end;
      });
      totalCollected = feePaymentsToConsider.reduce(
        (sum, r) => sum + r.amount,
        0
      );
      manualExpensesToConsider = manualExpensesToConsider.filter((e) => {
        const expenseDate = new Date(e.date);
        return expenseDate >= start && expenseDate <= end;
      });
      erpPaymentsToConsider = erpPaymentsToConsider.filter((p) => {
        const paymentDate = new Date(p.paymentDate);
        return paymentDate >= start && paymentDate <= end;
      });
      payrollRecordsToConsider = payrollRecordsToConsider.filter((p) => {
        if (!p.paidAt) return false;
        const paidDate = new Date(p.paidAt);
        return paidDate >= start && paidDate <= end;
      });
    } else {
      totalCollected = allFeeRecords.reduce((sum, r) => sum + r.paidAmount, 0);
    }
    const totalPayroll = payrollRecordsToConsider.reduce(
      (sum, p) => sum + (p.netPayable || 0),
      0
    );
    const totalManualExpenses = manualExpensesToConsider.reduce(
      (sum, e) => sum + e.amount,
      0
    );
    const totalErpBill = erpPaymentsToConsider.reduce(
      (sum, e) => sum + e.amount,
      0
    );
    const totalExpenditure = totalPayroll + totalManualExpenses + totalErpBill;
    const totalDueSystemWide = allFeeRecords.reduce(
      (sum, r) => sum + r.totalAmount,
      0
    );
    const allTimeTotalCollected = allFeeRecords.reduce(
      (sum, r) => sum + r.paidAmount,
      0
    );
    const collectionRate =
      totalDueSystemWide > 0
        ? (allTimeTotalCollected / totalDueSystemWide) * 100
        : 100;
    const collectionBySchool = branches.map((branch) => {
      const studentIds = new Set(
        (db.students as Api.Student[])
          .filter((s) => s.branchId === branch.id)
          .map((s) => s.id)
      );
      const branchFeeRecords = allFeeRecords.filter((r) =>
        studentIds.has(r.studentId)
      );
      const pending = branchFeeRecords.reduce(
        (sum, r) => sum + (r.totalAmount - r.paidAmount),
        0
      );
      let collected: number;
      if (startDate && endDate) {
        const branchFeePayments = feePaymentsToConsider.filter((p) =>
          studentIds.has(p.studentId)
        );
        collected = branchFeePayments.reduce((sum, r) => sum + r.amount, 0);
      } else {
        collected = branchFeeRecords.reduce((sum, r) => sum + r.paidAmount, 0);
      }
      return {
        id: branch.id,
        name: branch.name,
        collected,
        pending,
        status: branch.status,
      };
    });
    const overdueBySchool = branches.map((branch) => {
      return {
        id: branch.id,
        name: branch.name,
        percentage: Math.random() * 20,
        amount: Math.random() * 50000,
        status: branch.status,
      };
    });
    return {
      summary: {
        totalCollected,
        totalPending,
        collectionRate,
        totalExpenditure,
      },
      collectionBySchool,
      overdueBySchool,
    };
  }
  async getSystemWideAnalytics(): Promise<Api.SystemWideAnalytics> {
    await this.delay(400);
    const branches = await this.getBranches();
    const passPercentage = branches.map((b) => ({
      id: b.id,
      name: b.name,
      "Pass %": b.stats.avgPerformance,
      status: b.status,
    }));
    const teacherStudentRatio = branches.map((b) => ({
      id: b.id,
      name: b.name,
      ratio: b.stats.teachers > 0 ? b.stats.students / b.stats.teachers : 0,
      status: b.status,
    }));
    const attendanceBySchool = branches.map((b) => ({
      id: b.id,
      name: b.name,
      attendance: b.stats.attendancePercentage || 0,
      status: b.status,
    }));
    return { passPercentage, teacherStudentRatio, attendanceBySchool };
  }
  async getSystemWideInfrastructureData(): Promise<Api.SystemInfrastructureData> {
    await this.delay(300);
    const branches = db.branches as Api.Branch[];
    const routes = db.transportRoutes as Api.TransportRoute[];
    const rooms = db.rooms as Api.Room[];
    const hostels = db.hostels as Api.Hostel[];
    const branchStats: Api.BranchInfrastructureStats[] = branches.map(
      (branch) => {
        const branchRoutes = routes.filter((r) => r.branchId === branch.id);
        const transportCapacity = branchRoutes.reduce(
          (sum, r) => sum + r.capacity,
          0
        );
        const transportOccupancy = branchRoutes.reduce(
          (sum, r) => sum + r.assignedMembers.length,
          0
        );
        const branchHostelIds = new Set(
          hostels.filter((h) => h.branchId === branch.id).map((h) => h.id)
        );
        const branchRooms = rooms.filter((r) =>
          branchHostelIds.has(r.hostelId)
        );
        const hostelCapacity = branchRooms.reduce(
          (sum, r) => sum + r.capacity,
          0
        );
        const hostelOccupancy = branchRooms.reduce(
          (sum, r) => sum + r.occupantIds.length,
          0
        );
        return {
          id: branch.id,
          name: branch.name,
          location: branch.location,
          transportCapacity,
          transportOccupancy,
          hostelCapacity,
          hostelOccupancy,
        };
      }
    );
    const summary = branchStats.reduce(
      (acc, curr) => ({
        totalTransportCapacity:
          acc.totalTransportCapacity + curr.transportCapacity,
        totalTransportOccupancy:
          acc.totalTransportOccupancy + curr.transportOccupancy,
        totalHostelCapacity: acc.totalHostelCapacity + curr.hostelCapacity,
        totalHostelOccupancy: acc.totalHostelOccupancy + curr.hostelOccupancy,
      }),
      {
        totalTransportCapacity: 0,
        totalTransportOccupancy: 0,
        totalHostelCapacity: 0,
        totalHostelOccupancy: 0,
      }
    );
    return { summary, branches: branchStats };
  }
  async getAdminCommunicationHistory(): Promise<{
    sms: Api.AdminSms[];
    email: Api.AdminEmail[];
    notification: Api.AdminNotification[];
  }> {
    await this.delay(200);
    return {
      sms: (db.adminSmsHistory as Api.AdminSms[]).sort(
        (a, b) => b.sentAt.getTime() - a.sentAt.getTime()
      ),
      email: (db.adminEmailHistory as Api.AdminEmail[]).sort(
        (a, b) => b.sentAt.getTime() - a.sentAt.getTime()
      ),
      notification: (
        db.adminNotificationHistory as Api.AdminNotification[]
      ).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime()),
    };
  }
  async sendBulkSms(
    target: Api.CommunicationTarget,
    message: string,
    sentBy: string
  ): Promise<void> {
    await this.delay(1000);
    const newSms: Api.AdminSms = {
      id: this.generateId("ad-sms"),
      target,
      message,
      sentBy,
      sentAt: new Date(),
    };
    (db.adminSmsHistory as Api.AdminSms[]).push(newSms);
    const targetDesc = Array.isArray(target.branchId)
      ? `${target.branchId.length} schools`
      : target.branchId;
    await this.logAdminAction(
      "admin-1",
      `Sent bulk SMS to ${targetDesc} for role ${target.role}.`
    );
    saveDb();
    console.log(`[BULK SMS] To ${JSON.stringify(target)}: ${message}`);
  }
  async sendBulkEmail(
    target: Api.CommunicationTarget,
    subject: string,
    body: string,
    sentBy: string
  ): Promise<void> {
    await this.delay(1000);
    const newEmail: Api.AdminEmail = {
      id: this.generateId("ad-email"),
      target,
      subject,
      body,
      sentBy,
      sentAt: new Date(),
    };
    (db.adminEmailHistory as Api.AdminEmail[]).push(newEmail);
    const targetDesc = Array.isArray(target.branchId)
      ? `${target.branchId.length} schools`
      : target.branchId;
    await this.logAdminAction(
      "admin-1",
      `Sent bulk Email to ${targetDesc} for role ${target.role}.`
    );
    saveDb();
    console.log(`[BULK EMAIL] To ${JSON.stringify(target)}: ${subject}`);
  }
  async sendBulkNotification(
    target: Api.CommunicationTarget,
    title: string,
    message: string,
    sentBy: string
  ): Promise<void> {
    await this.delay(500);
    const newNotif: Api.AdminNotification = {
      id: this.generateId("ad-notif"),
      target,
      title,
      message,
      sentBy,
      sentAt: new Date(),
    };
    (db.adminNotificationHistory as Api.AdminNotification[]).push(newNotif);
    const targetDesc = Array.isArray(target.branchId)
      ? `${target.branchId.length} schools`
      : target.branchId;
    await this.logAdminAction(
      "admin-1",
      `Sent bulk Notification to ${targetDesc} for role ${target.role}.`
    );
    saveDb();
    console.log(`[BULK NOTIFICATION] To ${JSON.stringify(target)}: ${title}`);
  }
  async getSchoolDetails(branchId: string): Promise<Api.SchoolDetails> {
    await this.delay(400);
    const branch = (db.branches as Api.Branch[]).find(
      (b) => b.id === branchId
    )!;
    const principal = this.getUserById(branch.principalId);
    const registrar = this.getUserById(branch.registrarId || "");
    const teachers = (db.teachers as Api.Teacher[]).filter(
      (t) => t.branchId === branchId
    );
    const students = (db.students as Api.Student[]).filter(
      (s) => s.branchId === branchId
    );
    const classes = (db.schoolClasses as Api.SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
    const classPerformance = classes.map((c) => ({
      name: `Grade ${c.gradeLevel}-${c.section}`,
      performance: 75 + Math.random() * 20,
    }));
    const teacherPerformance = teachers
      .slice(0, 5)
      .map((t) => ({
        teacherId: t.id,
        teacherName: t.name,
        performanceIndex: 80 + Math.random() * 15,
      }));
    const topStudents = students
      .sort((a, b) => (a.schoolRank || 999) - (b.schoolRank || 999))
      .slice(0, 5)
      .map((s) => ({
        studentId: s.id,
        studentName: s.name,
        rank: s.schoolRank || 0,
        className: `Grade ${s.gradeLevel}`,
      }));
    const subjectPerformanceByClass: Api.SchoolDetails["subjectPerformanceByClass"] =
      {};
    classes.forEach((c) => {
      subjectPerformanceByClass[c.id] = c.subjectIds.map((sid) => ({
        subjectName: this.getSubjectById(sid)!.name,
        averageScore: 70 + Math.random() * 25,
      }));
    });
    const classFeeDetails: Api.SchoolDetails["classFeeDetails"] = classes.map(
      (c) => ({
        className: `Grade ${c.gradeLevel}-${c.section}`,
        studentCount: c.studentIds.length,
        totalFees: 120000 * c.studentIds.length,
        pendingFees: 20000 * c.studentIds.length * Math.random(),
        defaulters: Math.floor(c.studentIds.length * Math.random() * 0.2),
      })
    );
    return {
      branch,
      principal,
      registrar,
      teachers,
      students,
      classes,
      classPerformance,
      teacherPerformance,
      topStudents,
      subjectPerformanceByClass,
      classFeeDetails,
      transportRoutes: (db.transportRoutes as Api.TransportRoute[]).filter(
        (r) => r.branchId === branchId
      ),
    };
  }
  async getSystemSettings(): Promise<Api.SystemSettings> {
    await this.delay(100);
    return (db.systemSettings as Api.SystemSettings[])[0];
  }
  async updateSystemSettings(settings: Api.SystemSettings): Promise<void> {
    await this.delay(500);
    db.systemSettings[0] = settings;
    (db.branches as Api.Branch[]).forEach((branch) => {
      const currentBranchFeatures = { ...branch.enabledFeatures };
      const globalFeatures = settings.globalFeatureToggles;
      for (const key in globalFeatures) {
        if (globalFeatures[key] === false) {
          currentBranchFeatures[key] = false;
        } else {
          if (currentBranchFeatures[key] === undefined) {
            currentBranchFeatures[key] = true;
          }
        }
      }
      branch.enabledFeatures = currentBranchFeatures;
    });
    await this.logAdminAction(
      "admin-1",
      "Updated master system configuration and synced all branches."
    );
    saveDb();
  }
  async updateBranchDetails(
    branchId: string,
    updates: Partial<Api.Branch>
  ): Promise<void> {
    await this.delay(500);
    const branch = (db.branches as Api.Branch[]).find((b) => b.id === branchId);
    if (branch) {
      Object.assign(branch, updates);
      saveDb();
    }
  }
  async getErpPayments(): Promise<Api.ErpPayment[]> {
    await this.delay(200);
    return db.erpPayments as Api.ErpPayment[];
  }
  async getSystemWideErpFinancials(): Promise<Api.SystemWideErpFinancials> {
    await this.delay(500);
    const branches = await this.getBranches("active");
    const allPayments = await this.getErpPayments();
    const settings = await this.getSystemSettings();
    const today = new Date();
    const countMonths = (start: Date, end: Date): number => {
      let months = (end.getFullYear() - start.getFullYear()) * 12;
      months -= start.getMonth();
      months += end.getMonth();
      return months < 0 ? 0 : months + 1;
    };
    let pendingSchoolsCount = 0;
    const billingStatusBySchool: Api.ErpBillingStatus[] = branches.map(
      (branch) => {
        const price = branch.erpPricePerStudent ?? settings.defaultErpPrice;
        const concession = branch.erpConcessionPercentage || 0;
        const discountFactor = 1 - concession / 100;
        const studentCount = branch.stats.students;
        const sessionStart = branch.academicSessionStartDate
          ? new Date(branch.academicSessionStartDate)
          : new Date(today.getFullYear(), 3, 1);
        const monthsPassed = countMonths(sessionStart, today);
        const totalBilled =
          monthsPassed * studentCount * price * discountFactor;
        const paymentsForBranch = allPayments.filter(
          (p) => p.branchId === branch.id
        );
        const totalPaid = paymentsForBranch.reduce(
          (sum, p) => sum + p.amount,
          0
        );
        const pendingAmount = Math.max(0, totalBilled - totalPaid);
        if (pendingAmount > 0) {
          pendingSchoolsCount++;
        }
        let daysOverdue = 0;
        if (branch.nextDueDate) {
          const dueDate = new Date(branch.nextDueDate);
          if (today > dueDate) {
            const diffTime = today.getTime() - dueDate.getTime();
            daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          }
        }
        return {
          branchId: branch.id,
          branchName: branch.name,
          totalBilled,
          totalPaid,
          pendingAmount,
          nextDueDate: branch.nextDueDate || "Not Set",
          daysOverdue,
          status: branch.status,
        };
      }
    );
    const summary = billingStatusBySchool.reduce(
      (acc, school) => ({
        totalBilled: acc.totalBilled + school.totalBilled,
        totalPaid: acc.totalPaid + school.totalPaid,
        pendingAmount: acc.pendingAmount + school.pendingAmount,
      }),
      { totalBilled: 0, totalPaid: 0, pendingAmount: 0 }
    );
    const totalStudents = branches.reduce(
      (sum, b) => sum + b.stats.students,
      0
    );
    const totalSchools = branches.length;
    const enhancedSummary = {
      ...summary,
      totalStudents,
      totalSchools,
      pendingSchoolsCount,
    };
    const billingTrend = Array.from({ length: 6 }).map((_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1);
      const monthName = date.toLocaleString("default", { month: "short" });
      return {
        month: `${monthName} '${String(date.getFullYear()).slice(2)}`,
        billed: Math.floor(
          (summary.totalBilled / 6) * (0.8 + Math.random() * 0.4)
        ),
        paid: Math.floor((summary.totalPaid / 6) * (0.8 + Math.random() * 0.4)),
      };
    });
    return { summary: enhancedSummary, billingTrend, billingStatusBySchool };
  }
  async getSchoolFinancialDetails(
    branchId: string
  ): Promise<Api.SchoolFinancialDetails> {
    await this.delay(500);
    const branch = (db.branches as Api.Branch[]).find((b) => b.id === branchId);
    if (!branch) throw new Error("Branch not found");
    const students = (db.students as Api.Student[]).filter(
      (s) => s.branchId === branchId
    );
    const studentIds = new Set(students.map((s) => s.id));
    const feeRecords = (db.feeRecords as Api.FeeRecord[]).filter((r) =>
      studentIds.has(r.studentId)
    );
    const tuitionFees = feeRecords.reduce((sum, r) => sum + r.paidAmount, 0);
    const transportRoutes = (db.transportRoutes as Api.TransportRoute[]).filter(
      (r) => r.branchId === branchId
    );
    const transportFees = transportRoutes.reduce(
      (sum, route) =>
        sum +
        route.assignedMembers.reduce(
          (memSum, mem) =>
            memSum +
            (route.busStops.find((s) => s.id === mem.stopId)?.charges || 0),
          0
        ),
      0
    );
    const branchHostelIds = new Set(
      (db.hostels as Api.Hostel[])
        .filter((h) => h.branchId === branchId)
        .map((h) => h.id)
    );
    const hostelFees = (db.rooms as Api.Room[])
      .filter((r) => branchHostelIds.has(r.hostelId))
      .reduce((sum, room) => sum + room.occupantIds.length * room.fee, 0);
    const totalRevenue = tuitionFees + transportFees + hostelFees;
    const grades = [...new Set(students.map((s) => s.gradeLevel))].sort(
      (a, b) => a - b
    );
    const tuitionByGrade = grades.map((grade) => {
      const studentIdsInGrade = new Set(
        students.filter((s) => s.gradeLevel === grade).map((s) => s.id)
      );
      const gradeFeeRecords = feeRecords.filter((r) =>
        studentIdsInGrade.has(r.studentId)
      );
      const collected = gradeFeeRecords.reduce(
        (sum, r) => sum + r.paidAmount,
        0
      );
      const pending = gradeFeeRecords.reduce(
        (sum, r) => sum + (r.totalAmount - r.paidAmount),
        0
      );
      return { grade: `Grade ${grade}`, collected, pending };
    });
    const staffInBranch = (db.users as Api.User[]).filter(
      (u) => u.branchId === branchId && u.salary && u.role !== "Principal"
    );
    const totalPayroll = staffInBranch.reduce(
      (sum, s) => sum + (s.salary || 0),
      0
    );
    const manualExpenses = (db.manualExpenses as Api.ManualExpense[])
      .filter((e) => e.branchId === branchId)
      .reduce((sum, e) => sum + e.amount, 0);
    const erpBill = students.length * (branch.erpPricePerStudent || 10);
    const totalExpenditure = totalPayroll + manualExpenses + erpBill;
    const netProfit = totalRevenue - totalExpenditure;
    return {
      branchId,
      branchName: branch.name,
      summary: { totalRevenue, totalExpenditure, netProfit },
      revenueBreakdown: {
        tuitionFees,
        transportFees,
        hostelFees,
        tuitionByGrade,
      },
      expenditureBreakdown: { totalPayroll, manualExpenses, erpBill },
    };
  }
  async getAuditLogs(): Promise<Api.AuditLog[]> {
    await this.delay(200);
    return (db.auditLogs as Api.AuditLog[]).sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
  async getPrincipalQueries(
    status?: "Open" | "Resolved"
  ): Promise<Api.PrincipalQuery[]> {
    await this.delay(300);
    let queries = db.principalQueries as Api.PrincipalQuery[];
    if (status) {
      queries = queries.filter((q) => q.status === status);
    }
    return queries.sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  }
  async resolvePrincipalQuery(
    queryId: string,
    adminNotes: string,
    adminId: string
  ): Promise<Api.PrincipalQuery> {
    await this.delay(500);
    const query = (db.principalQueries as Api.PrincipalQuery[]).find(
      (q) => q.id === queryId
    );
    if (!query) throw new Error("Query not found");
    query.status = "Resolved";
    query.adminNotes = adminNotes;
    query.resolvedAt = new Date();
    query.resolvedBy = this.getUserById(adminId)?.name || "Admin";
    await this.logAdminAction(
      adminId,
      `Resolved query #${queryId} from "${query.schoolName}".`
    );
    saveDb();
    return query;
  }
  async recordManualErpPayment(
    branchId: string,
    paymentDetails: {
      amount: number;
      paymentDate: string;
      notes: string;
      periodEndDate: string;
    },
    adminId: string
  ): Promise<void> {
    await this.delay(500);
    const { amount, paymentDate, notes, periodEndDate } = paymentDetails;
    const newPayment: Api.ErpPayment = {
      id: this.generateId("erp-pay"),
      branchId,
      amount,
      paymentDate,
      transactionId: `MANUAL - ${notes || "Offline Payment"}`,
    };
    (db.erpPayments as Api.ErpPayment[]).push(newPayment);
    const branch = (db.branches as Api.Branch[]).find((b) => b.id === branchId);
    if (branch) {
      const periodEndDateObj = new Date(periodEndDate);
      const nextDueDate = new Date(
        Date.UTC(
          periodEndDateObj.getUTCFullYear(),
          periodEndDateObj.getUTCMonth() + 1,
          10
        )
      );
      branch.nextDueDate = nextDueDate.toISOString().split("T")[0];
    }
    await this.logAdminAction(
      adminId,
      `Recorded manual ERP payment of ${amount} for branch ${
        branch?.name || branchId
      }.`
    );
    saveDb();
  }

  // =================================================================
  // PRINCIPAL LOGIC (from principalApiService.ts)
  // =================================================================
  private calculateStudentAverage(studentId: string): number {
    const studentGrades = (db.grades as Api.Grade[]).filter(
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
  async getPrincipalDashboardData(
    branchId: string
  ): Promise<Api.PrincipalDashboardData> {
    await this.delay(500);
    const branch = await this.getBranchById(branchId);
    const classes = (db.schoolClasses as Api.SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
    const students = (db.students as Api.Student[]).filter(
      (s) => s.branchId === branchId
    );
    const feeRecords = (db.feeRecords as Api.FeeRecord[]).filter(
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
    const teachers = await this.getStaffByBranch(branchId).then(
      (staff) => staff.filter((s) => s.role === "Teacher") as Api.Teacher[]
    );
    const teacherPerformanceData = teachers.map((t) => {
      const teacherAttendance = (
        db.teacherAttendance as Api.TeacherAttendanceRecord[]
      ).filter((rec) => rec.teacherId === t.id);
      const workingDays = teacherAttendance.length;
      const presentDays = teacherAttendance.filter(
        (r) => r.status === "Present" || r.status === "Half Day"
      ).length;
      const attendanceScore =
        workingDays > 0 ? (presentDays / workingDays) * 100 : 100;
      const teacherLectures = (db.lectures as Api.Lecture[]).filter(
        (l) => l.teacherId === t.id
      );
      const totalLectures = teacherLectures.length;
      const completedLectures = teacherLectures.filter(
        (l) => l.status === "completed"
      ).length;
      const syllabusScore =
        totalLectures > 0 ? (completedLectures / totalLectures) * 100 : 100;
      const studentIdsTaught = new Set(
        (db.schoolClasses as Api.SchoolClass[])
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
    const allBranches = db.branches as Api.Branch[];
    const allStudents = db.students as Api.Student[];
    const allGrades = db.grades as Api.Grade[];
    const allAttendance = db.attendance as Api.AttendanceRecord[];
    const allFeeRecords = db.feeRecords as Api.FeeRecord[];
    const branchScores = allBranches.map((b) => {
      const branchStudents = allStudents.filter((s) => s.branchId === b.id);
      if (branchStudents.length === 0) {
        return { branchId: b.id, score: 0 };
      }
      const studentIds = new Set(branchStudents.map((s) => s.id));
      const branchGrades = allGrades.filter((g) => studentIds.has(g.studentId));
      const averageGrade =
        branchGrades.length > 0
          ? branchGrades.reduce((acc, g) => acc + g.score, 0) /
            branchGrades.length
          : 0;
      const academicScore = (averageGrade / 100) * 50;
      const branchAttendance = allAttendance.filter((a) =>
        studentIds.has(a.studentId)
      );
      const presentCount = branchAttendance.filter(
        (a) => a.status === "Present" || a.status === "Tardy"
      ).length;
      const attendancePercentage =
        branchAttendance.length > 0
          ? (presentCount / branchAttendance.length) * 100
          : 100;
      const attendanceScore = (attendancePercentage / 100) * 30;
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
      const collectionRate = totalDue > 0 ? totalPaid / totalDue : 1;
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
    const allCourses = (db.courses as Api.Course[]).filter(
      (c) => c.branchId === branchId
    );
    const allSubjects = (db.subjects as Api.Subject[]).filter(
      (s) => s.branchId === branchId
    );
    const studentIdsInBranch = new Set(students.map((s) => s.id));
    const branchGrades = (db.grades as Api.Grade[]).filter((g) =>
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
    const pendingLeave = (
      db.leaveApplications as Api.LeaveApplication[]
    ).filter(
      (l) =>
        l.branchId === branchId &&
        l.status === "Pending" &&
        l.applicantRole !== "Student"
    ).length;
    const pendingAttendance = (
      db.teacherAttendanceRectificationRequests as Api.TeacherAttendanceRectificationRequest[]
    ).filter((r) => r.branchId === branchId && r.status === "Pending").length;
    const pendingFees = (
      db.feeRectificationRequests as Api.FeeRectificationRequest[]
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
    const allEvents = (db.schoolEvents as Api.SchoolEvent[]).filter(
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
  ): Promise<Api.FacultyApplication[]> {
    return (db.facultyApplications as Api.FacultyApplication[]).filter(
      (a) => a.branchId === branchId
    );
  }
  async getStaffByBranch(
    branchId: string
  ): Promise<(Api.User & Partial<Api.Teacher>)[]> {
    const staffRoles: Api.UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "Principal",
      "SupportStaff",
    ];
    const staffUsers = (db.users as Api.User[]).filter(
      (u) => u.branchId === branchId && staffRoles.includes(u.role)
    );
    return staffUsers.map((user) => {
      if (user.role === "Teacher") {
        const teacherRecord = (db.teachers as Api.Teacher[]).find(
          (t) => t.id === user.id
        );
        const complaintCount = (
          db.teacherComplaints as Api.TeacherComplaint[]
        ).filter((c) => c.teacherId === user.id).length;
        const rectificationRequestCount = (
          db.rectificationRequests as Api.RectificationRequest[]
        ).filter((r) => r.teacherId === user.id).length;
        return {
          ...user,
          ...teacherRecord,
          complaintCount,
          rectificationRequestCount,
        };
      }
      return user;
    }) as (Api.User & Partial<Api.Teacher>)[];
  }
  async approveFacultyApplication(
    appId: string,
    salary: number,
    reviewedById: string
  ): Promise<{ credentials: { id: string; password: string } }> {
    const app = (db.facultyApplications as Api.FacultyApplication[]).find(
      (a) => a.id === appId
    );
    if (!app) throw new Error("Application not found");
    const newTeacherId = generateUniqueId("teacher");
    const newPassword = this.generatePassword();
    const newTeacher: Api.Teacher = {
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
    const newUser: Api.User = {
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
    (db.teachers as Api.Teacher[]).push(newTeacher);
    (db.users as Api.User[]).push(newUser);
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
    const app = (db.facultyApplications as Api.FacultyApplication[]).find(
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
    const newUser: Api.User = {
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
    (db.users as Api.User[]).push(newUser);
    saveDb();
    return { credentials: { id: newId, password: newPassword } };
  }
  async suspendStaff(staffId: string): Promise<void> {
    const user = this.getUserById(staffId);
    if (user) {
      user.status = "suspended";
      saveDb();
    }
  }
  async reinstateStaff(staffId: string): Promise<void> {
    const user = this.getUserById(staffId);
    if (user) {
      user.status = "active";
      saveDb();
    }
  }
  async deleteStaff(staffId: string): Promise<void> {
    db.users = (db.users as Api.User[]).filter((u) => u.id !== staffId);
    db.teachers = (db.teachers as Api.Teacher[]).filter(
      (t) => t.id !== staffId
    );
    saveDb();
  }
  async getTeacherProfileDetails(
    teacherId: string
  ): Promise<Api.TeacherProfile> {
    await this.delay(300);
    const teacher = this.getTeacherById(teacherId)!;
    const assignedClasses = (db.schoolClasses as Api.SchoolClass[])
      .filter((c) =>
        c.subjectIds.some((sid) => teacher.subjectIds.includes(sid))
      )
      .map((c) => ({ id: c.id, name: `Grade ${c.gradeLevel}-${c.section}` }));
    return {
      teacher,
      assignedClasses,
      assignedSubjects: (db.subjects as Api.Subject[]).filter((s) =>
        teacher.subjectIds.includes(s.id)
      ),
      mentoredClasses: (db.schoolClasses as Api.SchoolClass[])
        .filter((c) => c.mentorTeacherId === teacherId)
        .map((c) => ({ id: c.id, name: `Grade ${c.gradeLevel}-${c.section}` })),
      syllabusProgress: assignedClasses.map((c) => ({
        className: c.name,
        subjectName: "Mock Subject",
        completionPercentage: 70 + Math.random() * 30,
      })),
      classPerformance: assignedClasses.map((c) => ({
        className: c.name,
        averageStudentScore: 75 + Math.random() * 20,
      })),
      attendance: { present: 180, total: 200 },
      payrollHistory: [
        { month: "March 2024", amount: teacher.salary || 0, status: "Paid" },
        { month: "April 2024", amount: teacher.salary || 0, status: "Pending" },
      ],
    };
  }
  async updateTeacher(
    teacherId: string,
    updates: Partial<Api.Teacher>
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
    const classes = (db.schoolClasses as Api.SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
    const teachers = (db.teachers as Api.Teacher[]).filter(
      (t) => t.branchId === branchId
    );
    const subjects = (db.subjects as Api.Subject[]).filter(
      (s) => s.branchId === branchId
    );
    const students = (db.students as Api.Student[]).filter(
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
        db.attendance as Api.AttendanceRecord[]
      ).filter((a) => classStudentIds.has(a.studentId));
      const totalAttendanceRecords = classAttendanceRecords.length;
      const presentRecords = classAttendanceRecords.filter(
        (a) => a.status === "Present" || a.status === "Tardy"
      ).length;
      const avgAttendance =
        totalAttendanceRecords > 0
          ? (presentRecords / totalAttendanceRecords) * 100
          : 100;
      const classLectures = (db.lectures as Api.Lecture[]).filter(
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
  ): Promise<Api.FeeRectificationRequest[]> {
    return (
      db.feeRectificationRequests as Api.FeeRectificationRequest[]
    ).filter((r) => r.branchId === branchId);
  }
  async processFeeRectificationRequest(
    requestId: string,
    principalId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    await this.delay(500);
    const req = (
      db.feeRectificationRequests as Api.FeeRectificationRequest[]
    ).find((r) => r.id === requestId);
    if (req) {
      req.status = status;
      req.reviewedBy = this.getUserById(principalId)?.name;
      req.reviewedAt = new Date();
      if (status === "Approved") {
        const template = (db.feeTemplates as Api.FeeTemplate[]).find(
          (t) => t.id === req.templateId
        );
        if (req.requestType === "delete") {
          if (template) {
            db.feeTemplates = (db.feeTemplates as Api.FeeTemplate[]).filter(
              (t) => t.id !== req.templateId
            );
          }
        } else if (req.requestType === "update" && req.newData && template) {
          const newTemplateData = JSON.parse(
            req.newData
          ) as Partial<Api.FeeTemplate>;
          Object.assign(template, newTemplateData);
        }
      }
      saveDb();
    }
  }
  async getTeacherAttendanceRectificationRequestsByBranch(
    branchId: string
  ): Promise<Api.TeacherAttendanceRectificationRequest[]> {
    return (
      db.teacherAttendanceRectificationRequests as Api.TeacherAttendanceRectificationRequest[]
    ).filter((r) => r.branchId === branchId);
  }
  async processTeacherAttendanceRectificationRequest(
    requestId: string,
    principalId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    const req = (
      db.teacherAttendanceRectificationRequests as Api.TeacherAttendanceRectificationRequest[]
    ).find((r) => r.id === requestId);
    if (req) {
      req.status = status;
      req.reviewedBy = this.getUserById(principalId)?.name;
      req.reviewedAt = new Date();
      if (status === "Approved") {
        const record = (
          db.teacherAttendance as Api.TeacherAttendanceRecord[]
        ).find((r) => r.teacherId === req.teacherId && r.date === req.date);
        if (record) {
          record.status = req.toStatus;
        } else {
          (db.teacherAttendance as Api.TeacherAttendanceRecord[]).push({
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
  ): Promise<Api.LeaveApplication[]> {
    return (db.leaveApplications as Api.LeaveApplication[]).filter(
      (l) => l.branchId === branchId && l.applicantRole !== "Student"
    );
  }
  async processLeaveApplication(
    requestId: string,
    status: "Approved" | "Rejected",
    reviewerId: string
  ): Promise<void> {
    const app = (db.leaveApplications as Api.LeaveApplication[]).find(
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
    complaintData: Omit<Api.ComplaintAboutStudent, "id" | "submittedAt">
  ): Promise<void> {
    const newComplaint: Api.ComplaintAboutStudent = {
      id: this.generateId("complaint"),
      ...complaintData,
      submittedAt: new Date(),
    };
    (db.complaintsAboutStudents as Api.ComplaintAboutStudent[]).push(
      newComplaint
    );
    saveDb();
  }
  async getComplaintsAboutStudentsByBranch(
    branchId: string
  ): Promise<Api.ComplaintAboutStudent[]> {
    await this.delay(300);
    return (db.complaintsAboutStudents as Api.ComplaintAboutStudent[]).filter(
      (c) => c.branchId === branchId
    );
  }
  async getAttendanceOverview(
    branchId: string
  ): Promise<Api.PrincipalAttendanceOverview> {
    await this.delay(300);
    const branch = await this.getBranchById(branchId);
    const principalId = branch?.principalId;
    const students = await this.getStudentsByBranch(branchId);
    const allStaff = await this.getStaffByBranch(branchId);
    const staff = allStaff.filter((s) => s.id !== principalId);
    const today = new Date().toISOString().split("T")[0];
    const studentAttendance = (db.attendance as Api.AttendanceRecord[]).filter(
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
      db.teacherAttendance as Api.TeacherAttendanceRecord[]
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
          : ("Not Marked" as Api.TeacherAttendanceStatus | "Not Marked"),
      };
    });
    return { summary, classAttendance, staffAttendance: staffAttendanceList };
  }
  async getFinancialsOverview(
    branchId: string
  ): Promise<Api.PrincipalFinancialsOverview> {
    await this.delay(400);
    const branch = (db.branches as Api.Branch[]).find((b) => b.id === branchId);
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
    const students = (db.students as Api.Student[]).filter(
      (s) => s.branchId === branchId
    );
    const studentIds = new Set(students.map((s) => s.id));
    const feeRecords = (db.feeRecords as Api.FeeRecord[]).filter((fr) =>
      studentIds.has(fr.studentId)
    );
    const allFeePayments = (db.feePayments as Api.FeePayment[]).filter((p) =>
      studentIds.has(p.studentId)
    );
    const sessionTuitionRevenue = feeRecords.reduce(
      (sum, r) => sum + r.paidAmount,
      0
    );
    const monthPayments = allFeePayments.filter((p) => {
      const paidDate = new Date(p.paidDate);
      return paidDate >= currentMonthStart && paidDate <= currentMonthEnd;
    });
    let monthlyTuitionRevenue = monthPayments.reduce(
      (sum, p) => sum + p.amount,
      0
    );
    if (
      monthlyTuitionRevenue === 0 &&
      sessionTuitionRevenue > 0 &&
      allFeePayments.length === 0
    ) {
      monthlyTuitionRevenue = sessionTuitionRevenue;
    }
    const transportFees = (db.transportRoutes as any[])
      .filter((r) => r.branchId === branchId)
      .reduce(
        (sum, r) =>
          sum +
          r.assignedMembers.reduce(
            (memSum: number, mem: any) =>
              memSum +
              (r.busStops.find((s: any) => s.id === mem.stopId)?.charges || 0),
            0
          ),
        0
      );
    const hostelFees = (db.rooms as any[])
      .filter((r) => this.getUserById(r.hostelId)?.branchId === branchId)
      .reduce((sum, r) => sum + r.occupantIds.length * r.fee, 0);
    const monthlyAncillaryRevenue = transportFees + hostelFees;
    const monthsInSession =
      (today.getFullYear() - sessionStart.getFullYear()) * 12 +
      (today.getMonth() - sessionStart.getMonth()) +
      1;
    const sessionAncillaryRevenue = monthlyAncillaryRevenue * monthsInSession;
    const monthlyRevenue = monthlyTuitionRevenue + monthlyAncillaryRevenue;
    const sessionRevenue = sessionTuitionRevenue + sessionAncillaryRevenue;
    const allPayroll = (db.payrollRecords as Api.PayrollRecord[]).filter(
      (p) => p.branchId === branchId && p.status === "Paid" && p.paidAt
    );
    const allManualExpenses = (db.manualExpenses as Api.ManualExpense[]).filter(
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
    const sessionErpPayments = (db.erpPayments as Api.ErpPayment[])
      .filter(
        (p) =>
          p.branchId === branchId && new Date(p.paymentDate) >= sessionStart
      )
      .reduce((sum, p) => sum + p.amount, 0);
    const sessionExpenditure =
      sessionPayroll + sessionManualExpenses + sessionErpPayments;
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
        className: `Grade ${c.gradeLevel}-${c.section}`,
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
  async getAnnouncements(branchId: string): Promise<Api.Announcement[]> {
    await this.delay(150);
    return (db.announcements as Api.Announcement[])
      .filter((a) => a.branchId === branchId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }
  async getSmsHistory(branchId: string): Promise<Api.SmsMessage[]> {
    await this.delay(150);
    return (db.smsHistory as Api.SmsMessage[])
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
    const newAnnouncement: Api.Announcement = {
      id: this.generateId("ann"),
      branchId,
      ...data,
      sentAt: new Date(),
    };
    (db.announcements as Api.Announcement[]).push(newAnnouncement);
    saveDb();
  }
  async sendSmsToStudents(
    studentIds: string[],
    message: string,
    sentBy: string,
    branchId: string
  ): Promise<{ success: boolean; count: number }> {
    const newSms: Api.SmsMessage = {
      id: this.generateId("sms"),
      branchId,
      message,
      recipientCount: studentIds.length,
      sentAt: new Date(),
      sentBy,
    };
    (db.smsHistory as Api.SmsMessage[]).push(newSms);
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
    db.announcements = (db.announcements as Api.Announcement[]).filter((a) => {
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
    db.smsHistory = (db.smsHistory as Api.SmsMessage[]).filter((s) => {
      const sentAt = new Date(s.sentAt);
      return s.branchId !== branchId || sentAt < from || sentAt > to;
    });
    saveDb();
  }
  async updateUser(userId: string, updates: Partial<Api.User>): Promise<void> {
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
  async getComplaintsForBranch(
    branchId: string
  ): Promise<Api.TeacherComplaint[]> {
    await this.delay(300);
    return (db.teacherComplaints as Api.TeacherComplaint[]).filter(
      (c) => c.branchId === branchId
    );
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
    const adjustment: Api.FeeAdjustment = {
      id: this.generateId("adj"),
      studentId,
      amount: finalAmount,
      type,
      reason,
      adjustedBy,
      date: new Date().toISOString().split("T")[0],
    };
    (db.feeAdjustments as Api.FeeAdjustment[]).push(adjustment);
    const feeRecord = (db.feeRecords as Api.FeeRecord[]).find(
      (fr) => fr.studentId === studentId
    );
    if (feeRecord) {
      feeRecord.totalAmount += finalAmount;
    }
    saveDb();
  }
  async getExaminationsWithResultStatus(
    branchId: string
  ): Promise<Api.Examination[]> {
    await this.delay(200);
    return (db.examinations as Api.Examination[]).filter(
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
  ): Promise<Api.StudentWithExamMarks[]> {
    await this.delay(300);
    const exam = this.getExaminationById(examinationId)!;
    const schedules = (db.examSchedules as any[]).filter(
      (s) => s.examinationId === examinationId
    );
    const marks = (db.examMarks as Api.ExamMark[]).filter(
      (m) => m.examinationId === examinationId
    );
    const studentsInvolved = new Set(marks.map((m) => m.studentId));
    const results: Api.StudentWithExamMarks[] = [];
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
  }
  async getSuspensionRecordsForBranch(
    branchId: string
  ): Promise<Api.SuspensionRecord[]> {
    await this.delay(150);
    const studentIdsInBranch = new Set(
      (await this.getStudentsByBranch(branchId)).map((s) => s.id)
    );
    return (db.suspensionRecords as Api.SuspensionRecord[]).filter((r) =>
      studentIdsInBranch.has(r.studentId)
    );
  }
  async createSchoolEvent(
    eventData: Omit<Api.SchoolEvent, "id" | "status" | "createdAt">
  ): Promise<void> {
    const newEvent: Api.SchoolEvent = {
      id: this.generateId("evt"),
      ...eventData,
      status: "Approved",
      createdAt: new Date(),
    };
    (db.schoolEvents as Api.SchoolEvent[]).push(newEvent);
    saveDb();
  }
  async updateSchoolEvent(
    eventId: string,
    eventData: Partial<Api.SchoolEvent>
  ): Promise<void> {
    const event = (db.schoolEvents as Api.SchoolEvent[]).find(
      (e) => e.id === eventId
    );
    if (event) {
      Object.assign(event, eventData);
      event.status = "Approved";
      saveDb();
    }
  }
  async updateSchoolEventStatus(
    eventId: string,
    status: "Approved" | "Rejected"
  ): Promise<void> {
    const event = (db.schoolEvents as Api.SchoolEvent[]).find(
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
  ): Promise<Api.PayrollStaffDetails[]> {
    await this.delay(500);
    const staffRoles: Api.UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "SupportStaff",
    ];
    const principalId = (db.branches as Api.Branch[]).find(
      (b) => b.id === branchId
    )?.principalId;
    const staff = (db.users as Api.User[]).filter(
      (u) =>
        u.branchId === branchId &&
        staffRoles.includes(u.role) &&
        u.id !== principalId
    );
    const payrollData = staff.map((s) => {
      let record = (db.payrollRecords as Api.PayrollRecord[]).find(
        (p) =>
          p.branchId === branchId && p.month === month && p.staffId === s.id
      );
      if (record && record.status === "Paid") {
        return record;
      }
      const baseSalary = s.salary;
      if (baseSalary === null || baseSalary === undefined) {
        const salaryNotSetRecord: Api.PayrollStaffDetails = {
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
          (db.payrollRecords as Api.PayrollRecord[]).push(salaryNotSetRecord);
        } else {
          Object.assign(record, salaryNotSetRecord);
        }
        return salaryNotSetRecord;
      }
      const monthStart = new Date(month + "-02");
      monthStart.setDate(1);
      const monthEnd = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0
      );
      const approvedLeaves = (
        db.leaveApplications as Api.LeaveApplication[]
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
      const leaveDeductions = unpaidLeaveDays * (baseSalary / 30);
      const manualAdjustments = (
        db.manualSalaryAdjustments as Api.ManualSalaryAdjustment[]
      ).filter((adj) => adj.staffId === s.id && adj.month === month);
      const manualAdjustmentsTotal = manualAdjustments.reduce(
        (sum, adj) => sum + adj.amount,
        0
      );
      const netPayable = baseSalary - leaveDeductions + manualAdjustmentsTotal;
      if (record) {
        record.baseSalary = baseSalary;
        record.unpaidLeaveDays = unpaidLeaveDays;
        record.leaveDeductions = Math.round(leaveDeductions);
        record.manualAdjustmentsTotal = manualAdjustmentsTotal;
        record.netPayable = Math.round(netPayable);
        record.status = "Pending";
        return record;
      } else {
        const newRecord: Api.PayrollStaffDetails = {
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
        (db.payrollRecords as Api.PayrollRecord[]).push(newRecord);
        return newRecord;
      }
    });
    saveDb();
    return payrollData;
  }
  async processPayroll(
    payrollRecords: Api.PayrollStaffDetails[],
    processedBy: string
  ): Promise<void> {
    await this.delay(1000);
    payrollRecords.forEach((recordToPay) => {
      const recordInDb = (db.payrollRecords as Api.PayrollRecord[]).find(
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
    const newPayment: Api.ErpPayment = {
      id: this.generateId("erp-pay"),
      branchId,
      amount,
      paymentDate: new Date().toISOString().split("T")[0],
      transactionId,
    };
    (db.erpPayments as Api.ErpPayment[]).push(newPayment);
    const branch = (db.branches as Api.Branch[]).find((b) => b.id === branchId);
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
    queryData: Omit<Api.PrincipalQuery, "id" | "submittedAt" | "status">
  ): Promise<Api.PrincipalQuery> {
    await this.delay(300);
    const newQuery: Api.PrincipalQuery = {
      id: this.generateId("pq"),
      ...queryData,
      submittedAt: new Date(),
      status: "Open",
    };
    (db.principalQueries as Api.PrincipalQuery[]).push(newQuery);
    saveDb();
    return newQuery;
  }
  async getQueriesByPrincipal(
    principalId: string
  ): Promise<Api.PrincipalQuery[]> {
    await this.delay(200);
    return (db.principalQueries as Api.PrincipalQuery[])
      .filter((q) => q.principalId === principalId)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
  }
  async getErpPaymentsForBranch(branchId: string): Promise<Api.ErpPayment[]> {
    await this.delay(150);
    return (db.erpPayments as Api.ErpPayment[]).filter(
      (p) => p.branchId === branchId
    );
  }
  async getErpFinancialsForBranch(
    branchId: string
  ): Promise<Api.ErpFinancials> {
    await this.delay(400);
    const branch = await this.getBranchById(branchId);
    if (!branch) throw new Error("Branch not found");
    const students = (db.students as Api.Student[]).filter(
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
    const paymentHistory = (db.erpPayments as Api.ErpPayment[]).filter(
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
  async getManualExpenses(branchId: string): Promise<Api.ManualExpense[]> {
    await this.delay(100);
    return (db.manualExpenses as Api.ManualExpense[])
      .filter((e) => e.branchId === branchId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  async addManualExpense(data: Omit<Api.ManualExpense, "id">): Promise<void> {
    await this.delay(300);
    const newExpense: Api.ManualExpense = {
      id: this.generateId("exp"),
      ...data,
    };
    (db.manualExpenses as Api.ManualExpense[]).push(newExpense);
    saveDb();
  }

  // =================================================================
  // REGISTRAR LOGIC (from registrarApiService.ts)
  // =================================================================
  // ... (All methods from registrarApiService.ts will be pasted here)

  // =================================================================
  // TEACHER LOGIC (from teacherApiService.ts)
  // =================================================================
  // ... (All methods from teacherApiService.ts will be pasted here)

  // =================================================================
  // STUDENT LOGIC (from studentApiService.ts)
  // =================================================================
  // ... (All methods from studentApiService.ts will be pasted here)

  // =================================================================
  // PARENT LOGIC (from parentApiService.ts)
  // =================================================================
  // ... (All methods from parentApiService.ts will be pasted here)

  // =================================================================
  // LIBRARIAN LOGIC (from librarianApiService.ts)
  // =================================================================
  // ... (All methods from librarianApiService.ts will be pasted here)

  // =================================================================
  // GEMINI SERVICE LOGIC (from geminiService.ts)
  // =================================================================
  async generateAiResponse(prompt: string): Promise<string> {
    await delay(1000);
    return `This is a mock AI response to the prompt: "${prompt.substring(
      0,
      100
    )}..."`;
  }
}

export const mockApiService = new MockApiService();
