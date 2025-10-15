import { Router } from 'express';
import * as registrarController from '../controllers/registrarController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/roles';

const router = Router();

router.use(protect);
router.use(restrictTo('Registrar'));

// Dashboard
router.get('/dashboard', registrarController.getRegistrarDashboardData);
router.get("/user-details/:userId", registrarController.getUserDetails);
// Admissions
router.get('/applications', registrarController.getApplications);
router.get("/admissions/applications", registrarController.getApplications);
router.patch('/applications/:id/status', registrarController.updateApplicationStatus);
router.post('/admit-student', registrarController.admitStudent);
router.post('/faculty-application', registrarController.submitFacultyApplication);
router.get('/faculty-applications', registrarController.getFacultyApplicationsByBranch);


// Student & Class Management
router.post('/students/promote', registrarController.promoteStudents);
router.post('/students/demote', registrarController.demoteStudents);
router.delete('/students/:id', registrarController.deleteStudent);
router.patch('/students/:id/suspend', registrarController.suspendStudent);
router.patch('/students/:id/remove-suspension', registrarController.removeSuspension);
router.patch('/students/:id', registrarController.updateStudent);
router.post('/students/:id/reset-password', registrarController.resetStudentAndParentPasswords);
router.get("/subjects", registrarController.getSubjectsForBranch);

router.get('/classes', registrarController.getSchoolClassesByBranch);
router.post('/classes', registrarController.createSchoolClass);
router.patch('/classes/:id', registrarController.updateSchoolClass);
router.delete('/classes/:id', registrarController.deleteSchoolClass);
router.patch('/classes/:id/subjects', registrarController.updateClassSubjects);
router.post('/classes/:id/assign-students', registrarController.assignStudentsToClass);
router.post('/classes/:classId/remove-student/:studentId', registrarController.removeStudentFromClass);
router.patch('/classes/:id/assign-mentor', registrarController.assignClassMentor);
router.patch('/classes/:id/assign-fee-template', registrarController.assignFeeTemplateToClass);

router.get("/students", registrarController.getStudentsForBranch);
router.get(
  "/attendance-records",
  registrarController.getAttendanceRecordsForBranch
);
router.get(
  "/suspension-records",
  registrarController.getSuspensionRecordsForBranch
);
router.get("/fee-records", registrarController.getFeeRecordsForBranch);

// Faculty Management
router.get('/teachers', registrarController.getTeachersByBranch);
router.patch('/teachers/:id', registrarController.updateTeacher);
router.get('/support-staff', registrarController.getSupportStaffByBranch);
router.post('/support-staff', registrarController.createSupportStaff);
router.patch('/support-staff/:id', registrarController.updateSupportStaff);
router.delete('/support-staff/:id', registrarController.deleteSupportStaff);


// Academic Requests
router.get('/requests/rectification', registrarController.getRectificationRequestsByBranch);
router.patch('/requests/rectification/:id/process', registrarController.processRectificationRequest);
router.get('/requests/syllabus', registrarController.getSyllabusChangeRequestsByBranch);
router.patch('/requests/syllabus/:id/process', registrarController.processSyllabusChangeRequest);
router.get('/requests/exam-marks', registrarController.getExamMarkRectificationRequestsByBranch);
router.patch('/requests/exam-marks/:id/process', registrarController.processExamMarkRectificationRequest);
router.get(
  "/requests/grade-attendance",
  registrarController.getTeacherAttendanceRequests
);


// Fees
router.get('/fee-templates', registrarController.getFeeTemplates);
router.post('/fee-templates', registrarController.createFeeTemplate);
router.post('/fee-templates/request-update', registrarController.requestFeeTemplateUpdate);
router.post('/fee-templates/request-delete', registrarController.requestFeeTemplateDeletion);
router.get('/classes/:classId/defaulters', registrarController.getDefaultersForClass);

// Timetable
router.get('/classes/:classId/timetable-config', registrarController.getTimetableConfig);
router.post('/timetable-config', registrarController.createTimetableConfig);
router.get('/available-teachers', registrarController.getAvailableTeachersForSlot);
router.post('/timetable-slot', registrarController.setTimetableSlot);
router.delete('/timetable-slot/:id', registrarController.deleteTimetableSlot);
router.get('/classes/:classId/timetable', registrarController.getTimetableForClass);

// Attendance
router.get('/classes/:classId/attendance', registrarController.getDailyAttendanceForClass);
router.get('/staff-attendance', registrarController.getTeacherAttendance);
router.post('/staff-attendance', registrarController.saveTeacherAttendance);

// Leave Management
router.get('/leave-settings', registrarController.getLeaveSettingsForBranch);
router.put('/leave-settings', registrarController.updateLeaveSettingsForBranch);
router.get('/leave-applications', registrarController.getLeaveApplicationsForRegistrar);
router.patch('/leave-applications/:id/process', registrarController.processLeaveApplication);
router.get(
  "/leaves/student-applications",
  registrarController.getStudentLeaveApplications
);


// Infrastructure
router.get('/hostels', registrarController.getHostels);
router.post('/hostels', registrarController.createHostel);
router.patch('/hostels/:id', registrarController.updateHostel);
router.delete('/hostels/:id', registrarController.deleteHostel);
router.get('/hostels/:id/rooms', registrarController.getRooms);
router.post('/rooms/:roomId/assign-student', registrarController.assignStudentToRoom);
router.post('/students/:studentId/remove-from-room', registrarController.removeStudentFromRoom);

router.get('/transport', registrarController.getTransportRoutes);
router.post('/transport', registrarController.createTransportRoute);
router.patch('/transport/:id', registrarController.updateTransportRoute);
router.delete('/transport/:id', registrarController.deleteTransportRoute);
router.get('/transport/unassigned-members', registrarController.getUnassignedMembers);
router.post('/transport/assign-member', registrarController.assignMemberToRoute);
router.post('/transport/remove-member', registrarController.removeMemberFromRoute);

router.get('/inventory', registrarController.getInventory);
router.get('/inventory-logs', registrarController.getInventoryLogs);
router.post('/inventory', registrarController.createInventoryItem);
router.patch('/inventory/:id', registrarController.updateInventoryItem);
router.delete('/inventory/:id', registrarController.deleteInventoryItem);


export default router;
