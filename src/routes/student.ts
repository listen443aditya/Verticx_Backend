import { Router } from "express";
import * as studentController from "../controllers/studentController";
import { protect, authorize } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";

const router = Router();

// 1. Apply Authentication (All routes require login)
router.use(protect);

// Fees
router.get(
  "/fees/record",
  studentController.getFeeRecordForStudent
);

router.post(
  "/fees/record-payment",
  studentController.recordFeePayment
);

router.post(
  "/pay-fees",
  studentController.payStudentFees
);

// ==================================================================
// STUDENT ONLY ROUTES
// ==================================================================

// Apply strict lock: Only Students can pass this line
router.use(restrictTo("Student"));

// Dashboard & Profile
router.get("/dashboard", studentController.getStudentDashboardData);
router.get("/profile", studentController.getStudentProfile);
router.patch("/profile", studentController.updateStudent);

// Academics
router.get("/attendance", studentController.getStudentAttendance);
router.get("/grades", studentController.getStudentGrades);
router.get("/course-content", studentController.getCourseContentForStudent);
router.get("/lectures", studentController.getLecturesForStudent);

// Self Study
router.get(
  "/self-study/progress",
  studentController.getStudentSelfStudyProgress
);
router.post(
  "/self-study/progress",
  studentController.updateStudentSelfStudyProgress
);

// Assignments
router.get("/assignments", studentController.getStudentAssignments);

// Quizzes
router.get(
  "/quizzes/available",
  studentController.getAvailableQuizzesForStudent
);
router.get("/quizzes/:id/attempt", studentController.getStudentQuizForAttempt);
router.post("/quizzes/:id/submit", studentController.submitStudentQuiz);

// Feedback & Complaints
router.get(
  "/feedback/history/:id",
  studentController.getStudentFeedbackHistory
);
router.post("/feedback/submit", studentController.submitTeacherFeedback);
router.get("/complaints/by-me", studentController.getComplaintsByStudent);
router.post("/complaints/submit", studentController.submitTeacherComplaint);
router.get("/complaints/about-me", studentController.getComplaintsAboutStudent);
router.put(
  "/complaints/:id/resolve",
  studentController.resolveStudentComplaint
);

// Misc
router.get("/leaves", studentController.getLeaveApplicationsForUser);
router.get("/library/search", studentController.searchLibraryBooks);
router.get(
  "/my-transport-details",
  studentController.getStudentTransportDetails
);
router.get("/my-hostel-details", studentController.getMyHostelDetails);

export default router;
