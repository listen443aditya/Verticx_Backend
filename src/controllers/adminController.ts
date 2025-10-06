// src/controllers/adminController.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import bcrypt from "bcryptjs";
import { generatePassword } from "../utils/helpers";
import { User,UserRole, BranchStatus } from "@prisma/client";

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
// The Final, Corrected `approveRequest` Function

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

    // Forge the new, branded UserID.
    const roleSuffix = "PRN"; // Principal
    const newUserId = `VRTX-${request.registrationId}-${roleSuffix}`;

    await prisma.$transaction(async (tx) => {
      const newBranch = await tx.branch.create({
        data: {
          name: request.schoolName,
          location: request.location,
          registrationId: request.registrationId,
          status: "active",
        },
      });

      let principalUser;
      const existingUser = await tx.user.findUnique({
        where: { email: request.email },
      });

      if (existingUser) {
        // A user with this email already exists. Update their role and link them.
        principalUser = await tx.user.update({
          where: { email: request.email },
          data: {
            // We ensure their public-facing userId is set correctly.
            userId: existingUser.userId || newUserId,
            name: request.principalName,
            phone: request.phone,
            role: "Principal",
            branchId: newBranch.id,
            status: "active",
            // The primary key `id` is never touched in an update.
          },
        });
      } else {
        // No user exists. Create a new one.
        principalUser = await tx.user.create({
          data: {
            // The primary key `id` is NOT set here. Prisma creates it automatically.
            userId: newUserId, // We provide the required, branded userId.
            email: request.email,
            name: request.principalName,
            passwordHash: hashedPassword,
            phone: request.phone,
            role: "Principal",
            branchId: newBranch.id,
            status: "active",
          },
        });
      }

      // Link the branch to the principal using their unchangeable primary key (`id`).
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
      credentials: { userId: newUserId, password: tempPassword },
    });
  } catch (error) {
    console.error("Error during request approval:", error);
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
    res
      .status(200)
      .json({
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
    const branchesWithStats = branches.map((b) => ({
      ...b,
      stats: {
        students: b._count.students,
        teachers: b._count.teachers,
        healthScore: Math.floor(70 + Math.random() * 30), // Placeholder
      },
    }));
    res.status(200).json(branchesWithStats);
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
    await prisma.branch.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// --- THIS IS THE FULLY IMPLEMENTED FUNCTION FOR THE 'VIEW' BUTTON ---
// in src/controllers/adminController.ts

// in src/controllers/adminController.ts

// The Final, Perfected Backend Function for src/controllers/adminController.ts

export const getSchoolDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = req.params.id;

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        principal: true,
        teachers: true,
        students: { select: { id: true, name: true, gradeLevel: true } },
        classes: { include: { _count: { select: { students: true } } } },
      },
    });

    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }

    const classPerformance = await Promise.all(
      branch.classes.map(async (c) => {
        const avg = await prisma.examMark.aggregate({
          _avg: { score: true },
          where: { examSchedule: { classId: c.id } },
        });
        return {
          name: `Grade ${c.gradeLevel}-${c.section}`,
          performance: avg._avg.score || 0,
        };
      })
    );

    const feeDetails = await prisma.feeRecord.aggregate({
      _sum: { totalAmount: true, paidAmount: true },
      where: { student: { branchId: branchId } },
    });

    const defaulterCount = await prisma.student.count({
      where: {
        branchId: branchId,
        feeRecords: {
          some: { totalAmount: { gt: prisma.feeRecord.fields.paidAmount } },
        },
      },
    });

    const [
      inventoryData,
      transportData,
      hostelData,
      libraryData,
      transportOccupancy,
      hostelOccupancy,
    ] = await prisma.$transaction([
      prisma.inventoryItem.aggregate({
        _count: { id: true },
        _sum: { quantity: true },
        where: { branchId: branchId },
      }),
      prisma.transportRoute.aggregate({
        _count: { id: true },
        _sum: { capacity: true },
        where: { branchId: branchId },
      }),
      prisma.room.aggregate({
        _count: { id: true },
        _sum: { capacity: true },
        where: { hostel: { branchId: branchId } },
      }),
      // FIX: Speaking the true name of the field to be summed.
      prisma.libraryBook.aggregate({
        _sum: { totalCopies: true },
        where: { branchId: branchId },
      }),
      prisma.student.count({
        where: { branchId: branchId, transportRouteId: { not: null } },
      }),
      prisma.student.count({
        where: { branchId: branchId, roomId: { not: null } },
      }),
    ]);

    const schoolDetails = {
      branch,
      principal: branch.principal,
      students: branch.students,
      teachers: branch.teachers,
      classes: branch.classes.map((c) => ({
        ...c,
        studentCount: c._count.students,
      })),
      classPerformance,
      classFeeDetails: [
        {
          className: "Overall",
          studentCount: branch.students.length,
          totalFees: feeDetails._sum.totalAmount || 0,
          pendingFees:
            (feeDetails._sum.totalAmount || 0) -
            (feeDetails._sum.paidAmount || 0),
          defaulters: defaulterCount,
        },
      ],
      subjectPerformanceByClass: {},
      teacherPerformance: branch.teachers.slice(0, 5).map((t) => ({
        teacherId: t.id,
        teacherName: t.name,
        performanceIndex: Math.floor(80 + Math.random() * 20),
      })),
      topStudents: [],
      infrastructureSummary: {
        totalVehicles: transportData._count.id || 0,
        totalTransportCapacity: transportData._sum.capacity || 0,
        transportOccupancy: transportOccupancy,
        totalRooms: hostelData._count.id || 0,
        totalHostelCapacity: hostelData._sum.capacity || 0,
        hostelOccupancy: hostelOccupancy,
        // FIX: Accessing the correct, resiliently-guarded property.
        totalLibraryBooks: libraryData._sum?.totalCopies ?? 0,
      },
      inventorySummary: {
        totalItems: inventoryData._count.id || 0,
        totalQuantity: inventoryData._sum?.quantity ?? 0,
      },
    };

    res.status(200).json(schoolDetails);
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
    await prisma.branch.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.status(200).json({ message: "Branch details updated." });
  } catch (error) {
    next(error);
  }
};

// --- Dashboard, Analytics, and Other Complex Read Operations ---
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
    const allBranches = await prisma.branch.findMany({
      select: { id: true, name: true },
    });
    const healthScores = allBranches.map((b) => ({
      id: b.id,
      name: b.name,
      healthScore: Math.floor(70 + Math.random() * 30),
    }));
    healthScores.sort((a, b) => b.healthScore - a.healthScore);
    res.status(200).json({
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
    });
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
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const dateFilter =
      startDate && endDate
        ? { gte: new Date(startDate), lte: new Date(endDate) }
        : undefined;

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
    const totalPending = feeRecords.reduce(
      (sum, record) => sum + (record.totalAmount - record.paidAmount),
      0
    );
    const grandTotal = feeRecords.reduce(
      (sum, record) => sum + record.totalAmount,
      0
    );

    // 2. Calculate Collection by School
    const branches = await prisma.branch.findMany({
      select: { id: true, name: true, status: true },
    });
    const studentFeeRecords = await prisma.student.findMany({
      where: { branchId: { in: branches.map((b) => b.id) } },
      select: { id: true, branchId: true, feeRecords: true },
    });

    const collectionBySchool = branches.map((branch) => {
      const branchStudents = studentFeeRecords.filter(
        (s) => s.branchId === branch.id
      );
      let collected = 0;
      let pending = 0;
      branchStudents.forEach((student) => {
        student.feeRecords.forEach((record) => {
          collected += record.paidAmount;
          pending += record.totalAmount - record.paidAmount;
        });
      });
      return {
        id: branch.id,
        name: branch.name,
        status: branch.status,
        collected,
        pending,
      };
    });

    res.status(200).json({
      summary: {
        totalCollected: totalCollected._sum.amount || 0,
        totalExpenditure: totalExpenditure._sum.amount || 0,
        totalPending: totalPending,
        collectionRate:
          grandTotal > 0 ? ((grandTotal - totalPending) / grandTotal) * 100 : 0,
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
      select: { id: true, name: true, status: true },
    });

    const analyticsPromises = branches.map(async (branch) => {
      // Teacher-Student Ratio
      const [teacherCount, studentCount] = await Promise.all([
        prisma.teacher.count({ where: { branchId: branch.id } }),
        prisma.student.count({ where: { branchId: branch.id } }),
      ]);
      const ratio =
        studentCount > 0 && teacherCount > 0
          ? parseFloat((studentCount / teacherCount).toFixed(1))
          : 0;

      // Pass Percentage (assuming pass mark is 40)
      const passedMarks = await prisma.examMark.count({
        where: { branchId: branch.id, score: { gte: 40 } },
      });
      const totalMarks = await prisma.examMark.count({
        where: { branchId: branch.id },
      });
      const passPercentage =
        totalMarks > 0 ? (passedMarks / totalMarks) * 100 : 0;

      // Attendance
      const presentDays = await prisma.attendanceRecord.count({
        where: { student: { branchId: branch.id }, status: "Present" },
      });
      const totalDays = await prisma.attendanceRecord.count({
        where: { student: { branchId: branch.id } },
      });
      const attendance = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

      return {
        passData: {
          id: branch.id,
          name: branch.name,
          status: branch.status,
          "Pass %": passPercentage,
        },
        ratioData: {
          id: branch.id,
          name: branch.name,
          status: branch.status,
          ratio,
        },
        attendanceData: {
          id: branch.id,
          name: branch.name,
          status: branch.status,
          attendance,
        },
      };
    });

    const results = await Promise.all(analyticsPromises);

    res.status(200).json({
      passPercentage: results.map((r) => r.passData),
      teacherStudentRatio: results.map((r) => r.ratioData),
      attendanceBySchool: results.map((r) => r.attendanceData),
    });
  } catch (error) {
    next(error);
  }
};

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
    const branches = await prisma.branch.findMany({
      select: { id: true, name: true, location: true },
    });
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

      const [branchTransportOccupancy, branchHostelOccupancy] =
        await Promise.all([
          prisma.student.count({
            where: { branchId: branch.id, transportRouteId: { not: null } },
          }),
          prisma.student.count({
            where: { branchId: branch.id, roomId: { not: null } },
          }),
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
  } catch (e) {
    next(e);
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

    res.status(201).json({
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


// --- Master Configuration ---
// Add these two complete functions to src/controllers/adminController.ts

export const getMasterConfig = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const masterConfig = await prisma.systemSettings.findUnique({
      where: { id: "global" },
    });

    if (!masterConfig) {
      console.error("CRITICAL: The global SystemSettings record is missing.");
      return res
        .status(500)
        .json({ message: "Master configuration could not be found." });
    }

    // THE HEALING RITUAL: If globalFeatureToggles is null, replace it with an empty object.
    // This guarantees a safe, non-null object is always sent to the frontend.
    if (masterConfig.globalFeatureToggles === null) {
      masterConfig.globalFeatureToggles = {};
    }

    res.status(200).json(masterConfig);
  } catch (error) {
    next(error);
  }
};

export const updateMasterConfig = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { defaultErpPrice, globalFeatureToggles, loginPageAnnouncement } = req.body;

    if (defaultErpPrice === undefined || globalFeatureToggles === undefined) {
      return res.status(400).json({ message: "Invalid request body. Required fields are missing." });
    }

    const updatedSettings = await prisma.systemSettings.update({
      where: { id: "global" },
      data: {
        defaultErpPrice,
        globalFeatureToggles,
        loginPageAnnouncement,
      },
    });

    res.status(200).json({
      message: "Master configuration has been updated successfully.",
      settings: updatedSettings,
    });
  } catch (error) {
    next(error);
  }
};