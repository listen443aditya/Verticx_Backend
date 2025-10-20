import { Request, Response } from "express";
import { studentApiService } from "../services/";

export const getStudentDashboardData = async (req: Request, res: Response) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const data = await studentApiService.getStudentDashboardData(studentId);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentProfile = async (req: Request, res: Response) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const profile = await studentApiService.getStudentProfileDetails(studentId);
    res.status(200).json(profile);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    await studentApiService.updateStudent(studentId, req.body);
    res.status(200).json({ message: "Profile updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const recordFeePayment = async (req: Request, res: Response) => {
  try {
    await studentApiService.recordFeePayment(req.body);
    res.status(200).json({ message: "Payment recorded successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const payStudentFees = async (req: Request, res: Response) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { amount, details } = req.body;
    await studentApiService.payStudentFees(studentId, amount, details);
    res.status(200).json({ message: "Fee paid successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentAttendance = async (req: Request, res: Response) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const attendance = await studentApiService.getStudentAttendance(studentId);
    res.status(200).json(attendance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getLeaveApplicationsForUser = async (
  req: Request,
  res: Response
) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const applications = await studentApiService.getLeaveApplicationsForUser(
      studentId
    );
    res.status(200).json(applications);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentGrades = async (req: Request, res: Response) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const grades = await studentApiService.getStudentGrades(studentId);
    res.status(200).json(grades);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getCourseContentForStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const content = await studentApiService.getCourseContentForStudent(
      studentId
    );
    res.status(200).json(content);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAvailableQuizzesForStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const quizzes = await studentApiService.getAvailableQuizzesForStudent(
      studentId
    );
    res.status(200).json(quizzes);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentQuizForAttempt = async (req: Request, res: Response) => {
  try {
    const data = await studentApiService.getStudentQuizForAttempt(
      req.params.id
    );
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitStudentQuiz = async (req: Request, res: Response) => {
  try {
    const { answers } = req.body;
    await studentApiService.submitStudentQuiz(req.params.id, answers);
    res.status(200).json({ message: "Quiz submitted successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getLecturesForStudent = async (req: Request, res: Response) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const lectures = await studentApiService.getLecturesForStudent(studentId);
    res.status(200).json(lectures);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentFeedbackHistory = async (
  req: Request,
  res: Response
) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const history = await studentApiService.getStudentFeedbackHistory(
      studentId
    );
    res.status(200).json(history);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitTeacherFeedback = async (req: Request, res: Response) => {
  try {
    // ✨ FIX: Add a guard clause to ensure user and id exist
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const feedbackData = { ...req.body, studentId: req.user.id };
    await studentApiService.submitTeacherFeedback(feedbackData);
    res.status(201).json({ message: "Feedback submitted." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getComplaintsByStudent = async (req: Request, res: Response) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const complaints = await studentApiService.getComplaintsByStudent(
      studentId
    );
    res.status(200).json(complaints);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resolveStudentComplaint = async (req: Request, res: Response) => {
  try {
    await studentApiService.resolveStudentComplaint(req.params.id);
    res.status(200).json({ message: "Complaint resolved." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getComplaintsAboutStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const studentId = req.user?.id;
    // ✨ FIX: Add a guard clause to ensure studentId exists
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const complaints = await studentApiService.getComplaintsAboutStudent(
      studentId
    );
    res.status(200).json(complaints);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitTeacherComplaint = async (req: Request, res: Response) => {
  try {
    // ✨ FIX: Add a guard clause to ensure user and id exist
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const complaintData = {
      ...req.body,
      studentId: req.user.id,
      status: "Open",
    };
    await studentApiService.submitTeacherComplaint(complaintData);
    res.status(201).json({ message: "Complaint submitted successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const searchLibraryBooks = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    // ✨ FIX: Add a guard clause to ensure user and branchId exist
    if (!req.user?.branchId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const books = await studentApiService.searchLibraryBooks(
      req.user.branchId,
      q as string
    );
    res.status(200).json(books);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFeeRecordForStudent = async (req: Request, res: Response) => {
  try {
    // ✨ FIX: Add a guard clause to ensure user and id exist
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const record = await studentApiService.getFeeRecordForStudent(req.user.id);
    res.status(200).json(record);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentSelfStudyProgress = async (
  req: Request,
  res: Response
) => {
  try {
    // ✨ FIX: Add a guard clause to ensure user and id exist
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const progress = await studentApiService.getStudentSelfStudyProgress(
      req.user.id
    );
    res.status(200).json(progress);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getStudentTransportDetails = async (
  req: Request,
  res: Response
) => {
  try {
    const studentId = req.user?.id; // Get ID from the token
    const branchId = req.user?.branchId;

    if (!studentId || !branchId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    // You will need to create this service function,
    // it will be almost identical to getTransportDetailsForTeacher
    const details = await studentApiService.getTransportDetailsForStudent(
      studentId,
      branchId
    );

    res.status(200).json(details);
  } catch (error: any) {
    console.error("Failed to get student transport details:", error);
    res.status(500).json({ message: "Failed to fetch transport details." });
  }
};
export const updateStudentSelfStudyProgress = async (
  req: Request,
  res: Response
) => {
  try {
    // ✨ FIX: Add a guard clause to ensure user and id exist
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { lectureId, isCompleted } = req.body;
    await studentApiService.updateStudentSelfStudyProgress(
      req.user.id,
      lectureId,
      isCompleted
    );
    res.status(200).json({ message: "Progress updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
