// src/routes/admin.ts

import { Router } from "express";
import * as adminController from "../controllers/adminController";
import { protect } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";

const router = Router();

// This router is now protected and restricted ONLY to Admin
router.use(protect);
router.use(restrictTo("Admin", "SuperAdmin"));

// Admin routes (subset of SuperAdmin routes)
router.get("/dashboard", adminController.getAdminDashboardData);
router.get("/branches", adminController.getBranches);
router.get("/branches/:id/details", adminController.getSchoolDetails);
router.get("/registration-requests", adminController.getRegistrationRequests);
router.get("/users", adminController.getAllUsers);

router.post(
  "/registration-requests/:id/approve",
  adminController.approveRequest
);
router.post("/registration-requests/:id/deny", adminController.denyRequest);
router.patch("/branches/:id/status", adminController.updateBranchStatus);
router.patch("/branches/:id/details", adminController.updateBranchDetails);
router.get("/principal-queries", adminController.getPrincipalQueries);
router.post(
  "/principal-queries/:id/resolve",
  adminController.resolvePrincipalQuery
);

export default router;
