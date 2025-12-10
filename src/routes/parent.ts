import { Router } from 'express';
import * as parentController from '../controllers/parentController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/roles';

const router = Router();
router.use(protect);

router.post("/fees/record-payment", parentController.recordFeePayment);
router.post("/children/:id/fees/pay", parentController.payStudentFees);

router.use(restrictTo('Parent'));
// --- Dashboard & Child Data ---
router.get('/dashboard', parentController.getParentDashboardData);
router.get('/children/:id/profile', parentController.getStudentProfileDetails);
router.get('/children/:id/complaints', parentController.getComplaintsAboutStudent);
router.get('/children/:id/fees/history', parentController.getFeeHistoryForStudent);
router.get('/children/:id/teachers', parentController.getTeachersForStudent);
router.get('/children/:id/grades', parentController.getStudentGrades);
router.get('/children/:id/fees/record', parentController.getFeeRecordForStudent);

// --- Communication ---
router.get('/meetings', parentController.getMeetingRequestsForParent);
router.post('/meetings', parentController.createMeetingRequest);
router.put('/meetings/:id', parentController.updateMeetingRequest);
router.get('/teachers/:teacherId/availability', parentController.getTeacherAvailability);

// --- Financials ---

router.get('/branches/:branchId/events', parentController.getSchoolEventsForParent);

export default router;