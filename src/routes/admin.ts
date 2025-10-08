// src/routes/admin.ts
import { Router } from "express";
import * as adminController from "../controllers/adminController";
import { protect } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";

const router = Router();

// This router now guards all paths for BOTH Admin and SuperAdmin.
router.use(protect);
router.use(restrictTo("Admin", "SuperAdmin")); // The law is amended. Both may pass.

// --- SHARED ADMIN & SUPERADMIN ROUTES ---
router.get("/dashboard", adminController.getAdminDashboardData);
router.get("/branches", adminController.getBranches);
router.get("/branches/:id/details", adminController.getSchoolDetails);
router.get("/registration-requests", adminController.getRegistrationRequests);
router.post(
  "/registration-requests/:id/approve",
  adminController.approveRequest
);
router.post("/registration-requests/:id/deny", adminController.denyRequest);
router.patch("/branches/:id/status", adminController.updateBranchStatus);
router.patch("/branches/:id/details", adminController.updateBranchDetails);
router.get("/users", adminController.getAllUsers);
router.post("/users/:id/reset-password", adminController.resetUserPassword);
router.get("/principal-queries", adminController.getPrincipalQueries);
router.post(
  "/principal-queries/:id/resolve",
  adminController.resolvePrincipalQuery
);
router.patch("/users/:id/assign-branch", adminController.assignBranchToUser);
// --- SUPERADMIN EXCLUSIVE ROUTES ---
// The 'restrictTo' middleware here adds a second, inner guard. Only a SuperAdmin can pass.
router.get(
  "/master-config",
  restrictTo("SuperAdmin"),
  adminController.getMasterConfig
);
router.put(
  "/master-config",
  restrictTo("SuperAdmin"),
  adminController.updateMasterConfig
);
router.get(
  "/financials",
  restrictTo("SuperAdmin"),
  adminController.getSystemWideFinancials
);
router.get(
  "/analytics",
  restrictTo("SuperAdmin"),
  adminController.getSystemWideAnalytics
);
router.get(
  "/infrastructure",
  restrictTo("SuperAdmin"),
  adminController.getSystemWideInfrastructureData
);
router.get(
  "/communication-history",
  restrictTo("SuperAdmin"),
  adminController.getAdminCommunicationHistory
);
router.post("/send-sms", restrictTo("SuperAdmin"), adminController.sendBulkSms);
router.post(
  "/send-email",
  restrictTo("SuperAdmin"),
  adminController.sendBulkEmail
);
router.post(
  "/send-notification",
  restrictTo("SuperAdmin"),
  adminController.sendBulkNotification
);
router.get(
  "/erp-payments",
  restrictTo("SuperAdmin"),
  adminController.getErpPayments
);
router.post(
  "/erp-payments/manual",
  restrictTo("SuperAdmin"),
  adminController.recordManualErpPayment
);
router.get(
  "/erp-financials",
  restrictTo("SuperAdmin"),
  adminController.getSystemWideErpFinancials
);
router.get(
  "/audit-logs",
  restrictTo("SuperAdmin"),
  adminController.getAuditLogs
);
router.get(
  "/contact-details",
  restrictTo("SuperAdmin","Admin","Principal","Librarian","Parent","Registrar","Student","Teacher"), // Correctly protected
  adminController.getSuperAdminContactDetails
);

export default router;
