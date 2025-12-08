// backend/src/routes/teacherRoutes.ts
import { Router } from "express";
import * as teacherController from "../controllers/teacherController";
import { protect } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";
import upload from "../middlewares/upload"; // Make sure this path is correct

const router = Router();

router.use(protect);
router.use(restrictTo("Teacher"));

// Dashboard
router.get("/dashboard", teacherController.getTeacherDashboardData);

// Students
router.get("/students", teacherController.getStudentsForTeacher);
router.get("/classes/:classId/students", teacherController.getStudentsForClass);
router.get("/students/:studentId/profile", teacherController.getStudentProfile);
router.patch(
  "/students/:studentId/roll-number",
  teacherController.updateStudentRollNumber
);
// Courses & Syllabus
router.get("/courses", teacherController.getTeacherCourses);
router.get("/courses/by-branch", teacherController.getCoursesByBranch);
router.get("/courses/find", teacherController.findCourseByTeacherAndSubject);
router.get("/syllabus/lectures", teacherController.getLectures); // Matched frontend
router.post("/syllabus/lectures/save", teacherController.saveLectures);
router.put(
  "/syllabus/lectures/:lectureId/status", // Matched frontend
  teacherController.updateLectureStatus
);

// Course Content
router.get("/course-content", teacherController.getCourseContentForTeacher);
router.post(
  "/course-content/upload",
  upload.single("file"),
  teacherController.uploadCourseContent
);

// Attendance
router.get("/my-attendance", teacherController.getTeacherAttendance);
router.get(
  "/courses/:courseId/attendance",
  teacherController.getAttendanceForCourse
);
router.post("/courses/attendance", teacherController.saveAttendance); // Matched frontend

router.get("/my-mentored-class", teacherController.getMentoredClass);
router.get(
  "/classes/:classId/daily-attendance",
  teacherController.getDailyAttendance
);
router.post("/classes/daily-attendance", teacherController.saveDailyAttendance);

// Assignments
router.get("/assignments", teacherController.getAssignmentsByTeacher);
router.post("/assignments", teacherController.createAssignment);
router.put("/assignments/:assignmentId", teacherController.updateAssignment); // Matched frontend

// Gradebook
router.post("/gradebook/templates", teacherController.createMarkingTemplate);
router.get(
  "/courses/:courseId/gradebook/templates",
  teacherController.getMarkingTemplatesForCourse
);
router.get(
  "/gradebook/templates/:templateId/marks",
  teacherController.getStudentMarksForTemplate
);
router.post(
  "/gradebook/templates/:templateId/marks",
  teacherController.saveStudentMarks
);
router.delete(
  "/gradebook/templates/:templateId",
  teacherController.deleteMarkingTemplate
);
router.post("/courses/initialize", teacherController.initializeCourse);
// Quizzes
router.get("/quizzes", teacherController.getQuizzesForTeacher);
router.put("/quizzes/:quizId/status", teacherController.updateQuizStatus);
router.get("/quizzes/:quizId/details", teacherController.getQuizWithQuestions);
router.post("/quizzes/save", teacherController.saveQuiz);
router.get("/quizzes/:quizId/results", teacherController.getQuizResults);

// Examinations & Marks
router.get("/examinations", teacherController.getExaminations);
router.get(
  "/examinations/:examinationId/schedules", // Matched frontend
  teacherController.getHydratedExamSchedules
);
router.get(
  "/examinations/schedules/:scheduleId/marks", // Matched frontend
  teacherController.getExamMarksForSchedule
);
router.post("/examinations/marks/save", teacherController.saveExamMarks); // Matched frontend

// Requests (from teacher)
router.post(
  "/requests/rectification",
  teacherController.submitRectificationRequest
);
router.post(
  "/requests/syllabus-change",
  teacherController.submitSyllabusChangeRequest
);
router.post(
  "/requests/exam-mark",
  teacherController.submitExamMarkRectificationRequest
);


// Meetings & Availability
router.get("/meetings", teacherController.getMeetingRequestsForTeacher); // Matched frontend
router.put("/meetings/:requestId", teacherController.updateMeetingRequest); // Matched frontend
router.get("/availability", teacherController.getTeacherAvailability);

// Student Interaction
router.post(
  "/complaints/student",
  teacherController.raiseComplaintAboutStudent
);
router.get(
  "/students/:studentId/skill-assessment",
  teacherController.getTeacherSkillAssessmentForStudent
);
router.post(
  "/students/skill-assessment",
  teacherController.submitSkillAssessment
);

// Leave (for self and for students)
router.get(
  "/leaves/my-applications",
  teacherController.getLeaveApplicationsForUser
);
router.get(
  "/leaves/student-applications",
  teacherController.getLeaveApplicationsForTeacher
);
router.put(
  "/leaves/applications/:requestId/process",
  teacherController.processLeaveApplication
);

// General / Utility
router.get("/my-transport-details", teacherController.getMyTransportDetails);

export default router;
