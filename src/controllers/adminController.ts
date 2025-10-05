// src/controllers/adminController.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import bcrypt from "bcryptjs";
import { generatePassword } from "../utils/helpers";
// import { UserRole, BranchStatus } from "../types/api";
import { User, UserRole, BranchStatus } from "@prisma/client";


// A custom interface to add the 'user' property from your 'protect' middleware
interface AuthenticatedRequest extends Request {
  user?: { id: string; name: string; role: UserRole; branchId: string | null };
}

// --- Registration & Branch Management ---

export const getRegistrationRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const requests = await prisma.registrationRequest.findMany({
      where: { status: "pending" },
      orderBy: { submittedAt: "desc" },
    });
    res.status(200).json(requests);
  } catch (error) {
    next(error);
  }
};

export const approveRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.params.id;
  try {
    const request = await prisma.registrationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return res
        .status(404)
        .json({ message: "Registration request not found." });
    }
    if (request.status !== "pending") {
      return res
        .status(400)
        .json({ message: `Request is already ${request.status}.` });
    }

    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Use a transaction to ensure all database operations succeed or none do.
    await prisma.$transaction(async (tx) => {
      const newBranch = await tx.branch.create({
        data: {
          name: request.schoolName,
          location: request.location,
          registrationId: request.registrationId,
          status: "active",
        },
      });
      const principalUser = await tx.user.create({
        data: {
          name: request.principalName,
          email: request.email,
          phone: request.phone,
          passwordHash: hashedPassword,
          role: "Principal",
          branchId: newBranch.id,
          status: "active",
        },
      });
      await tx.branch.update({
        where: { id: newBranch.id },
        data: { principalId: principalUser.id },
      });
      await tx.registrationRequest.delete({
        where: { id: requestId },
      });
    });

    res.status(200).json({
      message: `Request for ${request.schoolName} approved.`,
      credentials: { email: request.email, password: tempPassword },
    });
  } catch (error) {
    next(error);
  }
};

export const denyRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const request = await prisma.registrationRequest.delete({
      where: { id: req.params.id },
    });
    res.status(200).json({
      message: `Request for ${request.schoolName} has been denied and removed.`,
    });
  } catch (error) {
    next(error);
  }
};

export const getBranches = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const status = req.query.status as BranchStatus | undefined;
    const whereClause = status ? { status } : {};
    const branches = await prisma.branch.findMany({
      where: whereClause,
      include: {
        principal: { select: { name: true } },
        _count: { select: { students: true, teachers: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(branches);
  } catch (error) {
    next(error);
  }
};

export const updateBranchStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { status } = req.body as { status: BranchStatus };
    const updatedBranch = await prisma.branch.update({
      where: { id: req.params.id },
      data: { status },
    });
    res
      .status(200)
      .json({ message: `Branch status updated to ${updatedBranch.status}.` });
  } catch (error) {
    next(error);
  }
};

export const deleteBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // This is highly destructive. In a real-world app, you'd soft-delete by updating status.
    await prisma.branch.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getSchoolDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const details = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: {
        principal: true,
        teachers: true,
        students: { select: { id: true, name: true } },
        classes: true,
      },
    });
    res.status(200).json(details);
  } catch (error) {
    next(error);
  }
};

export const updateBranchDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // You should add validation here to prevent unwanted fields from being updated.
    await prisma.branch.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.status(200).json({ message: "Branch details updated." });
  } catch (error) {
    next(error);
  }
};

// --- Dashboard & Analytics (Simplified for demonstration) ---

export const getAdminDashboardData = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const [
      totalSchools,
      totalStudents,
      totalTeachers,
      activeBranches,
      pendingRequests,
      principalQueries,
      monthlyFees,
    ] = await prisma.$transaction([
      prisma.branch.count(),
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.branch.count({ where: { status: "active" } }),
      prisma.registrationRequest.findMany({
        where: { status: "pending" },
        take: 5,
        orderBy: { submittedAt: "desc" },
      }),
      prisma.principalQuery.findMany({
        where: { resolved: false },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      // Calculate fees collected this month
      prisma.feePayment.aggregate({
        _sum: { amount: true },
        where: {
          paidDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            lt: new Date(
              new Date().getFullYear(),
              new Date().getMonth() + 1,
              1
            ),
          },
        },
      }),
    ]);

    // This is a simplified calculation for performance. A real one might use more complex queries.
    const allBranches = await prisma.branch.findMany({
      select: { id: true, name: true },
    });
    const healthScores = allBranches.map((b) => ({
      id: b.id,
      name: b.name,
      healthScore: Math.floor(70 + Math.random() * 30),
    }));
    healthScores.sort((a, b) => b.healthScore - a.healthScore);

    const dashboardData = {
      summary: {
        totalSchools,
        totalStudents,
        totalTeachers,
        activeBranches,
        feesCollected: monthlyFees._sum.amount || 0,
      },
      pendingRequests: {
        count: pendingRequests.length,
        requests: pendingRequests,
      },
      principalQueries: {
        count: principalQueries.length,
        queries: principalQueries,
      },
      topPerformingSchools: healthScores.slice(0, 5),
      bottomPerformingSchools: healthScores.slice(-5).reverse(),
      liveFeed: [],
      feeTrend: [],
      performanceTrend: [],
    };
    res.status(200).json(dashboardData);
  } catch (error) {
    next(error);
  }
};


export const getSystemWideFinancials = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = req.query as { startDate?: string, endDate?: string };
    const dateFilter = (startDate && endDate) ? { gte: new Date(startDate), lte: new Date(endDate) } : undefined;

    // 1. Calculate Summary Stats
    const totalCollected = await prisma.feePayment.aggregate({
      _sum: { amount: true },
      where: dateFilter ? { paidDate: dateFilter } : {},
    });

    const totalExpenditure = await prisma.manualExpense.aggregate({
      _sum: { amount: true },
      where: dateFilter ? { date: dateFilter } : {},
    });

    const feeRecords = await prisma.feeRecord.findMany();
    const totalPending = feeRecords.reduce((sum, record) => sum + (record.totalAmount - record.paidAmount), 0);
    const grandTotal = feeRecords.reduce((sum, record) => sum + record.totalAmount, 0);

    // 2. Calculate Collection by School
    const branches = await prisma.branch.findMany({ select: { id: true, name: true, status: true } });
    const studentFeeRecords = await prisma.student.findMany({
      where: { branchId: { in: branches.map(b => b.id) } },
      select: { id: true, branchId: true, feeRecords: true }
    });

    const collectionBySchool = branches.map(branch => {
      const branchStudents = studentFeeRecords.filter(s => s.branchId === branch.id);
      let collected = 0;
      let pending = 0;
      branchStudents.forEach(student => {
        student.feeRecords.forEach(record => {
            collected += record.paidAmount;
            pending += record.totalAmount - record.paidAmount;
        });
      });
      return { id: branch.id, name: branch.name, status: branch.status, collected, pending };
    });

    res.status(200).json({
      summary: {
        totalCollected: totalCollected._sum.amount || 0,
        totalExpenditure: totalExpenditure._sum.amount || 0,
        totalPending: totalPending,
        collectionRate: grandTotal > 0 ? ((grandTotal - totalPending) / grandTotal) * 100 : 0,
      },
      collectionBySchool,
    });
  } catch (error) {
    next(error);
  }
};

export const getSystemWideAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branches = await prisma.branch.findMany({
      select: { id: true, name: true, status: true }
    });

    const analyticsPromises = branches.map(async (branch) => {
      // Teacher-Student Ratio
      const [teacherCount, studentCount] = await Promise.all([
        prisma.teacher.count({ where: { branchId: branch.id } }),
        prisma.student.count({ where: { branchId: branch.id } }),
      ]);
      const ratio = studentCount > 0 && teacherCount > 0 ? parseFloat((studentCount / teacherCount).toFixed(1)) : 0;
      
      // Pass Percentage (assuming pass mark is 40)
      const passedMarks = await prisma.examMark.count({ where: { branchId: branch.id, score: { gte: 40 } } });
      const totalMarks = await prisma.examMark.count({ where: { branchId: branch.id } });
      const passPercentage = totalMarks > 0 ? (passedMarks / totalMarks) * 100 : 0;
      
      // Attendance
      const presentDays = await prisma.attendanceRecord.count({ where: { student: { branchId: branch.id }, status: 'Present' } });
      const totalDays = await prisma.attendanceRecord.count({ where: { student: { branchId: branch.id } } });
      const attendance = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

      return {
        passData: { id: branch.id, name: branch.name, status: branch.status, 'Pass %': passPercentage },
        ratioData: { id: branch.id, name: branch.name, status: branch.status, ratio },
        attendanceData: { id: branch.id, name: branch.name, status: branch.status, attendance },
      };
    });

    const results = await Promise.all(analyticsPromises);

    res.status(200).json({
      passPercentage: results.map(r => r.passData),
      teacherStudentRatio: results.map(r => r.ratioData),
      attendanceBySchool: results.map(r => r.attendanceData),
    });
  } catch (error) {
    next(error);
  }
};

// in src/controllers/adminController.ts

export const getSystemWideInfrastructureData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Get System-Wide Summary
    const [
      transportSummary,
      hostelSummary,
      totalTransportOccupancy,
      totalHostelOccupancy,
    ] = await prisma.$transaction([
      prisma.transportRoute.aggregate({ _sum: { capacity: true } }),
      prisma.room.aggregate({ _sum: { capacity: true } }),
      prisma.student.count({ where: { transportRouteId: { not: null } } }),
      prisma.student.count({ where: { roomId: { not: null } } }),
    ]);

    // 2. Get Branch-Specific Data
    const branches = await prisma.branch.findMany({ select: { id: true, name: true, location: true } });
    const branchDataPromises = branches.map(async (branch) => {
      const branchTransport = await prisma.transportRoute.aggregate({
        _sum: { capacity: true },
        where: { branchId: branch.id },
      });

      // FIX: Correctly aggregate room capacity by filtering on the nested relation
      const branchHostelCapacity = await prisma.room.aggregate({
        _sum: { capacity: true },
        where: { hostel: { branchId: branch.id } },
      });

      const [branchTransportOccupancy, branchHostelOccupancy] = await Promise.all([
         prisma.student.count({ where: { branchId: branch.id, transportRouteId: { not: null } } }),
         prisma.student.count({ where: { branchId: branch.id, roomId: { not: null } } }),
      ]);

      return {
        id: branch.id,
        name: branch.name,
        location: branch.location,
        transportCapacity: branchTransport._sum.capacity || 0,
        transportOccupancy: branchTransportOccupancy,
        hostelCapacity: branchHostelCapacity._sum.capacity || 0,
        hostelOccupancy: branchHostelOccupancy,
      };
    });

    const branchResults = await Promise.all(branchDataPromises);

    res.status(200).json({
      summary: {
        totalTransportCapacity: transportSummary._sum.capacity || 0,
        totalTransportOccupancy,
        totalHostelCapacity: hostelSummary._sum.capacity || 0,
        totalHostelOccupancy,
      },
      branches: branchResults,
    });
  } catch (error) {
    next(error);
  }
};

// --- User Management ---

export const getAllUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branchId: true,
        status: true,
      },
    });
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

export const resetUserPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const newPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: hashedPassword },
    });
    res.status(200).json({ newPassword });
  } catch (error) {
    next(error);
  }
};

// --- Communication ---
// TODO: These would integrate with a third-party service (e.g., Twilio for SMS, SendGrid for email).
export const getAdminCommunicationHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => res.status(501).json({ message: "Not implemented." });
export const sendBulkSms = async (
  req: Request,
  res: Response,
  next: NextFunction
) => res.status(200).json({ message: "SMS sent (simulation)." });
export const sendBulkEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => res.status(200).json({ message: "Email sent (simulation)." });
export const sendBulkNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => res.status(200).json({ message: "Notification sent (simulation)." });

// --- SuperAdmin / System Settings ---

export const getSystemSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "global" },
    });
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
};

export const updateSystemSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settings = await prisma.systemSettings.update({
      where: { id: "global" },
      data: req.body,
    });
    res.status(200).json({ message: "System settings updated.", settings });
  } catch (error) {
    next(error);
  }
};

export const getErpPayments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payments = await prisma.erpPayment.findMany({
      orderBy: { paymentDate: "desc" },
    });
    res.status(200).json(payments);
  } catch (error) {
    next(error);
  }
};

export const recordManualErpPayment = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Authentication required." });

    const { branchId, amount, paymentDate, notes, periodEndDate } = req.body;

    if (!branchId || !amount || !paymentDate) {
      return res
        .status(400)
        .json({ message: "Branch ID, amount, and payment date are required." });
    }

    const newPayment = await prisma.erpPayment.create({
      data: {
        branchId,
        amount: Number(amount),
        paymentDate: new Date(paymentDate),
        transactionId: `MANUAL-${req.user.id}-${Date.now()}`,
        // You might need to add a 'notes' field to your ErpPayment model in schema.prisma
      },
    });

    // Also update the branch's next due date
    // TODO: Calculation logic for next due date based on billing cycle

    res
      .status(201)
      .json({
        message: "Manual ERP payment recorded successfully.",
        payment: newPayment,
      });
  } catch (error) {
    next(error);
  }
};


export const getSystemWideErpFinancials = async (
  req: Request,
  res: Response,
  next: NextFunction
) => res.status(501).json({ message: "Not implemented." });

export const getAuditLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 100,
      orderBy: { timestamp: "desc" },
    });
    res.status(200).json(logs);
  } catch (error) {
    next(error);
  }
};

export const getPrincipalQueries = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const status = req.query.status as "Open" | "Resolved" | undefined;
    const whereClause: any = {};
    if (status) {
      whereClause.resolved = status === "Resolved";
    }
    const queries = await prisma.principalQuery.findMany({
      where: whereClause,
    });
    res.status(200).json(queries);
  } catch (error) {
    next(error);
  }
};

export const resolvePrincipalQuery = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Auth required." });
    const { adminNotes } = req.body;
    const query = await prisma.principalQuery.update({
      where: { id: req.params.id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        // Note: Your schema is missing fields for who resolved it. This is a suggestion.
        // resolvedById: req.user.id,
      },
    });
    res.status(200).json(query);
  } catch (error) {
    next(error);
  }
};

export const getSuperAdminContactDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const superAdmin = await prisma.user.findFirst({
      where: { role: "SuperAdmin" },
    });
    if (!superAdmin) {
      return res
        .status(404)
        .json({ message: "Super Admin contact details not found." });
    }
    const { passwordHash: _, ...contactDetails } = superAdmin;
    res.status(200).json(contactDetails);
  } catch (error) {
    next(error);
  }
};
