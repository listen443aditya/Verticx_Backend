import { Router } from "express";
import * as studentController from "../controllers/studentController";
import { protect } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";

const router = Router();


router.use(protect);
router.use(restrictTo("Student"));

// --- Dashboard & Profile ---
router.get("/dashboard", studentController.getStudentDashboardData);
router.get("/profile", studentController.getStudentProfile);
router.patch("/profile", studentController.updateStudent);

// --- Academics ---
router.get("/attendance", studentController.getStudentAttendance);
router.get("/grades", studentController.getStudentGrades);
router.get("/course-content", studentController.getCourseContentForStudent);
router.get("/lectures", studentController.getLecturesForStudent);

router.get(
  "/self-study/progress",
  studentController.getStudentSelfStudyProgress
);
router.post(
  "/self-study/progress",
  studentController.updateStudentSelfStudyProgress
);

router.get("/assignments", studentController.getStudentAssignments); 

// --- Quizzes---
router.get(
  "/quizzes/available",
  studentController.getAvailableQuizzesForStudent
); 
router.get("/quizzes/:id/attempt", studentController.getStudentQuizForAttempt);
router.post("/quizzes/:id/submit", studentController.submitStudentQuiz);

// --- Fees & Communication ---
router.get("/fees/record", studentController.getFeeRecordForStudent); 
router.post("/fees/record-payment", studentController.recordFeePayment); 
router.post("/pay-fees", studentController.payStudentFees); 

// --- Feedback & Complaints (FIXED) ---
router.get(
  "/feedback/history/:id",
  studentController.getStudentFeedbackHistory
); // Fixed URL
router.post("/feedback/submit", studentController.submitTeacherFeedback); 
router.get("/complaints/by-me", studentController.getComplaintsByStudent); 
router.post("/complaints/submit", studentController.submitTeacherComplaint); 
router.get("/complaints/about-me", studentController.getComplaintsAboutStudent); 
// Note: Frontend uses PUT, backend uses PATCH.
router.put(
  "/complaints/:id/resolve",
  studentController.resolveStudentComplaint
);

// --- Misc ---
router.get("/leaves", studentController.getLeaveApplicationsForUser); 
router.get("/library/search", studentController.searchLibraryBooks); 
router.get(
  "/my-transport-details",
  studentController.getStudentTransportDetails
); 

export default router;
