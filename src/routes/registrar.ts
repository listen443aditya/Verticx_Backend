import { Router } from "express";
import * as registrarController from "../controllers/registrarController";
import { protect } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";

const router = Router();

// Apply security middleware to all registrar routes
router.use(protect);
router.use(restrictTo("Registrar"));

// --- Dashboard ---
router.get("/dashboard", registrarController.getRegistrarDashboardData);
router.get("/user-details/:userId", registrarController.getUserDetails);

// --- Admissions & Faculty Applications ---
// FIX: Consolidated to a single, clear route for admission applications
// router.get("/admissions/applications", registrarController.getApplications);
router.get(
  "/admissions/applications",
  registrarController.getUnifiedApplications
);


// FIX: Changed to PUT to match frontend and RESTful practices for status updates
router.put(
  "/admissions/applications/:id/status",
  registrarController.updateApplicationStatus
);

router.post("/admissions/admit-student", registrarController.admitStudent);
router.post(
  "/faculty/applications",
  registrarController.submitFacultyApplication
);
router.get(
  "/faculty/applications",
  registrarController.getFacultyApplicationsByBranch
);

// --- Student Information System (SIS) ---
router.get("/students", registrarController.getStudentsForBranch);
router.patch("/students/:id", registrarController.updateStudent); 
router.delete("/students/:id", registrarController.deleteStudent);
router.post("/students/promote", registrarController.promoteStudents);
router.post("/students/demote", registrarController.demoteStudents);
router.put("/students/:id/suspend", registrarController.suspendStudent); 
router.put("/students/:id/reinstate", registrarController.removeSuspension); 
router.post(
  "/students/:id/reset-passwords",
  registrarController.resetStudentAndParentPasswords
); 

// --- Academic Record Routes ---
router.get(
  "/attendance-records",
  registrarController.getAttendanceRecordsForBranch
);
router.get(
  "/suspension-records",
  registrarController.getSuspensionRecordsForBranch
);
router.get("/fee-records", registrarController.getFeeRecordsForBranch);

// --- Class, Subject & Timetable Management ---
router.get("/classes", registrarController.getSchoolClassesByBranch);
router.post("/classes", registrarController.createSchoolClass);
router.patch("/classes/:id", registrarController.updateSchoolClass); // FIX: Changed to PATCH
router.delete("/classes/:id", registrarController.deleteSchoolClass);
router.put("/classes/:id/subjects", registrarController.updateClassSubjects); 
router.post("/classes/:id/students", registrarController.assignStudentsToClass); 
router.delete(
  "/classes/:classId/students/:studentId",
  registrarController.removeStudentFromClass
); 
router.put("/classes/:id/assign-mentor", registrarController.assignClassMentor); 
router.put(
  "/classes/:id/assign-fee-template",
  registrarController.assignFeeTemplateToClass
); 
router.get("/subjects", registrarController.getSubjectsForBranch);
router.get(
  "/classes/:classId/timetable",
  registrarController.getTimetableForClass
);
router.get(
  "/classes/:classId/timetable-config",
  registrarController.getTimetableConfig
);
router.post(
  "/classes/:classId/timetable-config",
  registrarController.createTimetableConfig
); 
router.get(
  "/timetable/available-teachers",
  registrarController.getAvailableTeachersForSlot
); 
router.post("/timetable/slots", registrarController.setTimetableSlot); 
router.delete("/timetable/slots/:id", registrarController.deleteTimetableSlot); 
router.post("/subjects", registrarController.createSubject);
// router.post(
//   "/classes/:classId/timetable-config",
//   registrarController.createTimetableConfig
// );

router.get("/classes/:id", registrarController.getClassDetails);

router.put("/classes/:id/subjects", registrarController.updateClassSubjects);


// --- Faculty & Staff Management ---
router.get("/teachers", registrarController.getTeachersByBranch);
router.put("/teachers/:id", registrarController.updateTeacher); 
router.get("/staff/support", registrarController.getSupportStaffByBranch); 
router.post("/staff/support", registrarController.createSupportStaff); 
router.put("/staff/support/:id", registrarController.updateSupportStaff); 
router.delete("/staff/support/:id", registrarController.deleteSupportStaff); 
router.get("/staff/all", registrarController.getAllStaffForBranch);

// --- Academic & Leave Requests ---
router.get(
  "/requests/grade-attendance",
  registrarController.getTeacherAttendanceRequests
);
router.put(
  "/requests/grade-attendance/:id/process",
  registrarController.processRectificationRequest
); 
router.get(
  "/requests/syllabus",
  registrarController.getSyllabusChangeRequestsByBranch
);
router.put(
  "/requests/syllabus/:id/process",
  registrarController.processSyllabusChangeRequest
); 
router.get(
  "/requests/exam-marks",
  registrarController.getExamMarkRectificationRequestsByBranch
);
router.put(
  "/requests/exam-marks/:id/process",
  registrarController.processExamMarkRectificationRequest
); 
router.get(
  "/leaves/student-applications",
  registrarController.getStudentLeaveApplications
);
router.get("/leaves/settings", registrarController.getLeaveSettingsForBranch); 
router.put(
  "/leaves/settings",
  registrarController.updateLeaveSettingsForBranch
);
router.get(
  "/leaves/applications",
  registrarController.getLeaveApplicationsForRegistrar
); 
router.put(
  "/leaves/applications/:id/process",
  registrarController.processLeaveApplication
); 

// --- Fee Management ---
router.get("/fees/templates", registrarController.getFeeTemplates); 
router.post("/fees/templates", registrarController.createFeeTemplate); 
router.get("/fees/class-summaries", registrarController.getClassFeeSummaries);
router.post(
  "/fees/templates/:id/request-update",
  registrarController.requestFeeTemplateUpdate
);
router.post(
  "/fees/templates/:id/request-update",
  registrarController.requestFeeTemplateUpdate
); 
router.post(
  "/fees/templates/:id/request-delete",
  registrarController.requestFeeTemplateDeletion
); 
router.get(
  "/fees/classes/:classId/defaulters",
  registrarController.getDefaultersForClass
); 

// --- Attendance ---
router.get(
  "/classes/:classId/attendance",
  registrarController.getDailyAttendanceForClass
);
router.get("/staff/attendance", registrarController.getTeacherAttendance); 
router.post("/staff/attendance", registrarController.saveTeacherAttendance); 

// --- Infrastructure: Hostels & Transport ---
router.get("/hostels", registrarController.getHostels);
router.post("/hostels", registrarController.createHostel);
router.patch("/hostels/:id", registrarController.updateHostel);
router.delete("/hostels/:id", registrarController.deleteHostel);
router.get("/hostels/:id/rooms", registrarController.getRooms);
router.post(
  "/hostels/rooms/:roomId/assign-student",
  registrarController.assignStudentToRoom
); 
router.delete(
  "/hostels/rooms/remove-student/:studentId",
  registrarController.removeStudentFromRoom
); 

router.get("/transport/routes", registrarController.getTransportRoutes); 
router.post("/transport/routes", registrarController.createTransportRoute); 
router.put("/transport/routes/:id", registrarController.updateTransportRoute); 
router.delete(
  "/transport/routes/:id",
  registrarController.deleteTransportRoute
);
router.get(
  "/transport/unassigned-members",
  registrarController.getUnassignedMembers
);
router.post(
  "/transport/routes/:routeId/assign-member",
  registrarController.assignMemberToRoute
); 
router.delete(
  "/transport/routes/:routeId/remove-member/:memberId",
  registrarController.removeMemberFromRoute
); 

// --- Inventory ---
router.get("/inventory/items", registrarController.getInventory); 
router.get("/inventory/logs", registrarController.getInventoryLogs);
router.post("/inventory/items", registrarController.createInventoryItem); 
router.put("/inventory/items/:id", registrarController.updateInventoryItem); 
router.delete("/inventory/items/:id", registrarController.deleteInventoryItem); 

export default router;