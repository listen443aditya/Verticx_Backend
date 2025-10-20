import { Request, Response } from "express";
import { teacherApiService } from "../services/"; // Using the mock service

export const getTeacherDashboardData = async (req: Request, res: Response) => {
  try {
    // The user's token already contains everything we need.
    const teacherId = req.user?.id;
    const branchId = req.user?.branchId;

    // A user without a branchId cannot be a teacher in this context.
    if (!teacherId || !branchId) {
      return res
        .status(401)
        .json({
          message: "Unauthorized: Missing teacher or branch identifier.",
        });
    }

    // Pass BOTH identifiers to the service layer.
    const data = await teacherApiService.getTeacherDashboardData(
      teacherId,
      branchId
    );
    res.status(200).json(data);
  } catch (error: any) {
    // Add a log here to see the actual database error in your Vercel logs.
    console.error("Failed to get teacher dashboard:", error);
    res
      .status(500)
      .json({
        message: "An internal error occurred while fetching dashboard data.",
      });
  }
};

export const getTeacherTransportDetails = async (
  req: Request,
  res: Response
) => {
  try {
    const teacherId = req.user?.id;
    const branchId = req.user?.branchId;
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized." });
    }
    // You will need to implement this service function
    const details = await teacherApiService.getTransportDetailsForTeacher(
      teacherId,
      branchId
    );
    res.status(200).json(details);
  } catch (error: any) {
    console.error("Failed to get teacher transport details:", error);
    res.status(500).json({ message: "Failed to fetch transport details." });
  }
};

export const getStudentsForTeacher = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const students = await teacherApiService.getStudentsForTeacher(teacherId);
    res.status(200).json(students);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAssignmentsByTeacher = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const assignments = await teacherApiService.getAssignmentsByTeacher(
      teacherId
    );
    res.status(200).json(assignments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createAssignment = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const assignmentData = { ...req.body, teacherId };
    await teacherApiService.createAssignment(assignmentData);
    res.status(201).json({ message: "Assignment created successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAssignment = async (req: Request, res: Response) => {
  try {
    await teacherApiService.updateAssignment(req.params.id, req.body);
    res.status(200).json({ message: "Assignment updated successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTeacherAttendance = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const attendance = await teacherApiService.getTeacherAttendanceByTeacherId(
      teacherId
    );
    res.status(200).json(attendance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTeacherCourses = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const courses = await teacherApiService.getTeacherCourses(teacherId);
    res.status(200).json(courses);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAttendanceForCourse = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const data = await teacherApiService.getAttendanceForCourse(
      req.params.courseId,
      date as string
    );
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const saveAttendance = async (req: Request, res: Response) => {
  try {
    await teacherApiService.saveAttendance(req.body);
    res.status(200).json({ message: "Attendance saved successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitRectificationRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requestData = { ...req.body, teacherId };
    await teacherApiService.submitRectificationRequest(requestData);
    res.status(201).json({ message: "Rectification request submitted." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createMarkingTemplate = async (req: Request, res: Response) => {
  try {
    await teacherApiService.createMarkingTemplate(req.body);
    res.status(201).json({ message: "Marking template created." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getMarkingTemplatesForCourse = async (
  req: Request,
  res: Response
) => {
  try {
    const templates = await teacherApiService.getMarkingTemplatesForCourse(
      req.params.courseId
    );
    res.status(200).json(templates);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentMarksForTemplate = async (
  req: Request,
  res: Response
) => {
  try {
    const marks = await teacherApiService.getStudentMarksForTemplate(
      req.params.templateId
    );
    res.status(200).json(marks);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const saveStudentMarks = async (req: Request, res: Response) => {
  try {
    await teacherApiService.saveStudentMarks(req.params.templateId, req.body);
    res.status(200).json({ message: "Marks saved." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteMarkingTemplate = async (req: Request, res: Response) => {
  try {
    await teacherApiService.deleteMarkingTemplate(req.params.templateId);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getQuizzesForTeacher = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const quizzes = await teacherApiService.getQuizzesForTeacher(teacherId);
    res.status(200).json(quizzes);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getQuizWithQuestions = async (req: Request, res: Response) => {
  try {
    const data = await teacherApiService.getQuizWithQuestions(req.params.id);
    if (!data) return res.status(404).json({ message: "Quiz not found" });
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const saveQuiz = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { quizData, questionsData } = req.body;
    quizData.teacherId = teacherId;
    await teacherApiService.saveQuiz(quizData, questionsData);
    res.status(201).json({ message: "Quiz saved successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateQuizStatus = async (req: Request, res: Response) => {
  try {
    await teacherApiService.updateQuizStatus(req.params.id, req.body.status);
    res.status(200).json({ message: "Quiz status updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getQuizResults = async (req: Request, res: Response) => {
  try {
    const results = await teacherApiService.getQuizResults(req.params.id);
    res.status(200).json(results);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitSyllabusChangeRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requestData = { ...req.body, teacherId };
    await teacherApiService.submitSyllabusChangeRequest(requestData);
    res.status(201).json({ message: "Syllabus change request submitted." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getLectures = async (req: Request, res: Response) => {
  try {
    const { classId, subjectId } = req.params;
    const lectures = await teacherApiService.getLectures(classId, subjectId);
    res.status(200).json(lectures);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const saveLectures = async (req: Request, res: Response) => {
  try {
    const { user } = req;
    if (!user?.id || !user?.branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { classId, subjectId, lectures } = req.body;
    await teacherApiService.saveLectures(
      classId,
      subjectId,
      user.id,
      user.branchId,
      lectures
    );
    res.status(201).json({ message: "Lectures saved." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateLectureStatus = async (req: Request, res: Response) => {
  try {
    await teacherApiService.updateLectureStatus(req.params.id, req.body.status);
    res.status(200).json({ message: "Lecture status updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getCourseContentForTeacher = async (
  req: Request,
  res: Response
) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const content = await teacherApiService.getCourseContentForTeacher(
      teacherId
    );
    res.status(200).json(content);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getMeetingRequestsForTeacher = async (
  req: Request,
  res: Response
) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requests = await teacherApiService.getMeetingRequestsForTeacher(
      teacherId
    );
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateMeetingRequest = async (req: Request, res: Response) => {
  try {
    await teacherApiService.updateMeetingRequest(req.params.id, req.body);
    res.status(200).json({ message: "Meeting request updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTeacherAvailability = async (req: Request, res: Response) => {
  try {
    const { teacherId, date } = req.query;
    const availability = await teacherApiService.getTeacherAvailability(
      teacherId as string,
      date as string
    );
    res.status(200).json(availability);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const raiseComplaintAboutStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const { user } = req;
    if (!user?.id || !user?.branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const complaintData = {
      ...req.body,
      submittedBy: user.id,
      branchId: user.branchId,
    };
    await teacherApiService.raiseComplaintAboutStudent(complaintData);
    res.status(201).json({ message: "Complaint submitted." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getExaminations = async (req: Request, res: Response) => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const exams = await teacherApiService.getExaminations(branchId);
    res.status(200).json(exams);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getHydratedExamSchedules = async (req: Request, res: Response) => {
  try {
    const schedules = await teacherApiService.getHydratedExamSchedules(
      req.params.id
    );
    res.status(200).json(schedules);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getExamMarksForSchedule = async (req: Request, res: Response) => {
  try {
    const marks = await teacherApiService.getExamMarksForSchedule(
      req.params.id
    );
    res.status(200).json(marks);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const saveExamMarks = async (req: Request, res: Response) => {
  try {
    await teacherApiService.saveExamMarks(req.body);
    res.status(201).json({ message: "Exam marks saved." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitExamMarkRectificationRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const { user } = req;
    if (!user?.id || !user?.branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const requestData = { ...req.body, teacherId: user.id };
    await teacherApiService.submitExamMarkRectificationRequest(
      requestData,
      user.branchId
    );
    res
      .status(201)
      .json({ message: "Exam mark rectification request submitted." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTeacherSkillAssessmentForStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const assessment =
      await teacherApiService.getTeacherSkillAssessmentForStudent(
        teacherId,
        req.params.studentId
      );
    res.status(200).json(assessment);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitSkillAssessment = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const assessmentData = { ...req.body, teacherId };
    await teacherApiService.submitSkillAssessment(assessmentData);
    res.status(201).json({ message: "Skill assessment submitted." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getLeaveApplicationsForTeacher = async (
  req: Request,
  res: Response
) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const applications = await teacherApiService.getLeaveApplicationsForTeacher(
      teacherId
    );
    res.status(200).json(applications);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const processLeaveApplication = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { status } = req.body;
    await teacherApiService.processLeaveApplication(
      req.params.id,
      status,
      teacherId
    );
    res.status(200).json({ message: "Leave application processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const searchLibraryBooks = async (req: Request, res: Response) => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { q } = req.query;
    const books = await teacherApiService.searchLibraryBooks(
      branchId,
      q as string
    );
    res.status(200).json(books);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const getDashboardSchedule = async (req: Request, res: Response) => {
  try {
    const teacherId = req.user?.id;
    const branchId = req.user?.branchId;
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const data = await teacherApiService.getTeacherSchedule(teacherId, branchId);
    res.status(200).json(data);
  } catch (error: any) {
    console.error("Failed to get teacher schedule:", error);
    res.status(500).json({ message: "Failed to get schedule" });
  }
};

export const getDashboardAssignmentsToReview = async (
  req: Request,
  res: Response
) => {
  try {
    const teacherId = req.user?.id;
    const branchId = req.user?.branchId;
    if (!teacherId || !branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const data = await teacherApiService.getTeacherAssignmentsToReview(
      teacherId,
      branchId
    );
    res.status(200).json(data);
  } catch (error: any) {
    console.error("Failed to get assignment count:", error);
    res.status(500).json({ message: "Failed to get assignment count" });
  }
}