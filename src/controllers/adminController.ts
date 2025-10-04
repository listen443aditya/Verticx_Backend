// src/controllers/adminController.ts
import { Request, Response, NextFunction } from "express";
import { adminApiService, sharedApiService } from "../services";
import { User } from "../types/api";
import prisma from "../prisma";
import bcrypt from "bcryptjs"; // Import bcrypt for password hashing
import { generatePassword } from "../utils/helpers"; // We'll assume a helper for password generation

// A custom interface to add the 'user' property from your 'protect' middleware
interface AuthenticatedRequest extends Request {
  user?: { id: string; name: string; role: any; branchId: string | null };
}

export const getRegistrationRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const requests = await prisma.registrationRequest.findMany({
      orderBy: {
        submittedAt: "desc",
      },
    });
    res.status(200).json(requests);
  } catch (error) {
    next(error);
  }
};

// FIX: Implemented the complete business logic for approving a school request.
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

    const tempPassword = generatePassword(); // e.g., 'ab12cd34'
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
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

      await tx.registrationRequest.update({
        where: { id: requestId },
        data: { status: "approved" },
      });

      return { principalEmail: principalUser.email, tempPassword };
    });

    // In a real app, you would email these credentials. For now, we return them.
    res.status(200).json({
      message: `Request for ${request.schoolName} approved.`,
      credentials: {
        email: result.principalEmail,
        password: result.tempPassword,
      },
    });
  } catch (error) {
    next(error);
  }
};

// FIX: Implemented the complete business logic for denying a school request.
export const denyRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const request = await prisma.registrationRequest.update({
      where: { id: req.params.id },
      data: { status: "denied" },
    });
    res
      .status(200)
      .json({ message: `Request for ${request.schoolName} has been denied.` });
  } catch (error) {
    next(error);
  }
};


export const getBranches = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as "active" | undefined;
    const branches = await adminApiService.getBranches(status);
    res.status(200).json(branches);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateBranchStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    await adminApiService.updateBranchStatus(req.params.id, status);
    res.status(200).json({ message: `Branch status updated to ${status}.` });
  } catch (error: any) {
    res.status(404).json({ message: error.message });
  }
};

export const deleteBranch = async (req: Request, res: Response) => {
  try {
    await adminApiService.deleteBranch(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSchoolDetails = async (req: Request, res: Response) => {
  try {
    const details = await adminApiService.getSchoolDetails(req.params.id);
    res.status(200).json(details);
  } catch (error: any) {
    res.status(404).json({ message: error.message });
  }
};

export const updateBranchDetails = async (req: Request, res: Response) => {
  try {
    await adminApiService.updateBranchDetails(req.params.id, req.body);
    res.status(200).json({ message: "Branch details updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAdminDashboardData = async (req: Request, res: Response) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Authentication required." });
    const data = await adminApiService.getAdminDashboardData(req.user.role);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSystemWideFinancials = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const data = await adminApiService.getSystemWideFinancials(
      startDate as string,
      endDate as string
    );
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSystemWideAnalytics = async (req: Request, res: Response) => {
  try {
    const data = await adminApiService.getSystemWideAnalytics();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSystemWideInfrastructureData = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await adminApiService.getSystemWideInfrastructureData();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await adminApiService.getAllUsers();
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    const result = await sharedApiService.resetUserPassword(req.params.id);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(404).json({ message: error.message });
  }
};

export const getAdminCommunicationHistory = async (
  req: Request,
  res: Response
) => {
  try {
    const history = await adminApiService.getAdminCommunicationHistory();
    res.status(200).json(history);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const sendBulkSms = async (req: Request, res: Response) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Authentication required." });

    const users = await adminApiService.getAllUsers();
    const adminUser = users.find((u) => u.id === req.user!.id);

    if (!adminUser || !adminUser.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const { target, message } = req.body;
    await adminApiService.sendBulkSms(target, message, adminUser.name);
    res.status(200).json({ message: "Bulk SMS sent successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const sendBulkEmail = async (req: Request, res: Response) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Authentication required." });

    const users = await adminApiService.getAllUsers();
    const adminUser = users.find((u) => u.id === req.user!.id);

    if (!adminUser || !adminUser.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const { target, subject, body } = req.body;
    await adminApiService.sendBulkEmail(target, subject, body, adminUser.name);
    res.status(200).json({ message: "Bulk Email sent successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const sendBulkNotification = async (req: Request, res: Response) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Authentication required." });

    const users = await adminApiService.getAllUsers();
    const adminUser = users.find((u) => u.id === req.user!.id);

    if (!adminUser || !adminUser.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const { target, title, message } = req.body;
    await adminApiService.sendBulkNotification(
      target,
      title,
      message,
      adminUser.name
    );
    res.status(200).json({ message: "Bulk Notification sent successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSystemSettings = async (req: Request, res: Response) => {
  try {
    const settings = await adminApiService.getSystemSettings();
    res.status(200).json(settings);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSystemSettings = async (req: Request, res: Response) => {
  try {
    await adminApiService.updateSystemSettings(req.body);
    res.status(200).json({ message: "System settings updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getErpPayments = async (req: Request, res: Response) => {
  try {
    const payments = await adminApiService.getErpPayments();
    res.status(200).json(payments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const recordManualErpPayment = async (req: Request, res: Response) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Authentication required." });
    const { branchId, paymentDetails } = req.body;
    await adminApiService.recordManualErpPayment(
      branchId,
      paymentDetails,
      req.user.id
    );
    res.status(200).json({ message: "Manual ERP payment recorded." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSystemWideErpFinancials = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await adminApiService.getSystemWideErpFinancials();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const logs = await adminApiService.getAuditLogs();
    res.status(200).json(logs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPrincipalQueries = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as "Open" | "Resolved" | undefined;
    const queries = await adminApiService.getPrincipalQueries(status);
    res.status(200).json(queries);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resolvePrincipalQuery = async (req: Request, res: Response) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Authentication required." });
    const { adminNotes } = req.body;
    const query = await adminApiService.resolvePrincipalQuery(
      req.params.id,
      adminNotes,
      req.user.id
    );
    res.status(200).json(query);
  } catch (error: any) {
    res.status(404).json({ message: error.message });
  }
};

// Add this to src/controllers/adminController.ts

export const getSuperAdminContactDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // In a real app, you might have a more specific way to identify the primary contact.
    const superAdmin = await prisma.user.findFirst({ where: { role: 'SuperAdmin' } });
    
    if (!superAdmin) {
      return res.status(404).json({ message: "Super Admin contact details not found." });
    }

    const { passwordHash: _, ...contactDetails } = superAdmin;
    res.status(200).json(contactDetails);
  } catch (error) {
    next(error);
  }
};