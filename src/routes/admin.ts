import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/roles';

const router = Router();

// All routes in this file are protected and restricted to 'Admin' or 'SuperAdmin'
router.use(protect);
router.use(restrictTo('Admin', 'SuperAdmin'));

// Registration Requests
router.get('/registration-requests', adminController.getRegistrationRequests);
router.post('/registration-requests/:id/approve', adminController.approveRequest);
router.post('/registration-requests/:id/deny', adminController.denyRequest);

// School/Branch Management
router.get('/branches', adminController.getBranches);
router.patch('/branches/:id/status', adminController.updateBranchStatus);
router.delete('/branches/:id', adminController.deleteBranch);
router.get('/branches/:id/details', adminController.getSchoolDetails);
router.patch('/branches/:id/details', adminController.updateBranchDetails);

// Dashboard & Analytics
router.get('/dashboard', adminController.getAdminDashboardData);
router.get('/financials', adminController.getSystemWideFinancials);
router.get('/analytics', adminController.getSystemWideAnalytics);
router.get('/infrastructure', adminController.getSystemWideInfrastructureData);

// User Management
router.get('/users', adminController.getAllUsers);
router.post('/users/:id/reset-password', adminController.resetUserPassword);

// Communication
router.get('/communication-history', adminController.getAdminCommunicationHistory);
router.post('/send-sms', adminController.sendBulkSms);
router.post('/send-email', adminController.sendBulkEmail);
router.post('/send-notification', adminController.sendBulkNotification);

// SuperAdmin / System Settings
router.get('/system-settings', restrictTo('SuperAdmin'), adminController.getSystemSettings);
router.put('/system-settings', restrictTo('SuperAdmin'), adminController.updateSystemSettings);
router.get('/erp-payments', restrictTo('SuperAdmin'), adminController.getErpPayments);
router.post('/erp-payments/manual', restrictTo('SuperAdmin'), adminController.recordManualErpPayment);
router.get('/erp-financials', restrictTo('SuperAdmin'), adminController.getSystemWideErpFinancials);
router.get('/audit-logs', restrictTo('SuperAdmin'), adminController.getAuditLogs);
router.get('/principal-queries', adminController.getPrincipalQueries);
router.post('/principal-queries/:id/resolve', adminController.resolvePrincipalQuery);

export default router;
