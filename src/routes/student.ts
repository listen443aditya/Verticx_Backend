import { Router } from 'express';
import * as studentController from '../controllers/studentController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/roles';

const router = Router();

// All routes here are for authenticated students
router.use(protect);
router.use(restrictTo('Student'));

// Dashboard & Profile
router.get('/dashboard', studentController.getStudentDashboardData);
router.get('/profile', studentController.getStudentProfile); // Same as dashboard, but could be different
router.patch('/profile', studentController.updateStudent);

// Academics
router.get('/attendance', studentController.getStudentAttendance);
router.get('/grades', studentController.getStudentGrades);
router.get('/course-content', studentController.getCourseContentForStudent);
router.get('/lectures', studentController.getLecturesForStudent);
router.get('/self-study-progress', studentController.getStudentSelfStudyProgress);
router.post('/self-study-progress', studentController.updateStudentSelfStudyProgress);


// Quizzes
router.get('/quizzes', studentController.getAvailableQuizzesForStudent);
router.get('/quizzes/:id/attempt', studentController.getStudentQuizForAttempt);
router.post('/quizzes/:id/submit', studentController.submitStudentQuiz);


// Fees & Communication
router.post('/pay-fees', studentController.payStudentFees);
router.post('/record-payment', studentController.recordFeePayment); // For online gateway callback
router.get('/fee-record', studentController.getFeeRecordForStudent);
router.get('/feedback-history', studentController.getStudentFeedbackHistory);
router.post('/feedback', studentController.submitTeacherFeedback);
router.get('/complaints', studentController.getComplaintsByStudent);
router.post('/complaints', studentController.submitTeacherComplaint);
router.get('/complaints/about-me', studentController.getComplaintsAboutStudent);
router.patch('/complaints/:id/resolve', studentController.resolveStudentComplaint);


// Misc
router.get('/leave-applications', studentController.getLeaveApplicationsForUser);
router.get('/library/search', studentController.searchLibraryBooks);
router.get(
  "/my-transport-details",
  studentController.getStudentTransportDetails
);


export default router;
