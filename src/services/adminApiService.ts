// services/adminApiService.ts
import { db, saveDb } from "./database";
import type {
  User,
  Branch,
  RegistrationRequest,
  Student,
  Teacher,
  AttendanceRecord,
  Grade,
  FeeRecord,
  FeePayment,
  SuspensionRecord,
  AdminDashboardData,
  SystemWideFinancials,
  SystemWideAnalytics,
  TransportRoute,
  Hostel,
  Room,
  AdminSms,
  AdminEmail,
  AdminNotification,
  CommunicationTarget,
  SystemSettings,
  SchoolClass,
  SchoolDetails,
  ErpPayment,
  SystemInfrastructureData,
  BranchInfrastructureStats,
  SchoolFinancialDetails,
  ManualExpense,
  PayrollRecord,
  AuditLog,
  PrincipalQuery,
  SystemWideErpFinancials,
  ErpBillingStatus,
  UserRole,
} from "../types/api";
import { BaseApiService, generateUniqueId } from "./baseApiService";


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
export class AdminApiService extends BaseApiService {
  private async logAdminAction(userId: string, action: string) {
    const user = this.getUserById(userId);
    if (!user) return;
    const logEntry: AuditLog = {
      id: this.generateId("log"),
      userId,
      userName: user.name,
      action,
      timestamp: new Date(),
    };
    (db.auditLogs as AuditLog[]).push(logEntry);
    saveDb();
  }

  async getRegistrationRequests(): Promise<RegistrationRequest[]> {
    await this.delay(300);
    return (db.registrationRequests as RegistrationRequest[]).filter(
      (r) => r.status === "pending" || !r.status
    );
  }

  async approveRequest(
    requestId: string
  ): Promise<{ principalEmail: string; principalPassword: string }> {
    await this.delay(1000);
    const request = (db.registrationRequests as RegistrationRequest[]).find(
      (r) => r.id === requestId
    );
    if (!request) throw new Error("Request not found");

    const principalPassword = this.generatePassword();
    const principalEmail = request.email;

    const newPrincipal: User = {
      id: generateUniqueId("principal"),
      name: request.principalName,
      email: principalEmail,
      role: "Principal",
      password: principalPassword,
    };

    const newBranch: Partial<Branch> = {
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

    (db.users as User[]).push(newPrincipal);
    (db.branches as Branch[]).push(newBranch as Branch);

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
    const request = (db.registrationRequests as RegistrationRequest[]).find(
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

  async getBranches(status?: "active"): Promise<Branch[]> {
    await this.delay(200);
    let branches = (db.branches as Branch[]).map((branch) => {
      const studentsInBranch = (db.students as Student[]).filter(
        (s) => s.branchId === branch.id
      );
      const studentIds = new Set(studentsInBranch.map((s) => s.id));
      const teachersInBranch = (db.teachers as Teacher[]).filter(
        (t) => t.branchId === branch.id
      );

      const gradesInBranch = (db.grades as Grade[]).filter((g) =>
        studentIds.has(g.studentId)
      );
      const avgPerformance =
        gradesInBranch.length > 0
          ? gradesInBranch.reduce((sum, g) => sum + g.score, 0) /
            gradesInBranch.length
          : 0;

      const attendanceInBranch = (db.attendance as AttendanceRecord[]).filter(
        (a) => studentIds.has(a.studentId)
      );
      const presentCount = attendanceInBranch.filter(
        (a) => a.status === "Present" || a.status === "Tardy"
      ).length;
      const attendancePercentage =
        attendanceInBranch.length > 0
          ? (presentCount / attendanceInBranch.length) * 100
          : 100;

      const feeRecordsInBranch = (db.feeRecords as FeeRecord[]).filter((f) =>
        studentIds.has(f.studentId)
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
        staff: (db.users as User[]).filter(
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

  async getAdminDashboardData(role?: UserRole): Promise<AdminDashboardData> {
    await this.delay(500);
    const branches = await this.getBranches(); // This will also update stats
    const activeBranches = branches.filter((b) => b.status === "active");
    const students = db.students as Student[];
    const teachers = db.teachers as Teacher[];
    const feeRecords = db.feeRecords as FeeRecord[];

    let feesCollectedValue: number;

    if (role === "SuperAdmin") {
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const erpPaymentsThisMonth = (db.erpPayments as ErpPayment[]).filter(
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
      db.principalQueries as PrincipalQuery[]
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
      db.registrationRequests as RegistrationRequest[]
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
    status: Branch["status"]
  ): Promise<void> {
    await this.delay(300);
    const branch = (db.branches as Branch[]).find((b) => b.id === branchId);
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
    const branchToDelete = (db.branches as Branch[]).find(
      (b) => b.id === branchId
    );
    db.branches = (db.branches as Branch[]).filter((b) => b.id !== branchId);
    db.users = (db.users as User[]).filter((u) => u.branchId !== branchId);
    db.students = (db.students as Student[]).filter(
      (s) => s.branchId !== branchId
    );
    db.teachers = (db.teachers as Teacher[]).filter(
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

  async getAllUsers(): Promise<User[]> {
    await this.delay(200);
    return db.users as User[];
  }

  async getSystemWideFinancials(
    startDate?: string,
    endDate?: string
  ): Promise<SystemWideFinancials> {
    await this.delay(400);
    const branches = await this.getBranches();

    const allFeeRecords = db.feeRecords as FeeRecord[];
    const totalPending = allFeeRecords.reduce(
      (sum, r) => sum + (r.totalAmount - r.paidAmount),
      0
    );

    let totalCollected: number;
    let feePaymentsToConsider = db.feePayments as FeePayment[];
    let manualExpensesToConsider = db.manualExpenses as ManualExpense[];
    let erpPaymentsToConsider = db.erpPayments as ErpPayment[];
    let payrollRecordsToConsider = (
      db.payrollRecords as PayrollRecord[]
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
        (db.students as Student[])
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

  async getSystemWideAnalytics(): Promise<SystemWideAnalytics> {
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

  async getSystemWideInfrastructureData(): Promise<SystemInfrastructureData> {
    await this.delay(300);
    const branches = db.branches as Branch[];
    const routes = db.transportRoutes as TransportRoute[];
    const rooms = db.rooms as Room[];
    const hostels = db.hostels as Hostel[];

    const branchStats: BranchInfrastructureStats[] = branches.map((branch) => {
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
      const branchRooms = rooms.filter((r) => branchHostelIds.has(r.hostelId));
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
    });

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
    sms: AdminSms[];
    email: AdminEmail[];
    notification: AdminNotification[];
  }> {
    await this.delay(200);
    return {
      sms: (db.adminSmsHistory as AdminSms[]).sort(
        (a, b) => b.sentAt.getTime() - a.sentAt.getTime()
      ),
      email: (db.adminEmailHistory as AdminEmail[]).sort(
        (a, b) => b.sentAt.getTime() - a.sentAt.getTime()
      ),
      notification: (db.adminNotificationHistory as AdminNotification[]).sort(
        (a, b) => b.sentAt.getTime() - a.sentAt.getTime()
      ),
    };
  }

  async sendBulkSms(
    target: CommunicationTarget,
    message: string,
    sentBy: string
  ): Promise<void> {
    await this.delay(1000);
    const newSms: AdminSms = {
      id: this.generateId("ad-sms"),
      target,
      message,
      sentBy,
      sentAt: new Date(),
    };
    (db.adminSmsHistory as AdminSms[]).push(newSms);
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
    target: CommunicationTarget,
    subject: string,
    body: string,
    sentBy: string
  ): Promise<void> {
    await this.delay(1000);
    const newEmail: AdminEmail = {
      id: this.generateId("ad-email"),
      target,
      subject,
      body,
      sentBy,
      sentAt: new Date(),
    };
    (db.adminEmailHistory as AdminEmail[]).push(newEmail);
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
    target: CommunicationTarget,
    title: string,
    message: string,
    sentBy: string
  ): Promise<void> {
    await this.delay(500);
    const newNotif: AdminNotification = {
      id: this.generateId("ad-notif"),
      target,
      title,
      message,
      sentBy,
      sentAt: new Date(),
    };
    (db.adminNotificationHistory as AdminNotification[]).push(newNotif);
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

  async getSchoolDetails(branchId: string): Promise<SchoolDetails> {
    await this.delay(400);
    const branch = (db.branches as Branch[]).find((b) => b.id === branchId)!;
    const principal = this.getUserById(branch.principalId);
    const registrar = this.getUserById(branch.registrarId || "");
    const teachers = (db.teachers as Teacher[]).filter(
      (t) => t.branchId === branchId
    );
    const students = (db.students as Student[]).filter(
      (s) => s.branchId === branchId
    );
    const classes = (db.schoolClasses as SchoolClass[]).filter(
      (c) => c.branchId === branchId
    );
    const classPerformance = classes.map((c) => ({
      name: `Grade ${c.gradeLevel}-${c.section}`,
      performance: 75 + Math.random() * 20,
    }));
    const teacherPerformance = teachers.slice(0, 5).map((t) => ({
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
    const subjectPerformanceByClass: SchoolDetails["subjectPerformanceByClass"] =
      {};
    classes.forEach((c) => {
      subjectPerformanceByClass[c.id] = c.subjectIds.map((sid) => ({
        subjectName: this.getSubjectById(sid)!.name,
        averageScore: 70 + Math.random() * 25,
      }));
    });
    const classFeeDetails: SchoolDetails["classFeeDetails"] = classes.map(
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
      transportRoutes: (db.transportRoutes as TransportRoute[]).filter(
        (r) => r.branchId === branchId
      ),
    };
  }

  async getSystemSettings(): Promise<SystemSettings> {
    await this.delay(100);
    return (db.systemSettings as SystemSettings[])[0];
  }

  async updateSystemSettings(settings: SystemSettings): Promise<void> {
    await this.delay(500);
    db.systemSettings[0] = settings;
    (db.branches as Branch[]).forEach((branch) => {
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
    updates: Partial<Branch>
  ): Promise<void> {
    await this.delay(500);
    const branch = (db.branches as Branch[]).find((b) => b.id === branchId);
    if (branch) {
      Object.assign(branch, updates);
      saveDb();
    }
  }

  async getErpPayments(): Promise<ErpPayment[]> {
    await this.delay(200);
    return db.erpPayments as ErpPayment[];
  }

  async getSystemWideErpFinancials(): Promise<SystemWideErpFinancials> {
    await this.delay(500);
    const branches = await this.getBranches("active");
    const allPayments = await this.getErpPayments();
    const settings = await this.getSystemSettings();
    const today = new Date();

    const countMonths = (start: Date, end: Date): number => {
      let months;
      months = (end.getFullYear() - start.getFullYear()) * 12;
      months -= start.getMonth();
      months += end.getMonth();
      return months < 0 ? 0 : months + 1;
    };

    let pendingSchoolsCount = 0;

    const billingStatusBySchool: ErpBillingStatus[] = branches.map((branch) => {
      const price = branch.erpPricePerStudent ?? settings.defaultErpPrice;
      const concession = branch.erpConcessionPercentage || 0;
      const discountFactor = 1 - concession / 100;
      const studentCount = branch.stats.students;
      const sessionStart = branch.academicSessionStartDate
        ? new Date(branch.academicSessionStartDate)
        : new Date(today.getFullYear(), 3, 1);

      const monthsPassed = countMonths(sessionStart, today);

      const totalBilled = monthsPassed * studentCount * price * discountFactor;
      const paymentsForBranch = allPayments.filter(
        (p) => p.branchId === branch.id
      );
      const totalPaid = paymentsForBranch.reduce((sum, p) => sum + p.amount, 0);
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
    });

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
        month: `${monthName} '${String(date.getFullYear()).slice(2)}'`,
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
  ): Promise<SchoolFinancialDetails> {
    await this.delay(500);
    const branch = (db.branches as Branch[]).find((b) => b.id === branchId);
    if (!branch) throw new Error("Branch not found");

    const students = (db.students as Student[]).filter(
      (s) => s.branchId === branchId
    );
    const studentIds = new Set(students.map((s) => s.id));
    const feeRecords = (db.feeRecords as FeeRecord[]).filter((r) =>
      studentIds.has(r.studentId)
    );

    const tuitionFees = feeRecords.reduce((sum, r) => sum + r.paidAmount, 0);

    const transportRoutes = (db.transportRoutes as TransportRoute[]).filter(
      (r) => r.branchId === branchId
    );
    const transportFees = transportRoutes.reduce((sum, route) => {
      return (
        sum +
        route.assignedMembers.reduce((memSum, mem) => {
          const stop = route.busStops.find((s) => s.id === mem.stopId);
          return memSum + (stop?.charges || 0);
        }, 0)
      );
    }, 0);

    const branchHostelIds = new Set(
      (db.hostels as Hostel[])
        .filter((h) => h.branchId === branchId)
        .map((h) => h.id)
    );
    const hostelFees = (db.rooms as Room[])
      .filter((r) => branchHostelIds.has(r.hostelId))
      .reduce((sum, room) => {
        return sum + room.occupantIds.length * room.fee;
      }, 0);

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

    const staffInBranch = (db.users as User[]).filter(
      (u) => u.branchId === branchId && u.salary && u.role !== "Principal"
    );
    const totalPayroll = staffInBranch.reduce(
      (sum, s) => sum + (s.salary || 0),
      0
    );

    const manualExpenses = (db.manualExpenses as ManualExpense[])
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

  async getAuditLogs(): Promise<AuditLog[]> {
    await this.delay(200);
    return (db.auditLogs as AuditLog[]).sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async getPrincipalQueries(
    status?: "Open" | "Resolved"
  ): Promise<PrincipalQuery[]> {
    await this.delay(300);
    let queries = db.principalQueries as PrincipalQuery[];
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
  ): Promise<PrincipalQuery> {
    await this.delay(500);
    const query = (db.principalQueries as PrincipalQuery[]).find(
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

    const newPayment: ErpPayment = {
      id: this.generateId("erp-pay"),
      branchId,
      amount,
      paymentDate,
      transactionId: `MANUAL - ${notes || "Offline Payment"}`,
    };
    (db.erpPayments as ErpPayment[]).push(newPayment);

    const branch = (db.branches as Branch[]).find((b) => b.id === branchId);
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
}
