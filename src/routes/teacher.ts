import { Router } from 'express';
import * as teacherController from '../controllers/teacherController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/roles';

const router = Router();

// All routes in this file are protected and restricted to 'Teacher'
router.use(protect);
router.use(restrictTo('Teacher'));

// Dashboard
router.get('/dashboard', teacherController.getTeacherDashboardData);

// Students & Assignments
router.get('/students', teacherController.getStudentsForTeacher);
router.get('/assignments', teacherController.getAssignmentsByTeacher);
router.post('/assignments', teacherController.createAssignment);
router.patch('/assignments/:id', teacherController.updateAssignment);

// Attendance
router.get('/attendance', teacherController.getTeacherAttendance);
router.get('/courses/:courseId/attendance', teacherController.getAttendanceForCourse);
router.post('/attendance', teacherController.saveAttendance);
router.post('/rectification-request', teacherController.submitRectificationRequest);


// Gradebook & Quizzes
router.get('/courses', teacherController.getTeacherCourses);
router.post('/marking-templates', teacherController.createMarkingTemplate);
router.get('/courses/:courseId/marking-templates', teacherController.getMarkingTemplatesForCourse);
router.get('/marking-templates/:templateId/marks', teacherController.getStudentMarksForTemplate);
router.post('/marking-templates/:templateId/marks', teacherController.saveStudentMarks);
router.delete('/marking-templates/:templateId', teacherController.deleteMarkingTemplate);
router.get('/quizzes', teacherController.getQuizzesForTeacher);
router.get('/quizzes/:id', teacherController.getQuizWithQuestions);
router.post('/quizzes', teacherController.saveQuiz);
router.patch('/quizzes/:id/status', teacherController.updateQuizStatus);
router.get('/quizzes/:id/results', teacherController.getQuizResults);

// Syllabus & Content
router.post('/syllabus-change-request', teacherController.submitSyllabusChangeRequest);
router.get('/classes/:classId/subjects/:subjectId/lectures', teacherController.getLectures);
router.post('/lectures', teacherController.saveLectures);
router.patch('/lectures/:id/status', teacherController.updateLectureStatus);
router.get('/course-content', teacherController.getCourseContentForTeacher);
// Note: File uploads require `multer` or similar middleware, which is a next step.
// router.post('/course-content', teacherController.uploadCourseContent);

// Communication & Grievances
router.get('/meeting-requests', teacherController.getMeetingRequestsForTeacher);
router.patch('/meeting-requests/:id', teacherController.updateMeetingRequest);
router.get('/availability', teacherController.getTeacherAvailability);
router.post('/complaints/student', teacherController.raiseComplaintAboutStudent);


// Exams & Skills
router.get('/examinations', teacherController.getExaminations);
router.get('/examinations/:id/schedules', teacherController.getHydratedExamSchedules);
router.get('/schedules/:id/marks', teacherController.getExamMarksForSchedule);
router.post('/exam-marks', teacherController.saveExamMarks);
router.post('/exam-mark-rectification', teacherController.submitExamMarkRectificationRequest);
router.get('/students/:studentId/skill-assessment', teacherController.getTeacherSkillAssessmentForStudent);
router.post('/skill-assessment', teacherController.submitSkillAssessment);

// General
router.get('/leave-applications', teacherController.getLeaveApplicationsForTeacher);
router.post('/leave-applications/:id/process', teacherController.processLeaveApplication);
router.get('/library/search', teacherController.searchLibraryBooks);


export default router;
