// services/sharedApiService.ts
import { db, saveDb } from "./database";
import type {
  User,
  Student,
  Teacher,
  LeaveApplication,
  RegistrationRequest,
  LeaveSetting,
  UserRole,
  TeacherAttendanceRecord,
  Branch,
} from "../types/api";
import { BaseApiService } from "./baseApiService";

const ENABLE_2FA_BYPASS = true;

export class SharedApiService extends BaseApiService {
  // =================================================================
  // SESSION & AUTHENTICATION
  // =================================================================
  async login(
    identifier: string,
    password: string
  ): Promise<(User & { otpRequired?: boolean }) | null> {
    await this.delay(500);
    const user = (db.users as User[]).find(
      (u) =>
        (u.email === identifier || u.id === identifier) &&
        u.password === password
    );

    if (user) {
      if (
        !ENABLE_2FA_BYPASS &&
        (user.role === "SuperAdmin" ||
          user.role === "Principal" ||
          user.role === "Registrar")
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
        const firstChildId = userToReturn.childrenIds[0];
        const firstChild = (db.students as Student[]).find(
          (s) => s.id === firstChildId
        );
        if (firstChild) {
          userToReturn.branchId = firstChild.branchId;
        }
      }
      return userToReturn;
    }
    return null;
  }

  async verifyOtp(userId: string, otp: string): Promise<User | null> {
    await this.delay(500);
    const userInDb = (db.users as User[]).find((u) => u.id === userId);
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

    const existingBranch = (db.branches as any[]).find(
      (b) => b.registrationId === data.registrationId
    );
    const pendingRequest = (
      db.registrationRequests as RegistrationRequest[]
    ).find(
      (r) => r.registrationId === data.registrationId && r.status === "pending"
    );

    if (existingBranch || pendingRequest) {
      throw new Error(
        "This School Registration ID is already taken or pending approval."
      );
    }

    const newRequest: RegistrationRequest = {
      id: this.generateId("req"),
      submittedAt: new Date(),
      status: "pending",
      ...data,
    };
    (db.registrationRequests as RegistrationRequest[]).push(newRequest);
    saveDb();
  }

  async changePassword(
    userId: string,
    current: string,
    newPass: string
  ): Promise<void> {
    await this.delay(500);
    const user = (db.users as User[]).find((u) => u.id === userId);
    if (!user || user.password !== current) {
      throw new Error("Invalid current password.");
    }
    user.password = newPass;
    saveDb();
  }

  async resetUserPassword(userId: string): Promise<{ newPassword: string }> {
    await this.delay(800);
    const user = (db.users as User[]).find((u) => u.id === userId);
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
  ): Promise<User> {
    await this.delay(300);
    const user = (db.users as User[]).find((u) => u.id === userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.role === "Student") {
      throw new Error("Students cannot change their profile details.");
    }

    Object.assign(user, updates);

    if (user.role === "Teacher") {
      const teacher = (db.teachers as Teacher[]).find((t) => t.id === userId);
      if (teacher) {
        if (updates.name) teacher.name = updates.name;
        if (updates.email) teacher.email = updates.email;
        if (updates.phone) teacher.phone = updates.phone;
      }
    }

    saveDb();

    const { password, ...safeUser } = user;
    return safeUser as User;
  }

  public async getBranchById(branchId: string): Promise<Branch | null> {
    return super.getBranchById(branchId);
  }

  public async getPublicUserProfile(
    userId: string
  ): Promise<Partial<User> | null> {
    await this.delay(100);
    const user = this.getUserById(userId);
    if (!user) return null;
    const { password, currentOtp, profileAccessOtp, ...safeUser } = user;
    return safeUser;
  }

  async createLeaveApplication(
    data: Omit<LeaveApplication, "id" | "status">
  ): Promise<void> {
    const newApp: LeaveApplication = {
      id: this.generateId("leave"),
      status: "Pending",
      ...data,
    };
    (db.leaveApplications as LeaveApplication[]).push(newApp);
    saveDb();
  }

  async getLeaveApplicationsForUser(
    userId: string
  ): Promise<LeaveApplication[]> {
    return (db.leaveApplications as LeaveApplication[]).filter(
      (l) => l.applicantId === userId
    );
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

  async getStaffListForBranch(branchId: string): Promise<User[]> {
    await this.delay(150);
    const staffRoles: UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "Principal",
      "SupportStaff",
    ];
    return (db.users as User[]).filter(
      (u) => u.branchId === branchId && staffRoles.includes(u.role)
    );
  }

  async getStaffAttendanceAndLeaveForMonth(
    staffId: string,
    year: number,
    month: number
  ): Promise<{
    attendance: TeacherAttendanceRecord[];
    leaves: LeaveApplication[];
  }> {
    await this.delay(250);

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    const attendance = (
      db.teacherAttendance as TeacherAttendanceRecord[]
    ).filter((r) => {
      const recordDate = new Date(r.date);
      return (
        r.teacherId === staffId &&
        recordDate >= startDate &&
        recordDate <= endDate
      );
    });

    const leaves = (db.leaveApplications as LeaveApplication[]).filter((l) => {
      if (l.applicantId !== staffId || l.status !== "Approved") {
        return false;
      }
      const leaveStart = new Date(l.startDate);
      const leaveEnd = new Date(l.endDate);
      return leaveStart <= endDate && leaveEnd >= startDate;
    });

    return { attendance, leaves };
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
    const staff = (db.users as User[]).filter(
      (u) => u.branchId === branchId && staffRoles.includes(u.role)
    );

    const allTeacherAttendance = (
      db.teacherAttendance as TeacherAttendanceRecord[]
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

  async getSuperAdminContactDetails(): Promise<User | null> {
    await this.delay(50);
    const user = (db.users as User[]).find((u) => u.role === "SuperAdmin");
    if (!user) return null;
    const { password, ...safeUser } = user;
    return safeUser as User;
  }
}

export const sharedApiService = new SharedApiService();
