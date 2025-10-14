// src/routes/principal.ts

import { Router } from "express";
import * as principalController from "../controllers/principalController";
import { protect } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";

const router = Router();

// All routes here are for authenticated Principals
router.use(protect);
router.use(restrictTo("Principal"));

// --- Dashboard & Profile ---
router.get("/dashboard", principalController.getPrincipalDashboardData);
router.get("/branch", principalController.getBranchDetails);
router.patch("/branch-details", principalController.updateBranchDetails);

// --- Faculty & Staff Management ---
router.get(
  "/faculty-applications",
  principalController.getFacultyApplicationsByBranch
);
router.post(
  "/faculty-applications/:id/approve",
  principalController.approveFacultyApplication
);
router.post(
  "/faculty-applications/:id/reject",
  principalController.rejectFacultyApplication
);
router.get("/staff", principalController.getFaculty);
router.post("/staff", principalController.createStaffMember);
router.patch("/staff/:id/suspend", principalController.suspendStaff);
router.patch("/staff/:id/reinstate", principalController.reinstateStaff);
router.delete("/staff/:id", principalController.deleteStaff);
router.get(
  "/teachers/:id/profile",
  principalController.getTeacherProfileDetails
);
router.patch("/teachers/:id", principalController.updateTeacher);

// --- Student Management ---
router.get("/students", principalController.getStudentsForPrincipal);

// --- THE NEW ROYAL ROADS ---
// The law is now written. The kingdom now knows these specific, branch-scoped paths.
router.get(
  "/branches/:branchId/teachers",
  principalController.getTeachersByBranch
);
router.get(
  "/branches/:branchId/students",
  principalController.getStudentsByBranch
);
router.get(
  "/branches/:branchId/fee-templates",
  principalController.getFeeTemplatesByBranch
);
// --- End of New Roads ---

// --- Academic Overview ---
router.get("/class-view", principalController.getPrincipalClassView);

// --- FIX: Add the /classes route the frontend is calling ---
router.get("/classes", principalController.getSchoolClassesForPrincipal);

router.get("/classes/:classId/details", principalController.getClassDetails);
router.patch("/classes/:classId/mentor", principalController.assignClassMentor);
router.patch(
  "/classes/:classId/fee-template",
  principalController.assignFeeTemplateToClass
);
router.get("/attendance-overview", principalController.getAttendanceOverview);
router.get(
  "/examinations",
  principalController.getExaminationsWithResultStatus
);
router.post(
  "/examinations/:id/publish",
  principalController.publishExaminationResults
);
router.get(
  "/examinations/:id/results",
  principalController.getStudentResultsForExamination
);
router.post("/examinations/:id/send-sms", principalController.sendResultsSms);

// --- Financials ---
router.get("/financials-overview", principalController.getFinancialsOverview);
router.post("/fee-adjustment", principalController.addFeeAdjustment);
router.get("/payroll/:month", principalController.getStaffPayrollForMonth);
router.post("/payroll/process", principalController.processPayroll);
router.post(
  "/salary-adjustment",
  principalController.addManualSalaryAdjustment
);
router.get("/erp-financials", principalController.getErpFinancialsForBranch);
router.get("/erp/payments", principalController.getErpPaymentsForBranch);
router.post("/erp-bill/pay", principalController.payErpBill);
router.get("/manual-expenses", principalController.getManualExpenses);
router.post("/manual-expenses", principalController.addManualExpense);

// --- Staff Requests ---
router.get(
  "/requests/fees",
  principalController.getFeeRectificationRequestsByBranch
);
router.post(
  "/requests/fees/:id/process",
  principalController.processFeeRectificationRequest
);
router.get(
  "/requests/attendance",
  principalController.getTeacherAttendanceRectificationRequestsByBranch
);
router.post(
  "/requests/attendance/:id/process",
  principalController.processTeacherAttendanceRectificationRequest
);
router.get(
  "/requests/leave",
  principalController.getLeaveApplicationsForPrincipal
);
router.post(
  "/requests/leave/:id/process",
  principalController.processLeaveApplication
);

// --- Grievances & Discipline ---
router.get("/complaints", principalController.getComplaintsForBranch);
router.post(
  "/complaints/student",
  principalController.raiseComplaintAboutStudent
);
router.get(
  "/complaints/student",
  principalController.getComplaintsAboutStudentsByBranch
);

// --- FIX: Change "/suspensions" to "/suspension-records" to match the frontend ---
router.get(
  "/suspension-records",
  principalController.getSuspensionRecordsForPrincipal
);

// --- Communication & Events ---
router.get("/announcements", principalController.getAnnouncements);
router.post("/announcements", principalController.sendAnnouncement);
router.get("/sms-history", principalController.getSmsHistory);
router.post("/sms/students", principalController.sendSmsToStudents);
router.get("/events", principalController.getSchoolEvents);
router.post("/events", principalController.createSchoolEvent);
router.patch("/events/:eventId", principalController.updateSchoolEvent);
router.delete("/events/:eventId", principalController.deleteSchoolEvent);
router.patch(
  "/events/:eventId/status",
  principalController.updateSchoolEventStatus
);

// --- Admin Communication ---
router.post("/queries/admin", principalController.raiseQueryToAdmin);
router.get("/queries", principalController.getQueriesByPrincipal);

// --- FIX: Add missing record routes ---
router.get("/fee-records", principalController.getFeeRecordsForPrincipal);
router.get(
  "/attendance-records",
  principalController.getAttendanceRecordsForPrincipal
);

export default router;
