import { Router } from 'express';
import * as parentController from '../controllers/parentController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/roles';

const router = Router();

router.use(protect);
router.use(restrictTo('Parent'));

// Dashboard & Child Data
router.get('/dashboard', parentController.getParentDashboardData);
router.get('/students/:id/profile', parentController.getStudentProfileDetails);
router.get('/students/:id/complaints', parentController.getComplaintsAboutStudent);
router.get('/students/:id/fee-history', parentController.getFeeHistoryForStudent);
router.get('/students/:id/teachers', parentController.getTeachersForStudent);
router.get('/students/:id/grades', parentController.getStudentGrades);
router.get('/students/:id/fee-record', parentController.getFeeRecordForStudent);


// Communication
router.get('/meeting-requests', parentController.getMeetingRequestsForParent);
router.post('/meeting-requests', parentController.createMeetingRequest);
router.patch('/meeting-requests/:id', parentController.updateMeetingRequest);
router.get('/teacher-availability', parentController.getTeacherAvailability);


// Financials
router.post('/record-payment', parentController.recordFeePayment);
router.post('/pay-fees', parentController.payStudentFees);


export default router;
