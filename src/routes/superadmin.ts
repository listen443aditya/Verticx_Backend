// import { Router } from "express";
// import * as adminController from "../controllers/adminController";
// import { protect } from "../middlewares/auth";
// import { restrictTo } from "../middlewares/roles";
// import * as superAdminController from "../controllers/superAdminController"; 
// const router = Router();

// // This entire router is a fortress, protected by authentication
// // and restricted ONLY to the hand of the SuperAdmin.
// router.use(protect);
// router.use(restrictTo("SuperAdmin"));

// // --- Dashboard & System-Wide Oversight ---
// router.get("/dashboard", adminController.getAdminDashboardData);
// router.get("/branches", adminController.getBranches);
// router.get("/branches/:id/details", adminController.getSchoolDetails);
// router.get("/registration-requests", adminController.getRegistrationRequests);
// router.get("/users", adminController.getAllUsers);
// router.get("/financials", adminController.getSystemWideFinancials);
// router.get("/analytics", adminController.getSystemWideAnalytics);
// router.get("/infrastructure", adminController.getSystemWideInfrastructureData);
// router.get("/audit-logs", adminController.getAuditLogs);
// router.get("/principal-queries", adminController.getPrincipalQueries);
// router.get("/contact-details", adminController.getSuperAdminContactDetails);

// // --- Master Configuration: The One True Path ---
// router.get("/master-config", superAdminController.getMasterConfig);
// router.put("/master-config", superAdminController.updateMasterConfig);

// // --- Actions & Mutations ---
// router.post(
//   "/registration-requests/:id/approve",
//   adminController.approveRequest
// );
// router.post("/registration-requests/:id/deny", adminController.denyRequest);
// router.patch("/branches/:id/status", adminController.updateBranchStatus);
// router.delete("/branches/:id", adminController.deleteBranch);
// router.patch("/branches/:id/details", adminController.updateBranchDetails);
// router.post("/users/:id/reset-password", adminController.resetUserPassword);
// router.post(
//   "/principal-queries/:id/resolve",
//   adminController.resolvePrincipalQuery
// );

// // --- Communication ---
// router.get(
//   "/communication-history",
//   adminController.getAdminCommunicationHistory
// );
// router.post("/send-sms", adminController.sendBulkSms);
// router.post("/send-email", adminController.sendBulkEmail);
// router.post("/send-notification", adminController.sendBulkNotification);

// // --- ERP Billing ---
// router.get("/erp-payments", adminController.getErpPayments);
// router.post("/erp-payments/manual", adminController.recordManualErpPayment);
// router.get("/erp-financials", adminController.getSystemWideErpFinancials);

// export default router;




// src/routes/superadmin.ts
import { Router } from "express";
import * as adminController from "../controllers/adminController";
import { protect } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";

const router = Router();

// This router now guards all paths for BOTH Admin and SuperAdmin.
router.use(protect);
router.use(restrictTo("SuperAdmin", "Admin")); // The law is amended. Both may pass.

// --- ALL SHARED ROUTES ---
router.get("/dashboard", adminController.getAdminDashboardData);
router.get("/branches", adminController.getBranches);
router.get("/branches/:id/details", adminController.getSchoolDetails);
router.get("/registration-requests", adminController.getRegistrationRequests);
router.post("/registration-requests/:id/approve", adminController.approveRequest);
router.post("/registration-requests/:id/deny", adminController.denyRequest);
router.patch("/branches/:id/status", adminController.updateBranchStatus);
router.patch("/branches/:id/details", adminController.updateBranchDetails);
router.get("/users", adminController.getAllUsers);
router.post("/users/:id/reset-password", adminController.resetUserPassword);
router.get("/principal-queries", adminController.getPrincipalQueries);
router.post("/principal-queries/:id/resolve", adminController.resolvePrincipalQuery);

// --- SUPERADMIN EXCLUSIVE ROUTES ---
// The 'restrictTo' middleware here adds a second layer of protection.
router.get("/master-config", restrictTo('SuperAdmin'), adminController.getMasterConfig);
router.put("/master-config", restrictTo('SuperAdmin'), adminController.updateMasterConfig);
router.get("/financials", restrictTo('SuperAdmin'), adminController.getSystemWideFinancials);
router.get("/analytics", restrictTo('SuperAdmin'), adminController.getSystemWideAnalytics);
router.get("/infrastructure", restrictTo('SuperAdmin'), adminController.getSystemWideInfrastructureData);
router.get("/communication-history", restrictTo('SuperAdmin'), adminController.getAdminCommunicationHistory);
router.post("/send-sms", restrictTo('SuperAdmin'), adminController.sendBulkSms);
router.post("/send-email", restrictTo('SuperAdmin'), adminController.sendBulkEmail);
router.post("/send-notification", restrictTo('SuperAdmin'), adminController.sendBulkNotification);
router.get("/erp-payments", restrictTo('SuperAdmin'), adminController.getErpPayments);
router.post("/erp-payments/manual", restrictTo('SuperAdmin'), adminController.recordManualErpPayment);
router.get("/erp-financials", restrictTo('SuperAdmin'), adminController.getSystemWideErpFinancials);
router.get("/audit-logs", restrictTo('SuperAdmin'), adminController.getAuditLogs);
router.get("/contact-details", restrictTo('SuperAdmin'), adminController.getSuperAdminContactDetails);

export default router;