// src/routes/principal.ts
import { Router } from 'express';
import * as principalController from '../controllers/principalController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/roles';

const router = Router();

// All routes here are for authenticated Principals
router.use(protect);
router.use(restrictTo('Principal'));

// Dashboard & Profile
router.get('/dashboard', principalController.getPrincipalDashboardData);
router.post('/profile/request-otp', principalController.requestProfileAccessOtp);
router.post('/profile/verify-otp', principalController.verifyProfileAccessOtp);
router.patch('/branch-details', principalController.updateBranchDetails);

// Faculty & Staff Management
router.get('/faculty-applications', principalController.getFacultyApplicationsByBranch);
router.post('/faculty-applications/:id/approve', principalController.approveFacultyApplication);
router.post('/faculty-applications/:id/reject', principalController.rejectFacultyApplication);
router.get("/staff", protect, principalController.getFaculty); // ✅ this endpoint must exist
router.post('/staff', principalController.createStaffMember);
router.patch('/staff/:id/suspend', principalController.suspendStaff);
router.patch('/staff/:id/reinstate', principalController.reinstateStaff);
router.delete('/staff/:id', principalController.deleteStaff);
router.get('/teachers/:id/profile', principalController.getTeacherProfileDetails);
router.patch('/teachers/:id', principalController.updateTeacher);

// Academic Overview
router.get('/class-view', principalController.getPrincipalClassView);
router.get('/attendance-overview', principalController.getAttendanceOverview);
router.get('/examinations', principalController.getExaminationsWithResultStatus);
router.post('/examinations/:id/publish', principalController.publishExaminationResults);
router.get('/examinations/:id/results', principalController.getStudentResultsForExamination);
router.post('/examinations/:id/send-sms', principalController.sendResultsSms);


// Financials
router.get('/financials-overview', principalController.getFinancialsOverview);
router.post('/fee-adjustment', principalController.addFeeAdjustment);
router.get('/payroll/:month', principalController.getStaffPayrollForMonth);
router.post('/payroll/process', principalController.processPayroll);
router.post('/salary-adjustment', principalController.addManualSalaryAdjustment);
router.get('/erp-financials', principalController.getErpFinancialsForBranch);
router.post('/erp-bill/pay', principalController.payErpBill);
router.get('/manual-expenses', principalController.getManualExpenses);
router.post('/manual-expenses', principalController.addManualExpense);
// Existing routes
router.get(
  "/erp/financials",
  protect,
  principalController.getErpFinancialsForBranch
);
router.post("/erp/pay", protect, principalController.payErpBill);

// Optional alias for frontend if it expects /erp/payments
router.get(
  "/erp/payments",
  protect,
  principalController.getErpFinancialsForBranch
);


// Staff Requests
router.get('/requests/fees', principalController.getFeeRectificationRequestsByBranch);
router.post('/requests/fees/:id/process', principalController.processFeeRectificationRequest);
router.get('/requests/attendance', principalController.getTeacherAttendanceRectificationRequestsByBranch);
router.post('/requests/attendance/:id/process', principalController.processTeacherAttendanceRectificationRequest);
router.get('/requests/leave', principalController.getLeaveApplicationsForPrincipal);
router.post('/requests/leave/:id/process', principalController.processLeaveApplication);

// Grievances & Discipline
router.post('/complaints/student', principalController.raiseComplaintAboutStudent);
router.get('/complaints/student', principalController.getComplaintsAboutStudentsByBranch);
router.get('/complaints/teacher', principalController.getComplaintsForBranch);
router.get('/suspensions', principalController.getSuspensionRecordsForBranch);

// Communication & Events
router.get('/announcements', principalController.getAnnouncements);
router.post('/announcements', principalController.sendAnnouncement);
router.get('/sms-history', principalController.getSmsHistory);
router.post('/sms/students', principalController.sendSmsToStudents);
router.delete('/announcements/clear', principalController.clearAnnouncementsHistory);
router.delete('/sms/clear', principalController.clearSmsHistory);
router.post('/events', principalController.createSchoolEvent);
router.patch('/events/:id', principalController.updateSchoolEvent);
router.patch('/events/:id/status', principalController.updateSchoolEventStatus);

// Admin Communication
router.post('/queries/admin', principalController.raiseQueryToAdmin);
router.get('/queries', principalController.getQueriesByPrincipal);

// System Actions
router.post('/new-session', principalController.startNewAcademicSession);
router.patch('/users/:id', principalController.updateUser);


export default router;
