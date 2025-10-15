// src/controllers/registrarController.ts
import { Request, Response, NextFunction} from "express";
import { registrarApiService } from "../services";
import prisma from "../prisma";
import { FeePayment, Student } from "@prisma/client"; // Import needed types

// This controller has been corrected to import the instantiated service
// and to perform necessary checks for `req.user` before using its properties.

const getRegistrarBranchId = (req: Request): string | null => {
  if (req.user?.role === "Registrar" && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
};

// src/controllers/registrarController.ts

export const getRegistrarDashboardData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Registrar not associated with a branch." });
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Comprehensive data fetching transaction
    const [
      pendingAdmissions,
      pendingAcademicRequests,
      feesPendingAggregate,
      unassignedFaculty,
      pendingEvents,
      admissionRequests,
      classFeeSummaries,
      teacherAttendanceStatus,
    ] = await prisma.$transaction([
      prisma.admissionApplication.count({ where: { branchId, status: "Pending" } }),
      prisma.rectificationRequest.count({ where: { branchId, status: "Pending" } }),
      prisma.feeRecord.aggregate({
        _sum: { totalAmount: true, paidAmount: true },
        where: { student: { branchId } },
      }),
      prisma.teacher.count({ where: { branchId, subjectIds: { isEmpty: true } } }),
      prisma.schoolEvent.findMany({ where: { branchId, status: "Pending" }, take: 5 }),
      prisma.admissionApplication.findMany({
        where: { branchId, status: "Pending" },
        take: 5,
        select: { id: true, applicantName: true, gradeLevel: true }
      }),
      prisma.schoolClass.findMany({
        where: { branchId },
        select: {
          id: true,
          gradeLevel: true,
          section: true,
          students: {
            select: {
              feeRecords: {
                where: { paidAmount: { lt: prisma.feeRecord.fields.totalAmount } }
              }
            }
          }
        }
      }),
      prisma.teacherAttendanceRecord.findMany({
          where: {
              branchId,
              date: {
                  gte: new Date(now.setHours(0, 0, 0, 0)),
                  lt: new Date(now.setHours(23, 59, 59, 999))
              },
              status: { in: ['Absent', 'HalfDay'] }
          },
          include: { teacher: { select: { name: true } } }
      })
    ]);

    // Constructing fee overview for the last 6 months
    const feeOverviewPromises = Array.from({ length: 6 }).map(async (_, i) => {
        const month = (currentMonth - i + 12) % 12;
        const year = currentMonth - i < 0 ? currentYear - 1 : currentYear;
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);

        const payments = await prisma.feePayment.aggregate({
            _sum: { amount: true },
            where: { student: { branchId }, paidDate: { gte: monthStart, lte: monthEnd } },
        });
        const records = await prisma.feeRecord.aggregate({
            _sum: { totalAmount: true },
            where: { student: { branchId }, dueDate: { gte: monthStart, lte: monthEnd } }
        });
        
        const paid = payments._sum.amount || 0;
        const totalDue = records._sum.totalAmount || 0;

        return {
            month: monthStart.toLocaleString('default', { month: 'short' }),
            paid,
            pending: Math.max(0, totalDue - paid),
        };
    });
    const feeOverview = (await Promise.all(feeOverviewPromises)).reverse();

    // Final data shaping
    const dashboardData = {
      summary: {
        pendingAdmissions,
        pendingAcademicRequests,
        feesPending: (feesPendingAggregate._sum.totalAmount || 0) - (feesPendingAggregate._sum.paidAmount || 0),
        unassignedFaculty,
      },
      admissionRequests: admissionRequests.map(app => ({...app, type: 'Student', subject: ''})), // Shaping to match frontend type
      feeOverview,
      pendingEvents,
      classFeeSummaries: classFeeSummaries.map(c => {
        const defaulters = c.students.filter(s => s.feeRecords.length > 0);
        const pendingAmount = defaulters.reduce((sum, s) => 
            sum + s.feeRecords.reduce((recSum, rec) => recSum + (rec.totalAmount - rec.paidAmount), 0), 0);
        return {
            classId: c.id,
            className: `Grade ${c.gradeLevel}-${c.section}`,
            defaulterCount: defaulters.length,
            pendingAmount,
        };
      }),
      teacherAttendanceStatus: teacherAttendanceStatus.map(att => ({
          teacherId: att.teacherId,
          teacherName: att.teacher.name,
          status: att.status
      })),
      academicRequests: {
          count: pendingAcademicRequests,
          requests: [], // This can be populated with a more detailed query if needed
      }
    };

    res.status(200).json(dashboardData);
  } catch (error) {
    next(error);
  }
};

export const getUserDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req); // Assumes getRegistrarBranchId helper exists
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  const { userId } = req.params;

  try {
    // Security Check: Only find the user if they are in the same branch.
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        branchId: branchId,
      },
      select: {
        // Only return non-sensitive, necessary information
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
  } catch (error) {
    next(error);
  }
};


export const getApplications = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const data = await registrarApiService.getApplications(req.user.branchId);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  try {
    await registrarApiService.updateApplicationStatus(
      req.params.id,
      req.body.status
    );
    res.status(200).json({ message: "Application status updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const admitStudent = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const credentials = await registrarApiService.admitStudent(
      req.body,
      req.user.branchId
    );
    res
      .status(201)
      .json({ message: "Student admitted successfully.", credentials });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const submitFacultyApplication = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    await registrarApiService.submitFacultyApplication(
      req.body,
      req.user.branchId,
      req.user.id
    );
    res.status(201).json({ message: "Faculty application submitted." });
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
      await registrarApiService.getFacultyApplicationsByBranch(
        req.user.branchId
      );
    res.status(200).json(applications);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const promoteStudents = async (req: Request, res: Response) => {
  try {
    const { studentIds, targetClassId, academicSession } = req.body;
    await registrarApiService.promoteStudents(
      studentIds,
      targetClassId,
      academicSession
    );
    res.status(200).json({ message: "Students promoted successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const demoteStudents = async (req: Request, res: Response) => {
  try {
    const { studentIds, targetClassId } = req.body;
    await registrarApiService.demoteStudents(studentIds, targetClassId);
    res.status(200).json({ message: "Students moved successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteStudent = async (req: Request, res: Response) => {
  try {
    await registrarApiService.deleteStudent(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const suspendStudent = async (req: Request, res: Response) => {
  try {
    const { reason, endDate } = req.body;
    await registrarApiService.suspendStudent(req.params.id, reason, endDate);
    res.status(200).json({ message: "Student suspended." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const removeSuspension = async (req: Request, res: Response) => {
  try {
    await registrarApiService.removeSuspension(req.params.id);
    res.status(200).json({ message: "Suspension removed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    await registrarApiService.updateStudent(req.params.id, req.body);
    res.status(200).json({ message: "Student updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resetStudentAndParentPasswords = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await registrarApiService.getAllStaffForBranch(
      req.user.branchId
    );
    const registrar = staff.find((u) => u.id === req.user!.id);

    if (!registrar || !registrar.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const credentials =
      await registrarApiService.resetStudentAndParentPasswords(
        req.params.id,
        registrar.name,
        req.user.branchId
      );
    res.status(200).json({ message: "Passwords reset.", credentials });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getSchoolClassesByBranch = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const classes = await registrarApiService.getSchoolClassesByBranch(
      req.user.branchId
    );
    res.status(200).json(classes);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const createSchoolClass = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    await registrarApiService.createSchoolClass(req.user.branchId, req.body);
    res.status(201).json({ message: "Class created." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateSchoolClass = async (req: Request, res: Response) => {
  try {
    await registrarApiService.updateSchoolClass(req.params.id, req.body);
    res.status(200).json({ message: "Class updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const deleteSchoolClass = async (req: Request, res: Response) => {
  try {
    await registrarApiService.deleteSchoolClass(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateClassSubjects = async (req: Request, res: Response) => {
  try {
    await registrarApiService.updateClassSubjects(
      req.params.id,
      req.body.subjectIds
    );
    res.status(200).json({ message: "Class subjects updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const assignStudentsToClass = async (req: Request, res: Response) => {
  try {
    await registrarApiService.assignStudentsToClass(
      req.params.id,
      req.body.studentIds
    );
    res.status(200).json({ message: "Students assigned." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const removeStudentFromClass = async (req: Request, res: Response) => {
  try {
    await registrarApiService.removeStudentFromClass(
      req.params.classId,
      req.params.studentId
    );
    res.status(200).json({ message: "Student removed from class." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const assignClassMentor = async (req: Request, res: Response) => {
  try {
    await registrarApiService.assignClassMentor(
      req.params.id,
      req.body.teacherId
    );
    res.status(200).json({ message: "Mentor assigned." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const assignFeeTemplateToClass = async (req: Request, res: Response) => {
  try {
    await registrarApiService.assignFeeTemplateToClass(
      req.params.id,
      req.body.feeTemplateId
    );
    res.status(200).json({ message: "Fee template assigned." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getTeachersByBranch = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const teachers = await registrarApiService.getTeachersByBranch(
      req.user.branchId
    );
    res.status(200).json(teachers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateTeacher = async (req: Request, res: Response) => {
  try {
    await registrarApiService.updateTeacher(req.params.id, req.body);
    res.status(200).json({ message: "Teacher updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getSupportStaffByBranch = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await registrarApiService.getSupportStaffByBranch(
      req.user.branchId
    );
    res.status(200).json(staff);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const createSupportStaff = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const credentials = await registrarApiService.createSupportStaff(
      req.user.branchId,
      req.body
    );
    res.status(201).json({ message: "Support staff created.", credentials });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateSupportStaff = async (req: Request, res: Response) => {
  try {
    await registrarApiService.updateSupportStaff(req.params.id, req.body);
    res.status(200).json({ message: "Staff updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const deleteSupportStaff = async (req: Request, res: Response) => {
  try {
    await registrarApiService.deleteSupportStaff(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getRectificationRequestsByBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const requests = await registrarApiService.getRectificationRequestsByBranch(
      req.user.branchId
    );
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const processRectificationRequest = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    await registrarApiService.processRectificationRequest(
      req.params.id,
      req.user.id,
      req.body.status
    );
    res.status(200).json({ message: "Request processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getSyllabusChangeRequestsByBranch = async (
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
      await registrarApiService.getSyllabusChangeRequestsByBranch(
        req.user.branchId
      );
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const processSyllabusChangeRequest = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    await registrarApiService.processSyllabusChangeRequest(
      req.params.id,
      req.user.id,
      req.body.status
    );
    res.status(200).json({ message: "Request processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getExamMarkRectificationRequestsByBranch = async (
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
      await registrarApiService.getExamMarkRectificationRequestsByBranch(
        req.user.branchId
      );
    res.status(200).json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const processExamMarkRectificationRequest = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    await registrarApiService.processExamMarkRectificationRequest(
      req.params.id,
      req.user.id,
      req.body.status
    );
    res.status(200).json({ message: "Request processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getFeeTemplates = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const templates = await registrarApiService.getFeeTemplates(
      req.user.branchId
    );
    res.status(200).json(templates);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const createFeeTemplate = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    await registrarApiService.createFeeTemplate({
      ...req.body,
      branchId: req.user.branchId,
    });
    res.status(201).json({ message: "Fee template created." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const requestFeeTemplateUpdate = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { templateId, newData, reason } = req.body;
    await registrarApiService.requestFeeTemplateUpdate(
      templateId,
      newData,
      reason,
      req.user.id
    );
    res.status(200).json({ message: "Update request submitted." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const requestFeeTemplateDeletion = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { templateId, reason } = req.body;
    await registrarApiService.requestFeeTemplateDeletion(
      templateId,
      reason,
      req.user.id
    );
    res.status(200).json({ message: "Deletion request submitted." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getDefaultersForClass = async (req: Request, res: Response) => {
  try {
    const defaulters = await registrarApiService.getDefaultersForClass(
      req.params.classId
    );
    res.status(200).json(defaulters);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getTimetableConfig = async (req: Request, res: Response) => {
  try {
    const config = await registrarApiService.getTimetableConfig(
      req.params.classId
    );
    res.status(200).json(config);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const createTimetableConfig = async (req: Request, res: Response) => {
  try {
    const { classId, timeSlots } = req.body;
    await registrarApiService.createTimetableConfig(classId, timeSlots);
    res.status(201).json({ message: "Timetable config saved." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getAvailableTeachersForSlot = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const { day, startTime } = req.query;
    const teachers = await registrarApiService.getAvailableTeachersForSlot(
      req.user.branchId,
      day as string,
      startTime as string
    );
    res.status(200).json(teachers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const setTimetableSlot = async (req: Request, res: Response) => {
  try {
    await registrarApiService.setTimetableSlot(req.body);
    res.status(201).json({ message: "Timetable slot saved." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const deleteTimetableSlot = async (req: Request, res: Response) => {
  try {
    await registrarApiService.deleteTimetableSlot(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getTimetableForClass = async (req: Request, res: Response) => {
  try {
    const timetable = await registrarApiService.getTimetableForClass(
      req.params.classId
    );
    res.status(200).json(timetable);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getDailyAttendanceForClass = async (
  req: Request,
  res: Response
) => {
  try {
    const attendance = await registrarApiService.getDailyAttendanceForClass(
      req.params.classId,
      req.query.date as string
    );
    res.status(200).json(attendance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getTeacherAttendance = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const attendance = await registrarApiService.getTeacherAttendance(
      req.user.branchId,
      req.query.date as string
    );
    res.status(200).json(attendance);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const saveTeacherAttendance = async (req: Request, res: Response) => {
  try {
    await registrarApiService.saveTeacherAttendance(req.body);
    res.status(200).json({ message: "Attendance saved." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getLeaveSettingsForBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const settings = await registrarApiService.getLeaveSettingsForBranch(
      req.user.branchId
    );
    res.status(200).json(settings);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateLeaveSettingsForBranch = async (
  req: Request,
  res: Response
) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    await registrarApiService.updateLeaveSettingsForBranch(
      req.user.branchId,
      req.body
    );
    res.status(200).json({ message: "Leave settings updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getLeaveApplicationsForRegistrar = async (
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
      await registrarApiService.getLeaveApplicationsForRegistrar(
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
    await registrarApiService.processLeaveApplication(
      req.params.id,
      req.body.status,
      req.user.id
    );
    res.status(200).json({ message: "Application processed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getHostels = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const hostels = await registrarApiService.getHostels(req.user.branchId);
    res.status(200).json(hostels);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const createHostel = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    await registrarApiService.createHostel(req.body, req.user.branchId);
    res.status(201).json({ message: "Hostel created." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateHostel = async (req: Request, res: Response) => {
  try {
    await registrarApiService.updateHostel(req.params.id, req.body);
    res.status(200).json({ message: "Hostel updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const deleteHostel = async (req: Request, res: Response) => {
  try {
    await registrarApiService.deleteHostel(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
export const getRooms = async (req: Request, res: Response) => {
  try {
    const rooms = await registrarApiService.getRooms(req.params.id);
    res.status(200).json(rooms);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const assignStudentToRoom = async (req: Request, res: Response) => {
  try {
    await registrarApiService.assignStudentToRoom(
      req.body.studentId,
      req.params.roomId
    );
    res.status(200).json({ message: "Student assigned to room." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const removeStudentFromRoom = async (req: Request, res: Response) => {
  try {
    await registrarApiService.removeStudentFromRoom(req.params.studentId);
    res.status(200).json({ message: "Student removed from room." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getTransportRoutes = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const routes = await registrarApiService.getTransportRoutes(
      req.user.branchId
    );
    res.status(200).json(routes);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const createTransportRoute = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    await registrarApiService.createTransportRoute({
      ...req.body,
      branchId: req.user.branchId,
    });
    res.status(201).json({ message: "Route created." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateTransportRoute = async (req: Request, res: Response) => {
  try {
    await registrarApiService.updateTransportRoute(req.params.id, req.body);
    res.status(200).json({ message: "Route updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const deleteTransportRoute = async (req: Request, res: Response) => {
  try {
    await registrarApiService.deleteTransportRoute(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getUnassignedMembers = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const members = await registrarApiService.getUnassignedMembers(
      req.user.branchId
    );
    res.status(200).json(members);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const assignMemberToRoute = async (req: Request, res: Response) => {
  try {
    const { routeId, memberId, memberType, stopId } = req.body;
    await registrarApiService.assignMemberToRoute(
      routeId,
      memberId,
      memberType,
      stopId
    );
    res.status(200).json({ message: "Member assigned." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const removeMemberFromRoute = async (req: Request, res: Response) => {
  try {
    const { routeId, memberId } = req.body;
    await registrarApiService.removeMemberFromRoute(routeId, memberId);
    res.status(200).json({ message: "Member removed." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getInventory = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const inventory = await registrarApiService.getInventory(req.user.branchId);
    res.status(200).json(inventory);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getInventoryLogs = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const logs = await registrarApiService.getInventoryLogs(req.user.branchId);
    res.status(200).json(logs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const createInventoryItem = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }
    const staff = await registrarApiService.getAllStaffForBranch(
      req.user.branchId
    );
    const registrar = staff.find((u) => u.id === req.user!.id);

    if (!registrar || !registrar.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }

    const { itemData, reason } = req.body;
    await registrarApiService.createInventoryItem(
      itemData,
      reason,
      registrar.name,
      req.user.branchId
    );
    res.status(201).json({ message: "Item created." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const updateInventoryItem = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const staff = await registrarApiService.getAllStaffForBranch(
      req.user.branchId!
    );
    const registrar = staff.find((u) => u.id === req.user!.id);

    if (!registrar || !registrar.name) {
      return res
        .status(404)
        .json({ message: "Authenticated user not found or name is missing." });
    }
    const { itemData, reason } = req.body;
    await registrarApiService.updateInventoryItem(
      req.params.id,
      itemData,
      reason,
      registrar.name
    );
    res.status(200).json({ message: "Item updated." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const deleteInventoryItem = async (req: Request, res: Response) => {
  try {
    await registrarApiService.deleteInventoryItem(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
  
};


export const getSubjectsForBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Unauthorized." });
    }
    try {
        const subjects = await prisma.subject.findMany({
            where: { branchId },
            orderBy: { name: 'asc' }
        });
        res.status(200).json(subjects);
    } catch (error) {
        next(error);
    }
};

// src/controllers/registrarController.ts

export const getTeacherAttendanceRequests = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Unauthorized." });
    }
    try {
        const requests = await prisma.teacherAttendanceRectificationRequest.findMany({
            where: { branchId },
            orderBy: { requestedAt: 'desc' }
        });
        res.status(200).json(requests);
    } catch (error) {
        next(error);
    }
};


export const getStudentLeaveApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  try {
    const applications = await prisma.leaveApplication.findMany({
      where: {
        // FIX: Query through the 'applicant' relation to filter by branch and role.
        applicant: {
          branchId: branchId,
          role: "Student", // Specifically find applications from students
        },
      },
      include: {
        // FIX: Include the 'applicant's' details instead of the old 'teacher' relation.
        applicant: {
          select: { name: true },
        },
      },
      orderBy: { fromDate: "desc" },
    });
    res.status(200).json(applications);
  } catch (error) {
    next(error);
  }
};