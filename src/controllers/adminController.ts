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
      credentials: { userId: newUserId, password: tempPassword, email: request.email },
    });
  } catch (error) {
    console.error("Error during request approval:", error);
    next(error);
  }
};

export const assignBranchToUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: userId } = req.params;
    const { branchId } = req.body;

    if (!branchId) {
      return res.status(400).json({ message: "A branchId must be provided." });
    }

    // A decree must be validated. We ensure both the subject and the land exist.
    const [user, branch] = await prisma.$transaction([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.branch.findUnique({ where: { id: branchId } }),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }

    // The decree is enacted. The user is bound to their new lands.
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { branchId: branch.id },
    });

    // If the user is a Principal, we complete the circle and bind the land to its king.
    if (updatedUser.role === "Principal") {
      await prisma.branch.update({
        where: { id: branch.id },
        data: { principalId: updatedUser.id },
      });
    }

    res
      .status(200)
      .json({
        message: `User ${user.name} has been successfully assigned to branch ${branch.name}.`,
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

    // FIX 1: Use the correct field name 'paidAmount' from your schema.
    const feeDetails = await prisma.feeRecord.aggregate({
      _sum: { totalAmount: true, paidAmount: true },
      where: { student: { branchId: branchId } },
    });

    // FIX 2: Use the correct column name '"paidAmount"' in the raw query.
    const defaulterCountResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "studentId")
        FROM "FeeRecord"
        INNER JOIN "Student" ON "Student"."id" = "FeeRecord"."studentId"
        WHERE "Student"."branchId" = ${branchId}
          AND "FeeRecord"."totalAmount" > "FeeRecord"."paidAmount"
    `;
    const defaulterCount = Number(defaulterCountResult[0]?.count || 0);

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

    // FIX 3: Add null-safety checks for feeDetails._sum
    const totalFees = feeDetails._sum?.totalAmount ?? 0;
    const paidFees = feeDetails._sum?.paidAmount ?? 0;

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
          totalFees: totalFees,
          pendingFees: totalFees - paidFees,
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
  
  // Add or remove fields here based on what's allowed.
  const { name, address, phone, email, city, state } = req.body;

  // 2. Create a clean data object with only those allowed fields.
  const updates = {
    name,
    address,
    phone,
    email,
    city,
    state,
  };

  try {
    await prisma.branch.update({
      where: { id: req.params.id },
      data: updates, // Use the sanitized `updates` object, not the raw req.body
    });
    res.status(200).json({ message: "Branch details updated successfully." });
  } catch (error) {
    // This will handle cases where the branch ID is not found, etc.
    next(error);
  }
};



// export const updateBranchDetails = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     await prisma.branch.update({
//       where: { id: req.params.id },
//       data: req.body,
//     });
//     res.status(200).json({ message: "Branch details updated." });
//   } catch (error) {
//     next(error);
//   }
// };

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
) => {
  try {
    // Fetch all SMS and Announcement history in parallel for efficiency
    const [smsHistory, announcements] = await prisma.$transaction([
      prisma.smsMessage.findMany({
        orderBy: { sentAt: "desc" },
        include: {
          branch: { select: { name: true } }, // Include branch name for context
        },
      }),
      prisma.announcement.findMany({
        orderBy: { sentAt: "desc" },
        include: {
          branch: { select: { name: true } }, // Include branch name for context
        },
      }),
    ]);

    res.status(200).json({
      sms: smsHistory,
      notifications: announcements,
      emails: [], 
    });
  } catch (error) {
    next(error);
  }
};
export const sendBulkSms = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { target, message } = req.body;
    const sentBy = req.user?.name || "SuperAdmin";

    if (!target || !target.roles || !message) {
      return res
        .status(400)
        .json({
          message: "Invalid payload. Target, roles, and message are required.",
        });
    }

    // 1. Build the query to find the target users
    const whereClause: any = {
      role: { in: target.roles },
      phone: { not: null }, // Only select users with a phone number
    };

    if (target.scope === "BRANCH_SPECIFIC" && target.branchIds?.length > 0) {
      whereClause.branchId = { in: target.branchIds };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: { phone: true },
    });

    const phoneNumbers = users.map((u) => u.phone!);
    if (phoneNumbers.length === 0) {
      return res
        .status(404)
        .json({
          message: "No users with phone numbers found for the selected target.",
        });
    }

    // 2. **SIMULATE** sending the SMS.
    // In a real application, you would integrate an SMS gateway like Twilio here.
    // For example: await twilioClient.messages.create({ body: message, to: phoneNumber, from: ... })
    console.log(
      `[SMS Simulation] Sending message: "${message}" to ${phoneNumbers.length} recipients.`
    );

    // 3. Record the action in the database history
    await prisma.smsMessage.create({
      data: {
        message,
        sentBy,
        recipientCount: phoneNumbers.length,
        // branchId is null for system-wide messages, thanks to our schema fix
        branchId:
          target.scope === "BRANCH_SPECIFIC" ? target.branchIds[0] : null,
      },
    });

    res
      .status(200)
      .json({
        message: `SMS successfully sent (simulated) to ${phoneNumbers.length} recipients.`,
      });
  } catch (error) {
    next(error);
  }
};

// REPLACE the old sendBulkEmail with this
export const sendBulkEmail = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { target, subject, body } = req.body;
    const sentBy = req.user?.name || "SuperAdmin";

    if (!target || !target.roles || !subject || !body) {
      return res
        .status(400)
        .json({
          message:
            "Invalid payload. Target, roles, subject, and body are required.",
        });
    }

    // 1. Build the query to find the target users
    const whereClause: any = {
      role: { in: target.roles },
      email: { not: null },
    };

    if (target.scope === "BRANCH_SPECIFIC" && target.branchIds?.length > 0) {
      whereClause.branchId = { in: target.branchIds };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: { email: true },
    });

    const emails = users.map((u) => u.email!);
    if (emails.length === 0) {
      return res
        .status(404)
        .json({
          message: "No users with emails found for the selected target.",
        });
    }

    // 2. **SIMULATE** sending the email.
    // In a real application, you would use a service like Nodemailer, SendGrid, or AWS SES.
    // For example: await sendgrid.send({ to: emails, from: ..., subject, html: body })
    console.log(
      `[Email Simulation] Sending email with subject: "${subject}" to ${emails.length} recipients.`
    );

    // NOTE: No history is recorded as there is no 'EmailMessage' model in your schema.
    // You could add one in the future if needed.

    res
      .status(200)
      .json({
        message: `Email successfully sent (simulated) to ${emails.length} recipients.`,
      });
  } catch (error) {
    next(error);
  }
};

// REPLACE the old sendBulkNotification with this
export const sendBulkNotification = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { target, title, message } = req.body;
    const sentBy = req.user?.name || "SuperAdmin";

    if (!target || !target.roles || !title || !message) {
      return res
        .status(400)
        .json({
          message:
            "Invalid payload. Target, roles, title, and message are required.",
        });
    }

    let targetBranchIds: string[] = [];

    // 1. Determine which branches to send the announcement to
    if (target.scope === "SYSTEM_WIDE") {
      const allBranches = await prisma.branch.findMany({
        select: { id: true },
      });
      targetBranchIds = allBranches.map((b) => b.id);
    } else if (
      target.scope === "BRANCH_SPECIFIC" &&
      target.branchIds?.length > 0
    ) {
      targetBranchIds = target.branchIds;
    }

    if (targetBranchIds.length === 0) {
      return res.status(404).json({ message: "No target branches found." });
    }

    // 2. Create an Announcement record for each targeted branch
    const announcementsToCreate = targetBranchIds.map((branchId) => ({
      title,
      message,
      sentBy,
      audience: target.roles.join(", "), // Store roles as a string
      branchId: branchId,
    }));

    const result = await prisma.announcement.createMany({
      data: announcementsToCreate,
    });

    res
      .status(200)
      .json({
        message: `Notification sent as an announcement to ${result.count} branches.`,
      });
  } catch (error) {
    next(error);
  }
};




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
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const { branchId, amount, paymentDate, notes, periodEndDate } = req.body;

    if (!branchId || !amount || !paymentDate || !periodEndDate) {
      return res
        .status(400)
        .json({
          message:
            "Branch ID, amount, payment date, and period end date are required.",
        });
    }

    // --- THIS IS THE FIX ---
    // We use a transaction to ensure both the payment is created AND the branch is updated.
    // If either operation fails, the whole thing is rolled back.

    const [newPayment, updatedBranch] = await prisma.$transaction(
      async (tx) => {
        // 1. Create the detailed payment record
        const payment = await tx.erpPayment.create({
          data: {
            branchId,
            amount: Number(amount),
            paymentDate: new Date(paymentDate),
            transactionId: `MANUAL-${req.user!.id}-${Date.now()}`,
            notes, // Now saving notes
            periodEndDate: new Date(periodEndDate), // And the period end date
          },
        });

        // 2. Calculate the next due date (e.g., the first day of the next month)
        const periodEnd = new Date(periodEndDate);
        const nextDueDate = new Date(
          periodEnd.getFullYear(),
          periodEnd.getMonth() + 1,
          1
        );

        // 3. Update the branch with the new due date
        const branch = await tx.branch.update({
          where: { id: branchId },
          data: {
            nextDueDate: nextDueDate,
          },
        });

        return [payment, branch];
      }
    );

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
) => {
  // FIX 1: Corrected syntax from 'try:' to 'try {'
  try {
    // Helper to count months between dates
    const countMonths = (startDate: Date, endDate: Date): number => {
      let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
      months -= startDate.getMonth();
      months += endDate.getMonth();
      return months < 0 ? 0 : months + 1; // +1 to include the starting month
    };

    const today = new Date();
    // A reasonable default session start if not specified on a branch
    const defaultSessionStart = new Date(`${today.getFullYear()}-04-01`);

    // --- Step 1: Fetch all raw data in parallel for efficiency ---
    const [branches, allPayments, totalStudentCount, systemSettings] =
      await prisma.$transaction([
        prisma.branch.findMany({
          select: {
            id: true,
            name: true,
            erpPricePerStudent: true,
            academicSessionStartDate: true,
            _count: { select: { students: true } },
          },
        }),
        prisma.erpPayment.findMany({
          select: { branchId: true, amount: true, paymentDate: true },
        }),
        prisma.student.count(),
        prisma.systemSettings.findUnique({ where: { id: "global" } }),
      ]);

    const defaultErpPrice = systemSettings?.defaultErpPrice || 10;

    // --- Step 2: Calculate billing status for each school ---
    const billingStatusBySchool = branches.map((branch) => {
      const studentCount = branch._count.students;
      const erpPrice = branch.erpPricePerStudent ?? defaultErpPrice;
      const sessionStart =
        branch.academicSessionStartDate || defaultSessionStart;

      const monthsPassed = countMonths(sessionStart, today);
      const totalBilled = monthsPassed * studentCount * erpPrice;

      const totalPaid = allPayments
        .filter((p) => p.branchId === branch.id)
        .reduce((sum, p) => sum + p.amount, 0);

      const pendingAmount = Math.max(0, totalBilled - totalPaid);

      return {
        id: branch.id,
        name: branch.name,
        studentCount,
        erpPrice,
        totalBilled,
        totalPaid,
        pendingAmount,
      };
    });

    // --- Step 3: Calculate the monthly billing trend ---
    // FIX 2: Removed reference to non-existent 'systemSettings.academicSessionStartDate'
    // We will use the 'defaultSessionStart' variable defined at the top of the function.
    const sessionStartDate = defaultSessionStart;
    const billingTrend: { month: string; billed: number; paid: number }[] = [];

    // Group all payments by month for easy lookup
    const paymentsByMonth = allPayments.reduce((acc, payment) => {
      const month = payment.paymentDate.toISOString().slice(0, 7); // "YYYY-MM"
      acc[month] = (acc[month] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);

    // Iterate from the session start to the current month
    let currentDate = new Date(sessionStartDate);
    while (currentDate <= today) {
      const monthKey = currentDate.toISOString().slice(0, 7);
      const monthName = currentDate.toLocaleString("default", {
        month: "short",
        year: "2-digit",
      });

      billingTrend.push({
        month: monthName,
        billed: totalStudentCount * defaultErpPrice, // Approximation for trend graph
        paid: paymentsByMonth[monthKey] || 0,
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // --- Step 4: Assemble the final summary object ---
    const summary = billingStatusBySchool.reduce(
      (acc, school) => {
        acc.totalBilled += school.totalBilled;
        acc.totalPaid += school.totalPaid;
        acc.pendingAmount += school.pendingAmount;
        if (school.pendingAmount > 0) {
          acc.pendingSchoolsCount += 1;
        }
        return acc;
      },
      {
        totalBilled: 0,
        totalPaid: 0,
        pendingAmount: 0,
        totalSchools: branches.length,
        totalStudents: totalStudentCount,
        pendingSchoolsCount: 0,
      }
    );

    // --- Step 5: Send the complete response ---
    res.status(200).json({
      summary,
      billingTrend,
      billingStatusBySchool,
    });
  } catch (error) {
    next(error);
  }
};
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