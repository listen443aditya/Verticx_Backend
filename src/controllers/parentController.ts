// src/controllers/parentController.ts
import { Request, Response } from "express";
import { parentApiService } from "../services";

export const getParentDashboardData = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const data = await parentApiService.getParentDashboardData(req.user.id);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentProfileDetails = async (req: Request, res: Response) => {
  try {
    const profile = await parentApiService.getStudentProfileDetails(
      req.params.id
    );
    res.status(200).json(profile);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getComplaintsAboutStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const complaints = await parentApiService.getComplaintsAboutStudent(
      req.params.id
    );
    res.status(200).json(complaints);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFeeHistoryForStudent = async (req: Request, res: Response) => {
  try {
    const history = await parentApiService.getFeeHistoryForStudent(
      req.params.id
    );
    res.status(200).json(history);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTeachersForStudent = async (req: Request, res: Response) => {
  try {
    const teachers = await parentApiService.getTeachersForStudent(
      req.params.id
    );
    res.status(200).json(teachers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getMeetingRequestsForParent = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const requests = await parentApiService.getMeetingRequestsForParent(
      req.user.id
    );
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createMeetingRequest = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const requestData = { ...req.body, parentId: req.user.id };
    await parentApiService.createMeetingRequest(requestData);
    res.status(201).json({ message: "Meeting request created." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateMeetingRequest = async (req: Request, res: Response) => {
  try {
    await parentApiService.updateMeetingRequest(req.params.id, req.body);
    res.status(200).json({ message: "Meeting request updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTeacherAvailability = async (req: Request, res: Response) => {
  try {
    const { teacherId, date } = req.query;
    const availability = await parentApiService.getTeacherAvailability(
      teacherId as string,
      date as string
    );
    res.status(200).json(availability);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const recordFeePayment = async (req: Request, res: Response) => {
  try {
    await parentApiService.recordFeePayment(req.body);
    res.status(200).json({ message: "Payment recorded." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const payStudentFees = async (req: Request, res: Response) => {
  try {
    const { studentId, amount, details } = req.body;
    await parentApiService.payStudentFees(studentId, amount, details);
    res.status(200).json({ message: "Fee paid." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFeeRecordForStudent = async (req: Request, res: Response) => {
  try {
    const record = await parentApiService.getFeeRecordForStudent(req.params.id);
    res.status(200).json(record);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentGrades = async (req: Request, res: Response) => {
  try {
    const grades = await parentApiService.getStudentGrades(req.params.id);
    res.status(200).json(grades);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
