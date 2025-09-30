// src/controllers/principalController.ts
import { Request, Response } from "express";
import { principalApiService } from "../services";

// This controller has been corrected to import the instantiated service
// and to perform necessary checks for `req.user` before using its properties.

export const getPrincipalDashboardData = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const data = await principalApiService.getPrincipalDashboardData(
      req.user.branchId
    );
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const requestProfileAccessOtp = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    await principalApiService.requestProfileAccessOtp(req.user.id);
    res
      .status(200)
      .json({ message: "OTP sent to your registered mobile number." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const verifyProfileAccessOtp = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { otp } = req.body;
    const isValid = await principalApiService.verifyProfileAccessOtp(
      req.user.id,
      otp
    );
    if (isValid) {
      res
        .status(200)
        .json({ success: true, message: "OTP verified successfully." });
    } else {
      res.status(401).json({ success: false, message: "Invalid OTP." });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateBranchDetails = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    await principalApiService.updateBranchDetails(req.user.branchId, req.body);
    res.status(200).json({ message: "Branch details updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFacultyApplicationsByBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const applications =
      await principalApiService.getFacultyApplicationsByBranch(
        req.user.branchId
      );
    res.status(200).json(applications);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const approveFacultyApplication = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { salary } = req.body;
    const credentials = await principalApiService.approveFacultyApplication(
      req.params.id,
      salary,
      req.user.id
    );
    res.status(200).json({ message: "Application approved.", credentials });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const rejectFacultyApplication = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    await principalApiService.rejectFacultyApplication(
      req.params.id,
      req.user.id
    );
    res.status(200).json({ message: "Application rejected." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStaffByBranch = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    res.status(200).json(staff);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createStaffMember = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const credentials = await principalApiService.createStaffMember(
      req.user.branchId,
      req.body
    );
    res.status(201).json({ message: "Staff member created.", credentials });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const suspendStaff = async (req: Request, res: Response) => {
  try {
    await principalApiService.suspendStaff(req.params.id);
    res.status(200).json({ message: "Staff suspended." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const reinstateStaff = async (req: Request, res: Response) => {
  try {
    await principalApiService.reinstateStaff(req.params.id);
    res.status(200).json({ message: "Staff reinstated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteStaff = async (req: Request, res: Response) => {
  try {
    await principalApiService.deleteStaff(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTeacherProfileDetails = async (req: Request, res: Response) => {
  try {
    const profile = await principalApiService.getTeacherProfileDetails(
      req.params.id
    );
    res.status(200).json(profile);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTeacher = async (req: Request, res: Response) => {
  try {
    await principalApiService.updateTeacher(req.params.id, req.body);
    res.status(200).json({ message: "Teacher profile updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPrincipalClassView = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const view = await principalApiService.getPrincipalClassView(
      req.user.branchId
    );
    res.status(200).json(view);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAttendanceOverview = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const overview = await principalApiService.getAttendanceOverview(
      req.user.branchId
    );
    res.status(200).json(overview);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getExaminationsWithResultStatus = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const exams = await principalApiService.getExaminationsWithResultStatus(
      req.user.branchId
    );
    res.status(200).json(exams);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const publishExaminationResults = async (
  req: Request,
  res: Response
) => {
  try {
    await principalApiService.publishExaminationResults(req.params.id);
    res.status(200).json({ message: "Results published." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentResultsForExamination = async (
  req: Request,
  res: Response
) => {
  try {
    const results = await principalApiService.getStudentResultsForExamination(
      req.params.id
    );
    res.status(200).json(results);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const sendResultsSms = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const { messageTemplate } = req.body;
    await principalApiService.sendResultsSms(
      req.params.id,
      messageTemplate,
      req.user.branchId
    );
    res.status(200).json({ message: "Results SMS sent." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFinancialsOverview = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const overview = await principalApiService.getFinancialsOverview(
      req.user.branchId
    );
    res.status(200).json(overview);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const addFeeAdjustment = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.branchId) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    const principal = staff.find((u) => u.id === req.user!.id);

    if (!principal || !principal.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const { studentId, type, amount, reason } = req.body;
    await principalApiService.addFeeAdjustment(
      studentId,
      type,
      amount,
      reason,
      principal.name
    );
    res.status(201).json({ message: "Fee adjustment added." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStaffPayrollForMonth = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const payroll = await principalApiService.getStaffPayrollForMonth(
      req.user.branchId,
      req.params.month
    );
    res.status(200).json(payroll);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const processPayroll = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.branchId) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    const principal = staff.find((u) => u.id === req.user!.id);

    if (!principal || !principal.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    await principalApiService.processPayroll(req.body, principal.name);
    res.status(200).json({ message: "Payroll processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const addManualSalaryAdjustment = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    const principal = staff.find((u) => u.id === req.user!.id);

    if (!principal || !principal.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const { staffId, amount, reason, month } = req.body;
    await principalApiService.addManualSalaryAdjustment(
      req.user.branchId,
      staffId,
      amount,
      reason,
      principal.name,
      month
    );
    res.status(201).json({ message: "Salary adjustment added." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getErpFinancialsForBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const financials = await principalApiService.getErpFinancialsForBranch(
      req.user.branchId
    );
    res.status(200).json(financials);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const payErpBill = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const { amount, transactionId } = req.body;
    await principalApiService.payErpBill(
      req.user.branchId,
      amount,
      transactionId
    );
    res.status(200).json({ message: "ERP bill paid." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getManualExpenses = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const expenses = await principalApiService.getManualExpenses(
      req.user.branchId
    );
    res.status(200).json(expenses);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const addManualExpense = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    const principal = staff.find((u) => u.id === req.user!.id);

    if (!principal || !principal.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const expenseData = {
      ...req.body,
      branchId: req.user.branchId,
      enteredBy: principal.name,
    };
    await principalApiService.addManualExpense(expenseData);
    res.status(201).json({ message: "Expense added." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFeeRectificationRequestsByBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const requests =
      await principalApiService.getFeeRectificationRequestsByBranch(
        req.user.branchId
      );
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const processFeeRectificationRequest = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { status } = req.body;
    await principalApiService.processFeeRectificationRequest(
      req.params.id,
      req.user.id,
      status
    );
    res.status(200).json({ message: "Request processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTeacherAttendanceRectificationRequestsByBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const requests =
      await principalApiService.getTeacherAttendanceRectificationRequestsByBranch(
        req.user.branchId
      );
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const processTeacherAttendanceRectificationRequest = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { status } = req.body;
    await principalApiService.processTeacherAttendanceRectificationRequest(
      req.params.id,
      req.user.id,
      status
    );
    res.status(200).json({ message: "Request processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getLeaveApplicationsForPrincipal = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const applications =
      await principalApiService.getLeaveApplicationsForPrincipal(
        req.user.branchId
      );
    res.status(200).json(applications);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const processLeaveApplication = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { status } = req.body;
    await principalApiService.processLeaveApplication(
      req.params.id,
      status,
      req.user.id
    );
    res.status(200).json({ message: "Leave application processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const raiseComplaintAboutStudent = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    const principal = staff.find((u) => u.id === req.user!.id);

    if (!principal || !principal.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const complaintData = {
      ...req.body,
      raisedById: req.user.id,
      raisedByName: principal.name,
      raisedByRole: "Principal",
      branchId: req.user.branchId,
    };
    await principalApiService.raiseComplaintAboutStudent(complaintData);
    res.status(201).json({ message: "Complaint raised." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getComplaintsAboutStudentsByBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const complaints =
      await principalApiService.getComplaintsAboutStudentsByBranch(
        req.user.branchId
      );
    res.status(200).json(complaints);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getComplaintsForBranch = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const complaints = await principalApiService.getComplaintsForBranch(
      req.user.branchId
    );
    res.status(200).json(complaints);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSuspensionRecordsForBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const records = await principalApiService.getSuspensionRecordsForBranch(
      req.user.branchId
    );
    res.status(200).json(records);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAnnouncements = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const announcements = await principalApiService.getAnnouncements(
      req.user.branchId
    );
    res.status(200).json(announcements);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const sendAnnouncement = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    await principalApiService.sendAnnouncement(req.user.branchId, req.body);
    res.status(201).json({ message: "Announcement sent." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSmsHistory = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const history = await principalApiService.getSmsHistory(req.user.branchId);
    res.status(200).json(history);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const sendSmsToStudents = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    const principal = staff.find((u) => u.id === req.user!.id);

    if (!principal || !principal.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const { studentIds, message } = req.body;
    const result = await principalApiService.sendSmsToStudents(
      studentIds,
      message,
      principal.name,
      req.user.branchId
    );
    res.status(200).json({ message: `SMS sent to ${result.count} students.` });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const clearAnnouncementsHistory = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const { fromDate, toDate } = req.body;
    await principalApiService.clearAnnouncementsHistory(
      req.user.branchId,
      fromDate,
      toDate
    );
    res.status(200).json({ message: "History cleared." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const clearSmsHistory = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const { fromDate, toDate } = req.body;
    await principalApiService.clearSmsHistory(
      req.user.branchId,
      fromDate,
      toDate
    );
    res.status(200).json({ message: "History cleared." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createSchoolEvent = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    const principal = staff.find((u) => u.id === req.user!.id);

    if (!principal || !principal.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const eventData = {
      ...req.body,
      branchId: req.user.branchId,
      createdBy: principal.name,
    };
    await principalApiService.createSchoolEvent(eventData);
    res.status(201).json({ message: "Event created." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSchoolEvent = async (req: Request, res: Response) => {
  try {
    await principalApiService.updateSchoolEvent(req.params.id, req.body);
    res.status(200).json({ message: "Event updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSchoolEventStatus = async (req: Request, res: Response) => {
  try {
    await principalApiService.updateSchoolEventStatus(
      req.params.id,
      req.body.status
    );
    res.status(200).json({ message: "Event status updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const raiseQueryToAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    const principal = staff.find((u) => u.id === req.user!.id);

    if (!principal || !principal.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const queryData = {
      ...req.body,
      principalId: req.user.id,
      principalName: principal.name,
      branchId: req.user.branchId,
    };
    const newQuery = await principalApiService.raiseQueryToAdmin(queryData);
    res.status(201).json(newQuery);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getQueriesByPrincipal = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const queries = await principalApiService.getQueriesByPrincipal(
      req.user.id
    );
    res.status(200).json(queries);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const startNewAcademicSession = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const { newStartDate } = req.body;
    await principalApiService.startNewAcademicSession(
      req.user.branchId,
      newStartDate
    );
    res.status(200).json({ message: "New academic session started." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    await principalApiService.updateUser(req.params.id, req.body);
    res.status(200).json({ message: "User updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
