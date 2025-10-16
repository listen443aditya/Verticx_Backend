// src/controllers/registrarController.ts
import { Request, Response, NextFunction} from "express";
import { registrarApiService } from "../services";
import prisma from "../prisma";
import {
  FeePayment,
  Student,
  UserRole,
  TeacherAttendanceStatus,
} from "@prisma/client"; 
import { generatePassword } from "../utils/helpers"; 
import bcrypt from "bcryptjs";


const getRegistrarBranchId = (req: Request): string | null => {
  if (req.user?.role === "Registrar" && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
};



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
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // --- Comprehensive Data Fetching in a Single Transaction ---
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
      prisma.schoolEvent.findMany({ where: { branchId, status: "Pending" }, take: 5, orderBy: { date: 'asc' } }),
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
                where: { paidAmount: { lt: prisma.feeRecord.fields.totalAmount } },
                select: { totalAmount: true, paidAmount: true }
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

    // --- Complex Calculation for Monthly Fee Overview ---
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

    // --- Final Data Shaping to Match Frontend Contract ---
    const dashboardData = {
      summary: {
        pendingAdmissions,
        pendingAcademicRequests,
        feesPending: (feesPendingAggregate._sum.totalAmount || 0) - (feesPendingAggregate._sum.paidAmount || 0),
        unassignedFaculty,
      },
      admissionRequests: admissionRequests.map(app => ({...app, type: 'Student', subject: ''})),
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
          requests: [], // This can be populated with a more detailed query if needed for the UI
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


export const getApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res
      .status(401)
      .json({ message: "Authentication required with a valid branch." });
  }
  try {
    const data = await prisma.admissionApplication.findMany({
      where: { branchId },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

/**
 * @description Update the status of a specific admission application.
 * @route PATCH /api/registrar/applications/:id/status
 */
export const updateApplicationStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;
  const { status } = req.body; // Expecting 'Approved' or 'Rejected'

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (!status) {
    return res.status(400).json({ message: "Status is required." });
  }

  try {
    // Security Check: Ensure the application belongs to the registrar's branch before updating.
    const application = await prisma.admissionApplication.findFirst({
      where: { id, branchId },
    });

    if (!application) {
      return res
        .status(404)
        .json({ message: "Application not found in your branch." });
    }

    await prisma.admissionApplication.update({
      where: { id },
      data: { status },
    });
    res
      .status(200)
      .json({ message: `Application status updated to ${status}.` });
  } catch (error) {
    next(error);
  }
};

/**
 * @description Admit a student from an application, creating student and parent user accounts.
 * @route POST /api/registrar/admit-student
 */
export const admitStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { applicationId } = req.body;
  if (!applicationId) {
    return res.status(400).json({ message: "Application ID is required." });
  }

  try {
    const application = await prisma.admissionApplication.findFirst({
      where: { id: applicationId, branchId, status: "Approved" },
    });

    if (!application) {
      return res
        .status(404)
        .json({ message: "Approved application not found." });
    }

    const studentPassword = generatePassword();
    const parentPassword = generatePassword();

    // Use a transaction to ensure all or none of the operations succeed
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Parent User
      const parentUser = await tx.user.create({
        data: {
          email: `parent_${application.applicantName
            .replace(/\s+/g, ".")
            .toLowerCase()}@school.com`, // Placeholder email
          passwordHash: await bcrypt.hash(parentPassword, 10),
          userId: `VRTX-PAR-${Date.now().toString().slice(-6)}`,
          name: `${application.applicantName}'s Parent`,
          role: "Parent",
          branchId,
        },
      });

      // 2. Create Student Record
      const student = await tx.student.create({
        data: {
          name: application.applicantName,
          gradeLevel: application.gradeLevel,
          branchId,
          parentId: parentUser.id,
          status: "active",
        },
      });

      // 3. Update application status to Admitted
      await tx.admissionApplication.update({
        where: { id: applicationId },
        data: { status: "Admitted" },
      });

      return {
        student,
        parentUser,
        credentials: {
          student: { userId: "To be assigned", password: studentPassword }, // Student user creation can be a separate step
          parent: { userId: parentUser.userId, password: parentPassword },
        },
      };
    });

    res
      .status(201)
      .json({
        message: "Student admitted successfully.",
        credentials: result.credentials,
      });
  } catch (error) {
    next(error);
  }
};

/**
 * @description Submit a new faculty application.
 * @route POST /api/registrar/faculty-applications
 */
export const submitFacultyApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { name, email, phone, qualification } = req.body;

  if (!name || !email || !phone || !qualification) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    await prisma.facultyApplication.create({
      data: {
        name,
        email,
        phone,
        qualification,
        // Security: The branchId is from the authenticated registrar, not the request body.
        branchId,
      },
    });
    res
      .status(201)
      .json({ message: "Faculty application submitted successfully." });
  } catch (error) {
    next(error);
  }
};


/**
 * @description Get all faculty applications for the registrar's branch.
 * @route GET /api/registrar/faculty-applications
 */
export const getFacultyApplicationsByBranch = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required with a valid branch." });
  }
  try {
    const applications = await prisma.facultyApplication.findMany({
      where: { branchId },
      // FIX: Removed the 'orderBy' clause as 'createdAt' does not exist on the FacultyApplication model.
    });
    res.status(200).json(applications);
  } catch (error) {
    next(error);
  }
};

/**
 * @description Promote a list of students to a new, higher-grade class.
 * @route PATCH /api/registrar/students/promote
 */
export const promoteStudents = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { studentIds, targetClassId } = req.body;
  if (!Array.isArray(studentIds) || !targetClassId) {
    return res.status(400).json({ message: "studentIds array and targetClassId are required." });
  }

  try {
    // Security Check: Verify the target class belongs to the registrar's branch.
    const targetClass = await prisma.schoolClass.findFirst({
        where: { id: targetClassId, branchId }
    });

    if (!targetClass) {
        return res.status(404).json({ message: "Target class not found in your branch." });
    }

    // Perform the update, but ONLY for students who are in the registrar's branch.
    const updateResult = await prisma.student.updateMany({
      where: {
        id: { in: studentIds },
        branchId: branchId, // Critical multi-tenant security check
      },
      data: {
        classId: targetClassId,
        gradeLevel: targetClass.gradeLevel, // Update grade level upon promotion
      },
    });

    res.status(200).json({ message: `${updateResult.count} students were promoted successfully.` });
  } catch (error) {
    next(error);
  }
};

/**
 * @description Demote (or move) a list of students to a new class.
 * @route PATCH /api/registrar/students/demote
 */
export const demoteStudents = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    const { studentIds, targetClassId } = req.body;
    if (!Array.isArray(studentIds) || !targetClassId) {
        return res.status(400).json({ message: "studentIds array and targetClassId are required." });
    }

    try {
        // Security Check: Verify the target class belongs to the registrar's branch.
        const targetClass = await prisma.schoolClass.findFirst({
            where: { id: targetClassId, branchId }
        });

        if (!targetClass) {
            return res.status(404).json({ message: "Target class not found in your branch." });
        }

        // Perform the update, only for students within the same branch.
        const updateResult = await prisma.student.updateMany({
            where: {
                id: { in: studentIds },
                branchId: branchId, // Critical multi-tenant security check
            },
            data: {
                classId: targetClassId,
                gradeLevel: targetClass.gradeLevel,
            },
        });

        res.status(200).json({ message: `${updateResult.count} students were moved successfully.` });
    } catch (error) {
        next(error);
    }
};


/**
 * @description Permanently delete a student and all their associated records.
 * @route DELETE /api/registrar/students/:id
 */
export const deleteStudent = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // Wrap all delete operations in a transaction to ensure data integrity
    await prisma.$transaction(async (tx) => {
      // 1. Security Check: Verify the student exists and belongs to the registrar's branch.
      const student = await tx.student.findFirst({
        where: { id, branchId },
      });

      if (!student) {
        // We throw an error here to automatically roll back the transaction.
        throw new Error("Student not found in your branch.");
      }

      // 2. Delete all dependent records to prevent foreign key violations.
      // The order is important: delete records that reference the student first.
      await tx.feeAdjustment.deleteMany({ where: { studentId: id } });
      await tx.feePayment.deleteMany({ where: { studentId: id } });
      await tx.feeRecord.deleteMany({ where: { studentId: id } });
      await tx.attendanceRecord.deleteMany({ where: { studentId: id } });
      await tx.examMark.deleteMany({ where: { studentId: id } });
      await tx.complaint.deleteMany({ where: { studentId: id } });
      await tx.suspensionRecord.deleteMany({ where: { studentId: id } });
      await tx.rectificationRequest.deleteMany({ where: { studentId: id } });
      
      // 3. Finally, delete the student record itself.
      await tx.student.delete({ where: { id } });
    });

    res.status(204).send(); // Success, no content to return.

  } catch (error: any) {
    // If our custom error was thrown, return a 404. Otherwise, pass to the global handler.
    if (error.message === "Student not found in your branch.") {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
};



/**
 * @description Suspend a student and create a suspension record.
 * @route PATCH /api/registrar/students/:id/suspend
 */
export const suspendStudent = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;
  const { reason, endDate } = req.body;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (!reason || !endDate) {
    return res.status(400).json({ message: "Reason and suspension end date are required." });
  }

  try {
    // Use a transaction to ensure both student status and suspension record are created together.
    await prisma.$transaction(async (tx) => {
      // 1. Security Check: Verify student exists in the registrar's branch.
      const student = await tx.student.findFirst({
        where: { id, branchId },
      });

      if (!student) {
        throw new Error("Student not found in your branch.");
      }

      // 2. Update the student's status.
      await tx.student.update({
        where: { id },
        data: { status: "suspended" },
      });

      // 3. Create a formal suspension record.
      await tx.suspensionRecord.create({
        data: {
          studentId: id,
          reason,
          startDate: new Date(),
          endDate: new Date(endDate),
        },
      });
    });

    res.status(200).json({ message: "Student suspended successfully." });
  } catch (error: any) {
    if (error.message === "Student not found in your branch.") {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
};

/**
 * @description Remove a student's suspension and deactivate the record.
 * @route PATCH /api/registrar/students/:id/remove-suspension
 */
export const removeSuspension = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // This is the student ID

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Security Check: Verify student exists and is suspended in the registrar's branch.
      const student = await tx.student.findFirst({
        where: { id, branchId, status: "suspended" },
      });

      if (!student) {
        throw new Error("Suspended student not found in your branch.");
      }

      // 2. Update the student's status back to active.
      await tx.student.update({
        where: { id },
        data: { status: "active" },
      });

      // 3. Deactivate all active suspension records for that student.
      await tx.suspensionRecord.updateMany({
        where: { studentId: id, isActive: true },
        data: { isActive: false },
      });
    });

    res.status(200).json({ message: "Suspension removed successfully." });
  } catch (error: any) {
    if (error.message.includes("student not found")) {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
};

/**
 * @description Update a student's profile information.
 * @route PATCH /api/registrar/students/:id
 */
export const updateStudent = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  
  // Exclude fields that should not be updated through this generic endpoint
  const { id: studentId, branchId: reqBranchId, status, ...updateData } = req.body;

  try {
    // Security Check: Ensure student exists in the registrar's branch before updating.
    const studentExists = await prisma.student.findFirst({
        where: { id, branchId }
    });

    if (!studentExists) {
        return res.status(404).json({ message: "Student not found in your branch." });
    }

    const updatedStudent = await prisma.student.update({
      where: { id },
      data: updateData,
    });
    res.status(200).json(updatedStudent);
  } catch (error) {
    next(error);
  }
};

/**
 * @description Reset passwords for a student (if they have a user account) and their parent.
 * @route POST /api/registrar/students/:id/reset-password
 */
export const resetStudentAndParentPasswords = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // This is the Student ID

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Security Check: Find the student and their parent within the same branch.
    const student = await prisma.student.findFirst({
        where: { id, branchId },
        include: { parent: true }
    });

    if (!student) {
        return res.status(404).json({ message: "Student not found in your branch." });
    }
    if (!student.parent) {
        return res.status(404).json({ message: "Parent account not found for this student." });
    }

    const parentPassword = generatePassword();
    
    // 2. Update the parent's password in the User table.
    await prisma.user.update({
        where: { id: student.parentId! },
        data: {
            passwordHash: await bcrypt.hash(parentPassword, 10)
        }
    });
    
    // (Optional: If students also have logins, reset their password here)

    res.status(200).json({ 
        message: "Parent's password has been reset.",
        credentials: {
            parentId: student.parent.userId,
            parentPassword: parentPassword
        }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @description Get all school classes for the registrar's branch.
 * @route GET /api/registrar/classes
 */
export const getSchoolClassesByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res
      .status(401)
      .json({ message: "Authentication required with a valid branch." });
  }
  try {
    const classes = await prisma.schoolClass.findMany({
      where: { branchId },
      // FIX: Include the count of students and the names of subjects for each class
      include: {
        _count: {
          select: { students: true },
        },
        subjects: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ gradeLevel: "asc" }, { section: "asc" }],
    });
    res.status(200).json(classes);
  } catch (error) {
    next(error);
  }
};

/**
 * @description Create a new school class within the registrar's branch.
 * @route POST /api/registrar/classes
 */
export const createSchoolClass = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { gradeLevel, section } = req.body;
  if (!gradeLevel || !section) {
    return res.status(400).json({ message: "Grade Level and Section are required." });
  }

  try {
    const newClass = await prisma.schoolClass.create({
      data: {
        gradeLevel: parseInt(gradeLevel, 10),
        section,
        branchId, // Security: branchId is from the token, not the request body.
      },
    });
    res.status(201).json(newClass);
  } catch (error) {
    next(error);
  }
};

/**
 * @description Update a school class's details.
 * @route PATCH /api/registrar/classes/:id
 */
export const updateSchoolClass = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { gradeLevel, section, mentorId } = req.body;

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Security Check: Ensure the class exists in the registrar's branch before updating.
        const classExists = await prisma.schoolClass.findFirst({
            where: { id, branchId }
        });

        if (!classExists) {
            return res.status(404).json({ message: "Class not found in your branch." });
        }

        const updatedClass = await prisma.schoolClass.update({
            where: { id },
            data: {
                gradeLevel: gradeLevel ? parseInt(gradeLevel, 10) : undefined,
                section,
                mentorId,
            },
        });
        res.status(200).json(updatedClass);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Delete a school class, only if it has no students.
 * @route DELETE /api/registrar/classes/:id
 */
export const deleteSchoolClass = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Security & Integrity Check: Find the class and check if it's empty.
    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id, branchId },
      include: { _count: { select: { students: true } } },
    });

    if (!schoolClass) {
      return res.status(404).json({ message: "Class not found in your branch." });
    }

    if (schoolClass._count.students > 0) {
      return res.status(400).json({ message: `Cannot delete class. It currently has ${schoolClass._count.students} students assigned.` });
    }

    // 2. If checks pass, proceed with deletion.
    await prisma.schoolClass.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

/**
 * @description Update the list of subjects associated with a class.
 * @route PATCH /api/registrar/classes/:id/subjects
 */
export const updateClassSubjects = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { subjectIds } = req.body; // Expects an array of subject IDs

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }
    if (!Array.isArray(subjectIds)) {
        return res.status(400).json({ message: "subjectIds must be an array." });
    }

    try {
        // Security Check: Ensure the class exists in the registrar's branch.
        const classExists = await prisma.schoolClass.findFirst({
            where: { id, branchId }
        });

        if (!classExists) {
            return res.status(404).json({ message: "Class not found in your branch." });
        }

        // This operation connects the class to existing subjects.
        await prisma.schoolClass.update({
            where: { id },
            data: {
                subjects: {
                    set: subjectIds.map(subjectId => ({ id: subjectId }))
                }
            },
        });

        res.status(200).json({ message: "Class subjects updated successfully." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Assign a list of students to a specific class.
 * @route POST /api/registrar/classes/:id/assign-students
 */
export const assignStudentsToClass = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // Class ID
  const { studentIds } = req.body;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (!Array.isArray(studentIds)) {
    return res.status(400).json({ message: "studentIds must be an array." });
  }
  
  try {
    // Security: Verify the target class is in the registrar's branch
    const targetClass = await prisma.schoolClass.findFirst({
        where: { id, branchId }
    });
    if (!targetClass) {
        return res.status(404).json({ message: "Class not found in your branch." });
    }

    // Update students, but only those who are also in the same branch
    const result = await prisma.student.updateMany({
        where: {
            id: { in: studentIds },
            branchId: branchId, // Critical security check
        },
        data: {
            classId: id
        }
    });

    res.status(200).json({ message: `${result.count} students were assigned to the class.` });
  } catch (error) {
    next(error);
  }
};

/**
 * @description Remove a single student from their currently assigned class.
 * @route PATCH /api/registrar/students/:studentId/remove-from-class
 */
export const removeStudentFromClass = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { studentId } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  
  try {
    // Security: Use updateMany to ensure we only update a student in the registrar's branch.
    const result = await prisma.student.updateMany({
      where: {
        id: studentId,
        branchId: branchId, // Critical security check
      },
      data: {
        classId: null, // Set the classId to null to unassign
      },
    });

    if (result.count === 0) {
        return res.status(404).json({ message: "Student not found in your branch." });
    }

    res.status(200).json({ message: "Student has been removed from the class." });
  } catch (error) {
    next(error);
  }
};


/**
 * @description Assign a teacher as a mentor to a specific class.
 * @route PATCH /api/registrar/classes/:id/assign-mentor
 */
export const assignClassMentor = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params; // Class ID
    const { teacherId } = req.body;

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Security: In a transaction, verify both the class and the teacher belong to the registrar's branch.
        await prisma.$transaction(async (tx) => {
            const classExists = await tx.schoolClass.findFirst({
                where: { id, branchId }
            });
            if (!classExists) throw new Error("Class not found in your branch.");

            if (teacherId) {
                const teacherExists = await tx.teacher.findFirst({
                    where: { id: teacherId, branchId }
                });
                if (!teacherExists) throw new Error("Teacher not found in your branch.");
            }
            
            await tx.schoolClass.update({
                where: { id },
                data: { mentorId: teacherId },
            });
        });

        res.status(200).json({ message: "Mentor assigned successfully." });
    } catch (error: any) {
        if (error.message.includes("not found")) {
            return res.status(404).json({ message: error.message });
        }
        next(error);
    }
};

/**
 * @description Assign a fee template to a specific class.
 * @route PATCH /api/registrar/classes/:id/assign-fee-template
 */
export const assignFeeTemplateToClass = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params; // Class ID
    const { feeTemplateId } = req.body;

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }
    
    try {
        // Security: Use updateMany to ensure the operation only affects a class within the correct branch.
        const result = await prisma.schoolClass.updateMany({
            where: { id, branchId },
            data: { feeTemplateId: feeTemplateId || null },
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Class not found in your branch." });
        }

        res.status(200).json({ message: "Fee template assigned successfully." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get all teachers for the registrar's branch.
 * @route GET /api/registrar/teachers
 */
export const getTeachersByBranch = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required with a valid branch." });
  }
  try {
    const teachers = await prisma.teacher.findMany({
      where: { branchId },
      orderBy: { name: 'asc' }
    });
    res.status(200).json(teachers);
  } catch (error) {
    next(error);
  }
};

/**
 * @description Update a teacher's profile information.
 * @route PATCH /api/registrar/teachers/:id
 */
export const updateTeacher = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params; // Teacher ID
    // Securely destructure payload to prevent unwanted field updates
    const { name, email, phone, qualification, salary } = req.body;
    const updateData = { name, email, phone, qualification, salary };

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Security: Use updateMany to ensure we only update a teacher within the registrar's branch.
        const result = await prisma.teacher.updateMany({
            where: { id, branchId },
            data: updateData
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Teacher not found in your branch." });
        }
        
        res.status(200).json({ message: "Teacher profile updated successfully." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get all non-teaching support staff for the registrar's branch.
 * @route GET /api/registrar/support-staff
 */
export const getSupportStaffByBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    try {
        const supportStaff = await prisma.user.findMany({
            where: {
                branchId,
                role: { in: [UserRole.Librarian, UserRole.SupportStaff, UserRole.Registrar] }
            },
            select: { id: true, name: true, email: true, phone: true, role: true, status: true },
            orderBy: { name: 'asc' }
        });
        res.status(200).json(supportStaff);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Create a new support staff user account.
 * @route POST /api/registrar/support-staff
 */
export const createSupportStaff = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }
    
    const { name, email, phone, role, designation } = req.body;
    if (!name || !email || !role) {
        return res.status(400).json({ message: "Name, email, and role are required."});
    }

    try {
        const password = generatePassword();
        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                phone,
                role,
                designation,
                passwordHash,
                userId: `VRTX-STF-${Date.now().toString().slice(-6)}`,
                branchId // Security: Enforced branchId
            }
        });

        res.status(201).json({
            message: "Support staff created successfully.",
            credentials: {
                userId: newUser.userId,
                password: password
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Update a support staff member's information.
 * @route PATCH /api/registrar/support-staff/:id
 */
export const updateSupportStaff = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params; // User ID
    const { name, email, phone, role, designation, status } = req.body;
    const updateData = { name, email, phone, role, designation, status };

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }
    
    try {
        // Security: Use updateMany to scope the update to the correct branch and valid roles.
        const result = await prisma.user.updateMany({
            where: {
                id,
                branchId,
                role: { in: [UserRole.Librarian, UserRole.SupportStaff, UserRole.Registrar] }
            },
            data: updateData
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Support staff not found in your branch." });
        }

        res.status(200).json({ message: "Staff profile updated successfully." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Delete a support staff user account.
 * @route DELETE /api/registrar/support-staff/:id
 */
export const deleteSupportStaff = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Security: Use deleteMany to ensure we only delete a user from the correct branch and valid roles.
        const result = await prisma.user.deleteMany({
            where: {
                id,
                branchId,
                // Safety: Prevent a registrar from deleting a Principal or Teacher via this endpoint.
                role: { in: [UserRole.Librarian, UserRole.SupportStaff, UserRole.Registrar] }
            }
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Support staff not found in your branch." });
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};


/**
 * @description Get all rectification requests for the registrar's branch.
 * @route GET /api/registrar/rectification-requests
 */
export const getRectificationRequestsByBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    try {
        const requests = await prisma.rectificationRequest.findMany({
            where: { branchId },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(requests);
    } catch (error) {
        next(error);
    }
};


/**
 * @description Process a general rectification request (e.g., for a student profile).
 * @route PATCH /api/registrar/rectification-requests/:id/process
 */
export const processRectificationRequest = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { status } = req.body; // Expecting 'Approved' or 'Rejected'

    if (!branchId || !req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }
    if (!status) {
        return res.status(400).json({ message: "Status is required." });
    }

    try {
        // Security: Use updateMany to ensure we only process a request within the registrar's branch.
        const result = await prisma.rectificationRequest.updateMany({
            where: { id, branchId },
            data: { 
                status,
                reviewedBy: req.user.id, // Log which user took the action
                reviewedAt: new Date(),
            },
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Request not found in your branch." });
        }
        
        // Note: For a real application, if status is 'Approved', you would add logic here
        // to actually perform the data correction (e.g., update the student's profile).

        res.status(200).json({ message: "Request has been processed." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get all syllabus change requests for the registrar's branch.
 * @route GET /api/registrar/syllabus-change-requests
 */
export const getSyllabusChangeRequestsByBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    try {
        const requests = await prisma.syllabusChangeRequest.findMany({
            where: { branchId },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(requests);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Process a syllabus change request.
 * @route PATCH /api/registrar/syllabus-change-requests/:id/process
 */
export const processSyllabusChangeRequest = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (!branchId || !req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        const result = await prisma.syllabusChangeRequest.updateMany({
            where: { id, branchId },
            data: { status },
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Syllabus change request not found in your branch." });
        }
        res.status(200).json({ message: "Request has been processed." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get all exam mark rectification requests for the registrar's branch.
 * @route GET /api/registrar/exam-mark-requests
 */
export const getExamMarkRectificationRequestsByBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    try {
        const requests = await prisma.examMarkRectificationRequest.findMany({
            where: { branchId },
            include: { examMark: { select: { score: true } } }, // Include original score
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(requests);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Process an exam mark rectification request, updating the mark if approved.
 * @route PATCH /api/registrar/exam-mark-requests/:id/process
 */
export const processExamMarkRectificationRequest = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (!branchId || !req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }
    if (status !== 'Approved' && status !== 'Rejected') {
        return res.status(400).json({ message: "Invalid status provided." });
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Find the request and ensure it belongs to the registrar's branch.
            const request = await tx.examMarkRectificationRequest.findFirst({
                where: { id, branchId },
            });

            if (!request) {
                throw new Error("Request not found in your branch.");
            }

            // 2. If approved, update the actual exam mark.
            if (status === 'Approved') {
                await tx.examMark.update({
                    where: { id: request.examMarkId },
                    data: { score: request.newScore },
                });
            }

            // 3. Update the request status itself.
            await tx.examMarkRectificationRequest.update({
                where: { id },
                data: { status },
            });
        });

        res.status(200).json({ message: "Exam mark request has been processed." });
    } catch (error: any) {
        if (error.message.includes("not found")) {
            return res.status(404).json({ message: error.message });
        }
        next(error);
    }
};

/**
 * @description Get all fee templates for the registrar's branch.
 * @route GET /api/registrar/fee-templates
 */
export const getFeeTemplates = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    try {
        const templates = await prisma.feeTemplate.findMany({
            where: { branchId },
            orderBy: { gradeLevel: 'asc' }
        });
        res.status(200).json(templates);
    } catch (error) {
        next(error);
    }
};



/**
 * @description Create a new fee template for the registrar's branch.
 * @route POST /api/registrar/fee-templates
 */
export const createFeeTemplate = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    const { name, amount, gradeLevel, monthlyBreakdown } = req.body;
    if (!name || amount === undefined || gradeLevel === undefined) {
        return res.status(400).json({ message: "Name, amount, and gradeLevel are required." });
    }

    try {
        const newTemplate = await prisma.feeTemplate.create({
            data: {
                name,
                amount: parseFloat(amount),
                gradeLevel: parseInt(gradeLevel, 10),
                monthlyBreakdown: monthlyBreakdown || {},
                branchId, // Security: branchId is from the authenticated user, not the body
            },
        });
        res.status(201).json(newTemplate);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Request an update to a fee template by creating a RectificationRequest.
 * @route POST /api/registrar/fee-templates/request-update
 */
export const requestFeeTemplateUpdate = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { templateId, newData, reason } = req.body;

    if (!branchId || !req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }
    if (!templateId || !newData || !reason) {
        return res.status(400).json({ message: "templateId, newData, and reason are required." });
    }

    try {
        // Security Check: Ensure the template belongs to the registrar's branch.
        const template = await prisma.feeTemplate.findFirst({
            where: { id: templateId, branchId }
        });
        if (!template) {
            return res.status(404).json({ message: "Fee template not found in your branch." });
        }

        await prisma.rectificationRequest.create({
            data: {
                branchId,
                teacherId: req.user.id, // Log who made the request
                studentId: "system", // Placeholder as this isn't student-specific
                requestType: 'FEE_TEMPLATE_UPDATE',
                description: `Request to update fee template '${template.name}'. Reason: ${reason}`,
                // You might want to store newData in a specific field if you add it to the schema
                status: 'Pending'
            }
        });

        res.status(200).json({ message: "Update request submitted successfully for review." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Request the deletion of a fee template by creating a RectificationRequest.
 * @route POST /api/registrar/fee-templates/request-deletion
 */
export const requestFeeTemplateDeletion = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { templateId, reason } = req.body;

    if (!branchId || !req.user) {
        return res.status(401).json({ message: "Authentication required." });
    }
    if (!templateId || !reason) {
        return res.status(400).json({ message: "templateId and reason are required." });
    }

    try {
        const template = await prisma.feeTemplate.findFirst({
            where: { id: templateId, branchId }
        });
        if (!template) {
            return res.status(404).json({ message: "Fee template not found in your branch." });
        }

        await prisma.rectificationRequest.create({
            data: {
                branchId,
                teacherId: req.user.id,
                studentId: "system",
                requestType: 'FEE_TEMPLATE_DELETE',
                description: `Request to delete fee template '${template.name}'. Reason: ${reason}`,
                status: 'Pending'
            }
        });
        
        res.status(200).json({ message: "Deletion request submitted successfully for review." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get a list of fee defaulters for a specific class.
 * @route GET /api/registrar/classes/:classId/defaulters
 */
export const getDefaultersForClass = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { classId } = req.params;

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Security Check: Ensure the class belongs to the registrar's branch.
        const schoolClass = await prisma.schoolClass.findFirst({
            where: { id: classId, branchId }
        });
        if (!schoolClass) {
            return res.status(404).json({ message: "Class not found in your branch." });
        }

        const defaulters = await prisma.student.findMany({
            where: {
                classId,
                feeRecords: {
                    some: {
                        paidAmount: { lt: prisma.feeRecord.fields.totalAmount }
                    }
                }
            },
            select: {
                id: true,
                name: true,
                feeRecords: {
                    select: {
                        totalAmount: true,
                        paidAmount: true
                    }
                }
            }
        });

        // Process the data to calculate pending amounts for each student
        const result = defaulters.map(student => {
            const pendingAmount = student.feeRecords.reduce((sum, record) => sum + (record.totalAmount - record.paidAmount), 0);
            return {
                studentId: student.id,
                studentName: student.name,
                pendingAmount: pendingAmount
            };
        });

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get the timetable configuration for a specific class.
 * @route GET /api/registrar/classes/:classId/timetable-config
 */
export const getTimetableConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { classId } = req.params;
  if (!branchId)
    return res.status(401).json({ message: "Authentication required." });

  try {
    // Security: Find config only if classId and branchId match
    const config = await prisma.timetableConfig.findFirst({
      where: { classId, branchId },
    });
    // Note: It's okay if config is null, the frontend is designed to handle this.
    res.status(200).json(config);
  } catch (error) {
    next(error);
  }
};

/**
 * @description Create or update the timetable configuration (time slots) for a class.
 * @route POST /api/registrar/timetable-config
 */
export const createTimetableConfig = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { classId, timeSlots } = req.body;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!classId || !timeSlots) return res.status(400).json({ message: "classId and timeSlots are required." });

    try {
        const schoolClass = await prisma.schoolClass.findFirst({
            where: { id: classId, branchId }
        });
        if (!schoolClass) return res.status(404).json({ message: "Class not found in your branch." });

        const config = await prisma.timetableConfig.upsert({
            // FIX: Use the correct composite key syntax 'field1_field2'
            where: { classId_branchId: { classId, branchId } },
            update: { timeSlots },
            create: { classId, branchId, timeSlots }
        });
        res.status(201).json(config);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get teachers who are not already booked for a specific time slot.
 * @route GET /api/registrar/available-teachers?day=Monday&startTime=09:00
 */
export const getAvailableTeachersForSlot = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { day, startTime } = req.query;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!day || !startTime) return res.status(400).json({ message: "Day and startTime query parameters are required." });

    try {
        // 1. Find all teacher IDs who are ALREADY booked for this slot in this branch.
        const bookedSlots = await prisma.timetableSlot.findMany({
            where: {
                branchId,
                day: day as string,
                startTime: startTime as string,
            },
            select: { teacherId: true }
        });
        const bookedTeacherIds = bookedSlots.map(slot => slot.teacherId);

        // 2. Find all teachers in the branch who are NOT in the booked list.
        const availableTeachers = await prisma.teacher.findMany({
            where: {
                branchId,
                id: { notIn: bookedTeacherIds }
            },
            select: { id: true, name: true }, // Only select necessary fields
            orderBy: { name: 'asc' }
        });
        
        res.status(200).json(availableTeachers);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Create or update a single slot in the timetable.
 * @route POST /api/registrar/timetable-slot
 */
export const setTimetableSlot = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { classId, day, startTime, endTime, subjectId, teacherId, room } =
    req.body;

  if (!branchId)
    return res.status(401).json({ message: "Authentication required." });
  if (!classId || !day || !startTime || !endTime || !subjectId || !teacherId) {
    return res
      .status(400)
      .json({ message: "All fields are required to set a timetable slot." });
  }

  try {
    // DEFINITIVE FIX: This is the correct syntax for a composite unique identifier in Prisma.
    // The key is the field names from the @@unique attribute, joined by underscores.
    const slot = await prisma.timetableSlot.upsert({
      where: {
        class_slot_unique: {
          // Use the name from the @@unique attribute
          branchId,
          classId,
          day,
          startTime,
        },
      },
      update: { endTime, subjectId, teacherId, room },
      create: {
        branchId,
        classId,
        day,
        startTime,
        endTime,
        subjectId,
        teacherId,
        room,
      },
    });
    res.status(201).json(slot);
  } catch (error) {
    // Safely check for the Prisma unique constraint violation code (P2002)
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res
        .status(409)
        .json({
          message:
            "This teacher is already booked for another class at this time.",
        });
    }
    next(error);
  }
};

/**
 * @description Delete a single slot from the timetable.
 * @route DELETE /api/registrar/timetable-slot/:id
 */
export const deleteTimetableSlot = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });

    try {
        // Use deleteMany with a branchId check for multi-tenant security
        const result = await prisma.timetableSlot.deleteMany({
            where: { id, branchId }
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Timetable slot not found in your branch." });
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};


/**
 * @description Get the full timetable (all scheduled slots) for a specific class.
 * @route GET /api/registrar/classes/:classId/timetable
 */
export const getTimetableForClass = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { classId } = req.params;
    if (!branchId) return res.status(401).json({ message: "Authentication required." });

    try {
        const slots = await prisma.timetableSlot.findMany({
            where: { classId, branchId } // Security check
        });
        res.status(200).json(slots);
    } catch (error) {
        next(error);
    }
};




/**
 * @description Get daily attendance for all students in a specific class.
 * @route GET /api/registrar/classes/:classId/attendance?date=YYYY-MM-DD
 */
export const getDailyAttendanceForClass = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { classId } = req.params;
    const { date } = req.query;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!date || typeof date !== 'string') return res.status(400).json({ message: "A valid 'date' query parameter is required." });

    try {
        const schoolClass = await prisma.schoolClass.findFirst({
            where: { id: classId, branchId }
        });
        if (!schoolClass) return res.status(404).json({ message: "Class not found in your branch." });

        const targetDate = new Date(date);
        
        const students = await prisma.student.findMany({
            where: { classId },
            select: { 
                id: true, 
                name: true, 
                attendanceRecords: {
                    where: { date: targetDate }
                } 
            }
        });

        const attendanceReport = students.map(student => ({
            studentId: student.id,
            studentName: student.name,
            status: student.attendanceRecords[0]?.status || 'Present' 
        }));

        res.status(200).json(attendanceReport);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get the attendance status for all teachers for a specific day.
 * @route GET /api/registrar/teacher-attendance?date=YYYY-MM-DD
 */
export const getTeacherAttendance = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { date } = req.query;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!date || typeof date !== 'string') return res.status(400).json({ message: "A valid 'date' query parameter is required." });

    try {
        const targetDate = new Date(date);
        
        const teachers = await prisma.teacher.findMany({
            where: { branchId },
            select: { id: true, name: true }
        });

        const attendanceRecords = await prisma.teacherAttendanceRecord.findMany({
            where: { branchId, date: targetDate }
        });

        const attendanceMap = new Map(attendanceRecords.map(r => [r.teacherId, r.status]));

        const fullAttendance = teachers.map(teacher => ({
            teacherId: teacher.id,
            teacherName: teacher.name,
            status: attendanceMap.get(teacher.id) || 'Not Marked'
        }));

        res.status(200).json(fullAttendance);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Save or update attendance for multiple teachers.
 * @route POST /api/registrar/teacher-attendance
 */
export const saveTeacherAttendance = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { attendanceData } = req.body; // Expects array: [{ teacherId, status, date }]

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!Array.isArray(attendanceData)) return res.status(400).json({ message: "attendanceData must be an array." });

    try {
        const operations = attendanceData.map(record => {
            const recordDate = new Date(record.date);
            return prisma.teacherAttendanceRecord.upsert({
                where: {
                    // FIX: Use the correct composite unique identifier syntax
                    teacherId_date: {
                        teacherId: record.teacherId,
                        date: recordDate
                    }
                },
                update: { status: record.status as TeacherAttendanceStatus },
                create: {
                    teacherId: record.teacherId,
                    date: recordDate,
                    status: record.status as TeacherAttendanceStatus,
                    branchId // Security: Ensure created records belong to the branch
                }
            });
        });

        await prisma.$transaction(operations);

        res.status(200).json({ message: "Teacher attendance saved successfully." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get the leave settings for the registrar's branch.
 * @route GET /api/registrar/leave-settings
 */
export const getLeaveSettingsForBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    
    try {
        const settings = await prisma.leaveSettings.findUnique({
            where: { branchId }
        });
        
        res.status(200).json(settings || {
            // Provide default values if no settings are found in the DB
            branchId, defaultStudentSick: 10, defaultStudentCasual: 5,
            defaultTeacherSick: 12, defaultTeacherCasual: 10,
            defaultStaffSick: 12, defaultStaffCasual: 7
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Create or update the leave settings for the registrar's branch.
 * @route PATCH /api/registrar/leave-settings
 */
export const updateLeaveSettingsForBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) return res.status(401).json({ message: "Authentication required." });

    try {
        const settings = await prisma.leaveSettings.upsert({
            where: { branchId },
            update: req.body,
            create: { ...req.body, branchId }
        });
        res.status(200).json(settings);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get all leave applications for the registrar's branch (students and staff).
 * @route GET /api/registrar/leave-applications
 */
export const getLeaveApplicationsForRegistrar = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    
    try {
        const applications = await prisma.leaveApplication.findMany({
            where: { applicant: { branchId } },
            include: { applicant: { select: { name: true, role: true } } },
            orderBy: { fromDate: 'desc' }
        });
        res.status(200).json(applications);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Process a leave application (approve or reject).
 * @route PATCH /api/registrar/leave-applications/:id/process
 */
export const processLeaveApplication = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (status !== 'Approved' && status !== 'Rejected') return res.status(400).json({ message: "Invalid status." });

    try {
        const result = await prisma.leaveApplication.updateMany({
            where: {
                id,
                applicant: { branchId } // Security check
            },
            data: { status }
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Leave application not found in your branch." });
        }
        
        res.status(200).json({ message: "Application processed successfully." });
    } catch (error) {
        next(error);
    }
};




// --- Hostel Management ---

/**
 * @description Get all hostels for the registrar's branch.
 * @route GET /api/registrar/hostels
 */
export const getHostels = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    try {
        const hostels = await prisma.hostel.findMany({
            where: { branchId },
            include: { _count: { select: { rooms: true } } } // Include room count for context
        });
        res.status(200).json(hostels);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Create a new hostel in the registrar's branch.
 * @route POST /api/registrar/hostels
 */
export const createHostel = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }
    const { name, warden } = req.body;
    if (!name || !warden) {
        return res.status(400).json({ message: "Hostel name and warden are required." });
    }

    try {
        const newHostel = await prisma.hostel.create({
            data: {
                name,
                warden,
                branchId, // Security: branchId is from the token, not the request body
            },
        });
        res.status(201).json(newHostel);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Update a hostel's details.
 * @route PATCH /api/registrar/hostels/:id
 */
export const updateHostel = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { name, warden } = req.body;

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Security: Use updateMany to ensure the update only happens if the hostel is in the correct branch.
        const result = await prisma.hostel.updateMany({
            where: { id, branchId },
            data: { name, warden },
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Hostel not found in your branch." });
        }
        res.status(200).json({ message: "Hostel updated successfully." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Delete a hostel, only if it contains no rooms.
 * @route DELETE /api/registrar/hostels/:id
 */
export const deleteHostel = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Integrity Check: Find the hostel and check if it has rooms.
        const hostel = await prisma.hostel.findFirst({
            where: { id, branchId },
            include: { _count: { select: { rooms: true } } }
        });

        if (!hostel) {
            return res.status(404).json({ message: "Hostel not found in your branch." });
        }
        if (hostel._count.rooms > 0) {
            return res.status(400).json({ message: `Cannot delete hostel. It still contains ${hostel._count.rooms} rooms.` });
        }

        await prisma.hostel.delete({ where: { id } });
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

/**
 * @description Get all rooms for a specific hostel.
 * @route GET /api/registrar/hostels/:id/rooms
 */
export const getRooms = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params; // Hostel ID

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Security Check: Ensure the parent hostel belongs to the registrar's branch.
        const hostel = await prisma.hostel.findFirst({
            where: { id, branchId }
        });
        if (!hostel) {
            return res.status(404).json({ message: "Hostel not found in your branch." });
        }
        
        const rooms = await prisma.room.findMany({
            where: { hostelId: id }
        });
        res.status(200).json(rooms);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Assign a student to a specific hostel room.
 * @route PATCH /api/registrar/rooms/:roomId/assign-student
 */
export const assignStudentToRoom = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { roomId } = req.params;
    const { studentId } = req.body;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!studentId) return res.status(400).json({ message: "studentId is required." });

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Security Check: Verify both the student and the room's hostel are in the same branch.
            const student = await tx.student.findFirst({ where: { id: studentId, branchId } });
            if (!student) throw new Error("Student not found in your branch.");

            const room = await tx.room.findFirst({
                where: { id: roomId, hostel: { branchId } },
                include: { _count: { select: { occupants: true } } } // Check capacity
            });
            if (!room) throw new Error("Room not found in your branch.");
            
            // 2. Business Logic: Check if the room is full.
            if (room._count.occupants >= room.capacity) {
                throw new Error("This room is already at full capacity.");
            }

            // 3. Perform the assignment.
            await tx.student.update({
                where: { id: studentId },
                data: { roomId: roomId }
            });
        });
        res.status(200).json({ message: "Student assigned to room successfully." });
    } catch (error: any) {
        if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
        if (error.message.includes("capacity")) return res.status(409).json({ message: error.message }); // 409 Conflict
        next(error);
    }
};

/**
 * @description Remove a student from any room they are currently in.
 * @route PATCH /api/registrar/students/:studentId/remove-from-room
 */
export const removeStudentFromRoom = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { studentId } = req.params;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    
    try {
        // Security: Use updateMany scoped by branchId to unassign the student.
        const result = await prisma.student.updateMany({
            where: { id: studentId, branchId },
            data: { roomId: null }
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Student not found in your branch." });
        }
        res.status(200).json({ message: "Student removed from room." });
    } catch (error) {
        next(error);
    }
};


// --- Transport Management ---

/**
 * @description Get all transport routes for the registrar's branch.
 * @route GET /api/registrar/transport-routes
 */
export const getTransportRoutes = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    try {
        const routes = await prisma.transportRoute.findMany({
            where: { branchId },
            include: { _count: { select: { busStops: true } } }
        });
        res.status(200).json(routes);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Create a new transport route in the registrar's branch.
 * @route POST /api/registrar/transport-routes
 */
export const createTransportRoute = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }
    const { routeName, busNumber, driverName, capacity } = req.body;
    if (!routeName || !busNumber || !driverName || !capacity) {
        return res.status(400).json({ message: "All fields are required." });
    }

    try {
        const newRoute = await prisma.transportRoute.create({
            data: {
                ...req.body,
                capacity: parseInt(capacity, 10),
                branchId, // Security: Enforce branchId from token
            },
        });
        res.status(201).json(newRoute);
    } catch (error) {
        next(error);
    }
};






// --- Transport Management ---

/**
 * @description Update a transport route's details.
 * @route PATCH /api/registrar/transport-routes/:id
 */
export const updateTransportRoute = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { routeName, busNumber, driverName, capacity } = req.body;
    
    if (!branchId) return res.status(401).json({ message: "Authentication required." });

    try {
        const result = await prisma.transportRoute.updateMany({
            where: { id, branchId }, // Security: Scoped to the registrar's branch
            data: { 
                routeName, 
                busNumber, 
                driverName, 
                capacity: capacity ? parseInt(capacity, 10) : undefined 
            },
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Transport route not found in your branch." });
        }
        res.status(200).json({ message: "Route updated successfully." });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Delete a transport route, only if no members are assigned.
 * @route DELETE /api/registrar/transport-routes/:id
 */
export const deleteTransportRoute = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });

    try {
        // Integrity Check: Verify no students or teachers are assigned to this route before deleting.
        const [studentCount, teacherCount] = await prisma.$transaction([
            prisma.student.count({ where: { transportRouteId: id, branchId } }),
            prisma.teacher.count({ where: { transportRouteId: id, branchId } }),
        ]);

        if (studentCount > 0 || teacherCount > 0) {
            return res.status(400).json({ message: `Cannot delete route. ${studentCount + teacherCount} members are still assigned.` });
        }
        
        // Security: Use deleteMany to ensure route belongs to the branch
        const result = await prisma.transportRoute.deleteMany({
            where: { id, branchId }
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Transport route not found in your branch." });
        }
        res.status(204).send();

    } catch (error) {
        next(error);
    }
};

/**
 * @description Get students and teachers in the branch who are not assigned to any transport route.
 * @route GET /api/registrar/transport/unassigned-members
 */
export const getUnassignedMembers = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) return res.status(401).json({ message: "Authentication required." });

    try {
        const [students, teachers] = await prisma.$transaction([
            prisma.student.findMany({
                where: { branchId, transportRouteId: null },
                select: { id: true, name: true }
            }),
            prisma.teacher.findMany({
                where: { branchId, transportRouteId: null },
                select: { id: true, name: true }
            })
        ]);

        const members = [
            ...students.map(s => ({ ...s, type: 'Student' })),
            ...teachers.map(t => ({ ...t, type: 'Teacher' }))
        ].sort((a, b) => a.name.localeCompare(b.name));

        res.status(200).json(members);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Assign a member (Student or Teacher) to a specific bus stop on a transport route.
 * @route POST /api/registrar/transport/assign-member
 */
export const assignMemberToRoute = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { routeId, memberId, memberType, stopId } = req.body;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!routeId || !memberId || !memberType || !stopId) {
        return res.status(400).json({ message: "routeId, memberId, memberType, and stopId are required." });
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Security Check: Verify the route and stop belong to the registrar's branch.
            const route = await tx.transportRoute.findFirst({ where: { id: routeId, branchId } });
            if (!route) throw new Error("Transport route not found in your branch.");

            const stop = await tx.busStop.findFirst({ where: { id: stopId, routeId: route.id } });
            if (!stop) throw new Error("Bus stop does not belong to the specified route.");

            // 2. Based on memberType, update the correct model, ensuring the member is also in the same branch.
            if (memberType === 'Student') {
                const result = await tx.student.updateMany({
                    where: { id: memberId, branchId },
                    data: { transportRouteId: routeId, busStopId: stopId }
                });
                if (result.count === 0) throw new Error("Student not found in your branch.");
            } else if (memberType === 'Teacher') {
                const result = await tx.teacher.updateMany({
                    where: { id: memberId, branchId },
                    data: { transportRouteId: routeId, busStopId: stopId }
                });
                if (result.count === 0) throw new Error("Teacher not found in your branch.");
            } else {
                throw new Error("Invalid memberType specified.");
            }
        });
        res.status(200).json({ message: "Member assigned to route successfully." });
    } catch (error: any) {
        if (error.message.includes("not found")) return res.status(404).json({ message: error.message });
        if (error.message.includes("Invalid memberType")) return res.status(400).json({ message: error.message });
        next(error);
    }
};

/**
 * @description Remove a member from their assigned transport route.
 * @route POST /api/registrar/transport/remove-member
 */
export const removeMemberFromRoute = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { memberId, memberType } = req.body; // memberType is optional but good for clarity

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!memberId) return res.status(400).json({ message: "memberId is required." });

    try {
        // Atomically unassign from any route they might be on, scoped by branch
        await prisma.$transaction([
            prisma.student.updateMany({
                where: { id: memberId, branchId },
                data: { transportRouteId: null, busStopId: null }
            }),
            prisma.teacher.updateMany({
                where: { id: memberId, branchId },
                data: { transportRouteId: null, busStopId: null }
            })
        ]);
        res.status(200).json({ message: "Member removed from route successfully." });
    } catch (error) {
        next(error);
    }
};

// --- Inventory Management ---

/**
 * @description Get all inventory items for the registrar's branch.
 * @route GET /api/registrar/inventory
 */
export const getInventory = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }
    try {
        const inventory = await prisma.inventoryItem.findMany({
            where: { branchId },
            orderBy: { name: 'asc' }
        });
        res.status(200).json(inventory);
    } catch (error) {
        next(error);
    }
};




/**
 * @description Get all inventory logs for the registrar's branch, with item details.
 * @route GET /api/registrar/inventory/logs
 */
export const getInventoryLogs = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    try {
        const logs = await prisma.inventoryLog.findMany({
            where: { item: { branchId: branchId } }, // Security: Filter logs by the item's branch
            include: {
                item: { // Include item name for context
                    select: { name: true }
                }
            },
            orderBy: { timestamp: 'desc' }
        });
        res.status(200).json(logs);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Create a new inventory item and log the initial stock.
 * @route POST /api/registrar/inventory/items
 */
export const createInventoryItem = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId || !req.user?.name) { // Also check for user's name for logging
        return res.status(401).json({ message: "Authentication required with a valid branch." });
    }
    
    const { name, category, quantity, location, reason } = req.body;
    if (!name || !category || quantity === undefined || !location) {
        return res.status(400).json({ message: "Name, category, quantity, and location are required." });
    }

    try {
        // Use a transaction to create the item and its initial log entry together.
        const newItem = await prisma.$transaction(async (tx) => {
            const item = await tx.inventoryItem.create({
                data: {
                    name,
                    category,
                    quantity: parseInt(quantity, 10),
                    location,
                    branchId // Security: branchId from token
                }
            });

            await tx.inventoryLog.create({
                data: {
                    itemId: item.id,
                    change: item.quantity,
                    reason: reason || "Initial stock",
                    user: req.user!.name, // Audit Log: Record which user performed the action
                }
            });

            return item;
        });
        
        res.status(201).json(newItem);
    } catch (error) {
        next(error);
    }
};

/**
 * @description Update an inventory item's quantity and log the change.
 * @route PATCH /api/registrar/inventory/items/:id
 */
export const updateInventoryItem = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;
    const { quantity, reason } = req.body;

    if (!branchId || !req.user?.name) {
        return res.status(401).json({ message: "Authentication required." });
    }
    if (quantity === undefined || !reason) {
        return res.status(400).json({ message: "New quantity and a reason for the change are required." });
    }

    try {
        const updatedItem = await prisma.$transaction(async (tx) => {
            // 1. Security Check: Find the item within the registrar's branch.
            const existingItem = await tx.inventoryItem.findFirst({
                where: { id, branchId }
            });
            if (!existingItem) {
                throw new Error("Inventory item not found in your branch.");
            }

            const newQuantity = parseInt(quantity, 10);
            const change = newQuantity - existingItem.quantity;

            // 2. If there's a change, update the item and create a log.
            if (change !== 0) {
                const updated = await tx.inventoryItem.update({
                    where: { id },
                    data: { quantity: newQuantity }
                });

                await tx.inventoryLog.create({
                    data: {
                        itemId: id,
                        change: change,
                        reason: reason,
                        user: req.user!.name,
                    }
                });
                return updated;
            }
            return existingItem; // Return the existing item if no change occurred
        });

        res.status(200).json(updatedItem);
    } catch (error: any) {
        if (error.message.includes("not found")) {
            return res.status(404).json({ message: error.message });
        }
        next(error);
    }
};

/**
 * @description Delete an inventory item, only if it has no history.
 * @route DELETE /api/registrar/inventory/items/:id
 */
export const deleteInventoryItem = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id } = req.params;

    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        // Integrity Check: To preserve audit history, we should prevent deletion of items that have logs.
        const logCount = await prisma.inventoryLog.count({
            where: { itemId: id, item: { branchId } }
        });

        // Allowing deletion only if it's just the initial stock log.
        if (logCount > 1) {
            return res.status(400).json({ message: "Cannot delete item. It has a history of changes. Consider setting quantity to 0 instead." });
        }
        
        await prisma.$transaction(async (tx) => {
            // First delete the logs, then the item.
            await tx.inventoryLog.deleteMany({ where: { itemId: id } });
            
            // Use deleteMany for security, ensuring the item is in the correct branch.
            const result = await tx.inventoryItem.deleteMany({
                where: { id, branchId }
            });

            if (result.count === 0) {
                throw new Error("Inventory item not found in your branch.");
            }
        });

        res.status(204).send();
    } catch (error: any) {
        if (error.message.includes("not found")) {
            return res.status(404).json({ message: error.message });
        }
        next(error);
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


export const getStudentsForBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Unauthorized." });
    }
    try {
        const students = await prisma.student.findMany({
            where: { branchId },
            orderBy: { name: 'asc' }
        });
        res.status(200).json(students);
    } catch (error) {
        next(error);
    }
};

export const getAttendanceRecordsForBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Unauthorized." });
    }
    try {
        const records = await prisma.attendanceRecord.findMany({
            where: { student: { branchId: branchId } },
            orderBy: { date: 'desc' }
        });
        res.status(200).json(records);
    } catch (error) {
        next(error);
    }
};

export const getSuspensionRecordsForBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Unauthorized." });
    }
    try {
        const records = await prisma.suspensionRecord.findMany({
            where: { student: { branchId: branchId } },
            orderBy: { startDate: 'desc' }
        });
        res.status(200).json(records);
    } catch (error) {
        next(error);
    }
};

export const getFeeRecordsForBranch = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Unauthorized." });
    }
    try {
        const records = await prisma.feeRecord.findMany({
            where: { student: { branchId: branchId } },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(records);
    } catch (error) {
        next(error);
    }
};


export const createSubject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name, teacherId } = req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ message: "Subject name is required." });
  }

  try {
    const newSubject = await prisma.subject.create({
      data: {
        name: name.trim(),
        // Conditionally add teacherId only if it was provided and not an empty string
        ...(teacherId && { teacherId: teacherId }),
        // Note: Add branchId here if your Subject model requires it
      },
    });
    res.status(201).json(newSubject);
  } catch (error) {
    next(error);
  }
};