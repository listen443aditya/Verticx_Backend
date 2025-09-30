// services/parentApiService.ts
import { db, saveDb } from "./database";
import type {
  Student,
  Teacher,
  ParentDashboardData,
  ChildData,
  MeetingRequest,
  FeePayment,
  StudentProfile,
  ComplaintAboutStudent,
  HydratedMeetingRequest,
  FeeHistoryItem,
  FeeRecord,
  GradeWithCourse,
  TransportRoute,
  Room,
  BusStop,
  Hostel,
} from "../types/api";
import { BaseApiService } from "./baseApiService";
import { studentApiService } from "./index"; // Use existing student service logic

export class ParentApiService extends BaseApiService {
  async getParentDashboardData(parentId: string): Promise<ParentDashboardData> {
    await this.delay(500);
    const parentUser = this.getUserById(parentId);
    if (!parentUser || !parentUser.childrenIds)
      throw new Error("Parent not found");

    const childrenData: ChildData[] = [];
    for (const childId of parentUser.childrenIds) {
      const studentDashboard = await studentApiService.getStudentDashboardData(
        childId
      );
      const transportDetails = await this.getTransportDetailsForMember(
        childId,
        "Student"
      );
      const accommodationDetails = await this.getAccommodationDetailsForStudent(
        childId
      );
      const branch = await this.getBranchById(studentDashboard.branchId);
      const student = this.getStudentById(childId);

      if (!branch || !student) continue;

      const child: ChildData = {
        ...studentDashboard,
        student,
        branch,
        attendance: {
          ...studentDashboard.attendance,
          sessionPercentage: studentDashboard.attendance.monthlyPercentage,
        },
        feeHistory: await this.getFeeHistoryForStudent(childId),
        transportDetails,
        accommodationDetails,
        assignments: studentDashboard.assignments.pending,
      };
      childrenData.push(child);
    }

    const branchId = childrenData[0]?.branchId;
    const announcements = branchId
      ? (db.announcements as any[]).filter(
          (a) =>
            a.branchId === branchId &&
            (a.audience === "All" || a.audience === "Parents")
        )
      : [];

    return { childrenData, announcements };
  }

  // ✨ FIX: Changed return type to match ChildData interface and return full objects.
  async getTransportDetailsForMember(
    memberId: string,
    memberType: "Student" | "Teacher"
  ): Promise<{ route: TransportRoute; stop: BusStop } | undefined> {
    const member =
      memberType === "Student"
        ? this.getStudentById(memberId)
        : this.getTeacherById(memberId);
    if (!member || !member.transportInfo) return undefined;

    const route = (db.transportRoutes as TransportRoute[]).find(
      (r) => r.id === member.transportInfo?.routeId
    );
    if (!route) return undefined;

    // ✨ FIX: Using a type assertion because 'stops' is missing from the TransportRoute type definition.
    // The long-term solution is to add 'stops: BusStop[]' to the 'TransportRoute' type in 'src/types/api.ts'.
    const stop = ((route as any).stops || []).find(
      (s: BusStop) => s.id === member.transportInfo?.stopId
    );
    if (!stop) return undefined;

    return {
      route,
      stop,
    };
  }

  // ✨ FIX: Implemented missing getHostelById method and changed return type to match ChildData interface.
  private getHostelById(hostelId: string): Hostel | undefined {
    return (db.hostels as Hostel[]).find((h) => h.id === hostelId);
  }

  async getAccommodationDetailsForStudent(
    studentId: string
  ): Promise<{ hostel: Hostel; room: Room } | undefined> {
    const student = this.getStudentById(studentId);
    if (!student || !student.roomId) return undefined;

    const room = (db.rooms as Room[]).find((r) => r.id === student.roomId);
    if (!room) return undefined;

    const hostel = this.getHostelById(room.hostelId);
    if (!hostel) return undefined;

    return {
      hostel,
      room,
    };
  }

  async getStudentProfileDetails(
    studentId: string
  ): Promise<StudentProfile | null> {
    return super.getStudentProfileDetails(studentId);
  }

  async getComplaintsAboutStudent(
    studentId: string
  ): Promise<ComplaintAboutStudent[]> {
    return (db.complaintsAboutStudents as ComplaintAboutStudent[]).filter(
      (c) => c.studentId === studentId
    );
  }

  async getFeeHistoryForStudent(studentId: string): Promise<FeeHistoryItem[]> {
    const payments = (db.feePayments as FeePayment[]).filter(
      (p) => p.studentId === studentId
    );
    const adjustments = (db.feeAdjustments as any[]).filter(
      (a) => a.studentId === studentId
    );
    return [...payments, ...adjustments].sort(
      (a, b) =>
        new Date("paidDate" in a ? a.paidDate : a.date).getTime() -
        new Date("paidDate" in b ? b.paidDate : b.date).getTime()
    );
  }

  async getTeachersForStudent(studentId: string): Promise<Teacher[]> {
    const student = this.getStudentById(studentId);
    if (!student || !student.classId) return [];
    const sClass = this.getClassById(student.classId);
    if (!sClass) return [];
    const teacherIds = new Set<string>();
    sClass.subjectIds.forEach((subjectId) => {
      const subject = this.getSubjectById(subjectId);
      if (subject?.teacherId) {
        teacherIds.add(subject.teacherId);
      }
    });
    return Array.from(teacherIds)
      .map((id) => this.getTeacherById(id))
      .filter((t): t is Teacher => !!t);
  }

  async getMeetingRequestsForParent(
    parentId: string
  ): Promise<HydratedMeetingRequest[]> {
    return (db.meetingRequests as MeetingRequest[])
      .filter((r) => r.parentId === parentId)
      .map((r) => ({
        ...r,
        parentName: this.getUserById(r.parentId)?.name || "Unknown Parent",
        teacherName:
          this.getTeacherById(r.teacherId)?.name || "Unknown Teacher",
        studentName:
          this.getStudentById(r.studentId)?.name || "Unknown Student",
      }));
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

  async createMeetingRequest(
    request: Omit<MeetingRequest, "id" | "status">
  ): Promise<void> {
    const newReq: MeetingRequest = {
      id: this.generateId("meet"),
      status: "pending",
      ...request,
    };
    (db.meetingRequests as MeetingRequest[]).push(newReq);
    saveDb();
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
        details: `Online payment for ${paidMonths.join(
          ", "
        )} and previous dues.`,
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

  async getFeeRecordForStudent(studentId: string): Promise<FeeRecord | null> {
    return (
      (db.feeRecords as FeeRecord[]).find((fr) => fr.studentId === studentId) ||
      null
    );
  }

  async getStudentGrades(studentId: string): Promise<GradeWithCourse[]> {
    return studentApiService.getStudentGrades(studentId);
  }
}
