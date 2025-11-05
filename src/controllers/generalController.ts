// backend/src/controllers/generalController.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";

// --- HELPER FUNCTION ---
const getAuthenticatedBranchId = (req: Request): string | null => {
  if (req.user && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
};

// --- EXISTING FUNCTIONS (NOW FIXED WITH PRISMA) ---

export const getBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const idOrReg = req.params.id;
  if (!idOrReg) {
    return res
      .status(400)
      .json({ error: "Branch id or registrationId is required." });
  }
  try {
    const branch = await prisma.branch.findFirst({
      where: {
        OR: [{ id: idOrReg }, { registrationId: idOrReg }],
      },
      select: {
        // Only select fields that are safe to be public
        name: true,
        location: true,
        email: true,
        helplineNumber: true,
      },
    });
    if (!branch) {
      return res.status(404).json({ error: "Branch not found" });
    }
    return res.status(200).json(branch);
  } catch (err) {
    next(err);
  }
};

export async function getUser(req: Request, res: Response, next: NextFunction) {
  const branchId = getAuthenticatedBranchId(req);
  if (!branchId) {
    return res
      .status(401)
      .json({ message: "Unauthorized: User is not associated with a branch." });
  }
  const { userId } = req.params;
  try {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        branchId: branchId, // Security: Can only get users in the same branch
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
      },
    });
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found in your branch." });
    }
    res.status(200).json(user);
  } catch (error: any) {
    next(error);
  }
}

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { name, phone } = req.body;
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, phone },
    });
    res.status(200).json(updatedUser);
  } catch (error: any) {
    next(error);
  }
}

// --- NEW SHARED FUNCTIONS (Moved from Registrar/Librarian) ---

export const getStudentsForBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  try {
    const students = await prisma.student.findMany({
      where: { branchId },
      orderBy: { name: "asc" },
    });
    res.status(200).json(students);
  } catch (error) {
    next(error);
  }
};

export const getTeachersByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  if (!branchId) {
    return res
      .status(401)
      .json({ message: "Authentication required with a valid branch." });
  }
  try {
    const teachers = await prisma.teacher.findMany({
      where: { branchId },
      orderBy: { name: "asc" },
    });
    res.status(200).json(teachers);
  } catch (error) {
    next(error);
  }
};

export const getLeaveSettingsForBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  if (!branchId)
    return res
      .status(401)
      .json({ message: "Authentication required with a valid branch." });
  try {
    const settings = await prisma.leaveSettings.findUnique({
      where: { branchId },
    });
    res.status(200).json(
      settings || {
        branchId,
        defaultStudentSick: 10,
        defaultStudentCasual: 5,
        defaultTeacherSick: 12,
        defaultTeacherCasual: 10,
        defaultStaffSick: 12,
        defaultStaffCasual: 7,
      }
    );
  } catch (error) {
    next(error);
  }
};

export const getMyLeaveApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const applicantId = req.user?.id;
  if (!applicantId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const applications = await prisma.leaveApplication.findMany({
      where: { applicantId: applicantId },
      orderBy: { fromDate: "desc" },
    });
    res.status(200).json(applications);
  } catch (error) {
    next(error);
  }
};

export const createLeaveApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const applicantId = req.user?.id;
  if (!applicantId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  const { leaveType, startDate, endDate, isHalfDay, reason } = req.body;
  if (!leaveType || !startDate || !endDate || !reason) {
    return res.status(400).json({ message: "All fields are required." });
  }
  try {
    const newApplication = await prisma.leaveApplication.create({
      data: {
        applicantId: applicantId,
        reason: reason,
        status: "Pending",
        fromDate: startDate,
        toDate: endDate,
        leaveType: leaveType,
        isHalfDay: isHalfDay,
      },
    });
    res.status(201).json(newApplication);
  } catch (error) {
    next(error);
  }
};

// --- NEW SHARED FUNCTIONS (For Teacher Portal) ---

export const getSchoolEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const events = await prisma.schoolEvent.findMany({
      where: { branchId: branchId },
      orderBy: { date: "asc" },
    });
    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
};

export const getSchoolClassesByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const classes = await prisma.schoolClass.findMany({
      where: { branchId: branchId },
      orderBy: [{ gradeLevel: "asc" }, { section: "asc" }],
    });
    res.status(200).json(classes);
  } catch (error) {
    next(error);
  }
};

export const getClassById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  const { id } = req.params;
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: id, branchId: branchId },
    });
    if (!schoolClass) {
      return res
        .status(404)
        .json({ message: "Class not found in your branch." });
    }
    res.status(200).json(schoolClass);
  } catch (error) {
    next(error);
  }
};

export const getSubjectById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  const { id } = req.params;
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const subject = await prisma.subject.findFirst({
      where: { id: id, branchId: branchId },
    });
    if (!subject) {
      return res
        .status(404)
        .json({ message: "Subject not found in your branch." });
    }
    res.status(200).json(subject);
  } catch (error) {
    next(error);
  }
};

export const getExaminationById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  const { id } = req.params;
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const examination = await prisma.examination.findFirst({
      where: { id: id, branchId: branchId },
    });
    if (!examination) {
      return res
        .status(404)
        .json({ message: "Examination not found in your branch." });
    }
    res.status(200).json(examination);
  } catch (error) {
    next(error);
  }
};

export const searchLibraryBooks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getAuthenticatedBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const query = req.query.q as string;
    const books = await prisma.libraryBook.findMany({
      where: {
        branchId: branchId,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { author: { contains: query, mode: "insensitive" } },
          { isbn: { contains: query, mode: "insensitive" } },
        ],
      },
    });
    res.status(200).json(books);
  } catch (error) {
    next(error);
  }
};
