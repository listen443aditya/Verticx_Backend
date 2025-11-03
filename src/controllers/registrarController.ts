// src/controllers/registrarController.ts
import { Request, Response, NextFunction} from "express";
// import { registrarApiService } from "../services";
import prisma from "../prisma";
import {
  Prisma,
  FeePayment,
  Student,
  UserRole,
  FeeAdjustment,
  TeacherAttendanceStatus,
  Examination,
  ExamStatus, 
  ExamResultStatus,
} from "@prisma/client"; 
import { generatePassword } from "../utils/helpers"; 
import bcrypt from "bcryptjs";

import { getBranchId } from "../utils/authUtils";
interface TeacherUpdatePayload {
  name?: string;
  email?: string;
  phone?: string | null;
  qualification?: string;
  salary?: number;
  subjectIds?: string[];

  bloodGroup?: string;
  alternatePhone?: string;
  address?: string;
  governmentDocNumber?: string;
  fatherName?: string;
  motherName?: string;
  gender?: string; // (You may want to add any other editable fields)
  doj?: string | Date;
  status?: string;
}
interface SupportStaffUpdatePayload {
  name?: string;
  email?: string;
  phone?: string | null;
  designation?: string | null;
  status?: string | null; // Or use your specific status enum/type if available
  salary?: number; // Add salary here
}
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
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  const { userId } = req.params; // This is the ID of the user to get details for

  try {
    // 1. Fetch the basic user data
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        branchId: branchId,
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

    // 2. Fetch the branch's leave settings
    let settings = await prisma.leaveSettings.findUnique({
      where: { branchId },
    });

    // --- THIS IS THE FIX ---
    // If no settings are found in the DB, create a default fallback object
    // This logic now *matches* your getLeaveSettingsForBranch function
    if (!settings) {
      settings = {
        id: "default", // Placeholder ID
        branchId: branchId,
        defaultStudentSick: 10,
        defaultStudentCasual: 5,
        defaultTeacherSick: 12,
        defaultTeacherCasual: 10,
        defaultStaffSick: 12,
        defaultStaffCasual: 7,
      } as any; // Use 'as any' to satisfy type, since we're creating a partial object
    }
    // --- END OF FIX ---

    // 3. Fetch all of this user's *approved* leave applications
    const approvedLeaves = await prisma.leaveApplication.findMany({
      where: {
        applicantId: user.id,
        status: "Approved",
      },
    });

    // 4. Calculate total leave days used
    const usedLeaves = { sick: 0, casual: 0 };
    approvedLeaves.forEach((app) => {
      let daysUsed = 0.5; // Default for half-day
      if (!app.isHalfDay) {
        const start = new Date(app.fromDate);
        const end = new Date(app.toDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        daysUsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
      }

      const type = app.leaveType.toLowerCase();
      if (type === "sick") {
        usedLeaves.sick += daysUsed;
      } else if (type === "casual") {
        usedLeaves.casual += daysUsed;
      }
    });

    // 5. Determine total available leaves based on user's role
    // This logic is now safe because 'settings' will always be an object
    const totalLeaves = { sick: 0, casual: 0 };
   if (settings) {
     if (user.role === "Student") {
       totalLeaves.sick = settings.defaultStudentSick;
       totalLeaves.casual = settings.defaultStudentCasual;
     } else if (user.role === "Teacher") {
       totalLeaves.sick = settings.defaultTeacherSick;
       totalLeaves.casual = settings.defaultTeacherCasual;
     } else if (
       ["Registrar", "Librarian", "SupportStaff"].includes(user.role)
     ) {
       totalLeaves.sick = settings.defaultStaffSick;
       totalLeaves.casual = settings.defaultStaffCasual;
     }
   }

    // 6. Calculate remaining balances
    const leaveBalances = {
      sick: totalLeaves.sick - usedLeaves.sick, // Will now be 12 - 10 = 2
      casual: totalLeaves.casual - usedLeaves.casual,
    };

    // 7. Send the complete object to the frontend
    res.status(200).json({
      ...user,
      leaveBalances: leaveBalances, // Attach the calculated balances
    });
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

  // Validate that the user is authenticated and associated with a branch
  if (!branchId) {
    return res
      .status(401)
      .json({ message: "Authentication required with a valid branch." });
  }

  try {
    // Fetch all applications for the given branch, ordered by most recent
    const applications = await prisma.admissionApplication.findMany({
      where: {
        branchId: branchId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json(applications);
  } catch (error) {
    // Pass any database errors to the global error handler
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


export const admitStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { applicationId, studentData } = req.body;

  try {
    let applicantName: string;
    let gradeLevel: number;
    let guardianInfo: { name: string; email: string; phone: string };
    let studentEmail: string | undefined; // Optional email for student

    if (applicationId) {
      // --- Admitting from Application ---
      const application = await prisma.admissionApplication.findFirst({
        where: { id: applicationId, branchId, status: "Approved" },
      });
      if (!application) {
        return res
          .status(404)
          .json({ message: "Approved application not found." });
      }
      applicantName = application.applicantName;
      gradeLevel = application.gradeLevel;
      // Use guardian info from application if available, else default
      guardianInfo = {
        name: application.guardianName || `${applicantName}'s Guardian`,
        email: application.guardianEmail || "", // Use real email if available
        phone: application.guardianPhone || "", // Use real phone if available
      };
      // studentEmail = application.studentEmail; // Use if application collects student email

      await prisma.admissionApplication.update({
        where: { id: applicationId },
        data: { status: "Admitted" },
      });
    } else if (studentData) {
      // --- Direct Admission ---
      if (!studentData.name || !studentData.gradeLevel) {
        return res
          .status(400)
          .json({ message: "Student name and grade level are required." });
      }
      applicantName = studentData.name;
      gradeLevel = studentData.gradeLevel;
      guardianInfo = studentData.guardianInfo || {
        name: `${applicantName}'s Guardian`,
        email: "",
        phone: "",
      };
      // studentEmail = studentData.email; // Use if form collects student email
    } else {
      return res
        .status(400)
        .json({
          message: "Request must include either applicationId or studentData.",
        });
    }

    // --- Generate Credentials ---
    const parentPassword = generatePassword();
    const studentPassword = generatePassword(); // Generate password for student user
    const studentUserId = `VRTX-STU-${Date.now().toString().slice(-6)}`; // Generate student userId

    // --- Create Records in Transaction ---
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Parent User (as before)
      const parentUser = await tx.user.create({
        data: {
          email:
            guardianInfo.email ||
            `parent_${applicantName
              .replace(/\s+/g, ".")
              .toLowerCase()}${Date.now().toString().slice(-4)}@school.com`,
          passwordHash: await bcrypt.hash(parentPassword, 10),
          userId: `VRTX-PAR-${Date.now().toString().slice(-6)}`,
          name: guardianInfo.name,
          role: "Parent",
          branchId,
          phone: guardianInfo.phone || undefined, // Add phone if available
        },
      });

      // 2. Create Student User <-- NEW
      const studentUser = await tx.user.create({
        data: {
          // Use student email if provided, otherwise generate a placeholder
          email:
            studentEmail ||
            `stu_${applicantName.replace(/\s+/g, ".").toLowerCase()}${Date.now()
              .toString()
              .slice(-4)}@school.com`,
          passwordHash: await bcrypt.hash(studentPassword, 10),
          userId: studentUserId, // Use the generated student userId
          name: applicantName,
          role: "Student", // Set role to Student
          branchId,
          status: "active", // Set initial status
        },
      });

      // 3. Create Student Record, linking Parent AND Student User <-- MODIFIED
      const student = await tx.student.create({
        data: {
          name: applicantName,
          gradeLevel,
          branchId,
          parentId: parentUser.id,
          userId: studentUser.id,
          status: "active",

          // --- EXISTING OPTIONAL FIELDS ---
          ...(studentData?.dob && { dob: new Date(studentData.dob) }),
          ...(studentData?.address && { address: studentData.address }),
          ...(studentData?.gender && { gender: studentData.gender }),
          ...(studentData?.classId && { classId: studentData.classId }),
          guardianInfo: studentData?.guardianInfo
            ? studentData.guardianInfo
            : undefined,

          // --- ADD THESE NEW OPTIONAL FIELDS ---
          ...(studentData?.admissionNumber && {
            admissionNumber: studentData.admissionNumber,
          }),
          ...(studentData?.dateOfAdmission && {
            dateOfAdmission: new Date(studentData.dateOfAdmission),
          }),
          ...(studentData?.classRollNumber && {
            classRollNumber: studentData.classRollNumber,
          }),
          ...(studentData?.bloodGroup && {
            bloodGroup: studentData.bloodGroup,
          }),
          ...(studentData?.guardianRelation && {
            guardianRelation: studentData.guardianRelation,
          }),
          ...(studentData?.isDisabled && {
            isDisabled: studentData.isDisabled,
          }),
          ...(studentData?.religion && { religion: studentData.religion }),
          ...(studentData?.category && { category: studentData.category }), // This will pass "General", "OBC", etc.
          ...(studentData?.fatherName && {
            fatherName: studentData.fatherName,
          }),
          ...(studentData?.motherName && {
            motherName: studentData.motherName,
          }),
          ...(studentData?.governmentDocNumber && {
            governmentDocNumber: studentData.governmentDocNumber,
          }),
        },
      });

      // Return both sets of credentials
      return {
        student, // Return the created student record if needed
        credentials: {
          parent: { userId: parentUser.userId, password: parentPassword },
          student: { userId: studentUser.userId, password: studentPassword }, // Return student credentials
        },
      };
    });

    // Send back both credentials
    res.status(201).json({
      message: "Student admitted successfully.",
      credentials: result.credentials, // Send the object containing both parent and student
    });
  } catch (error) {
    next(error);
  }
};


export const submitFacultyApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  // 1. Destructure ALL fields from the body
  const {
    name,
    email,
    phone,
    qualification,
    subjectIds,
    gender,
    doj,
    bloodGroup,
    alternatePhone,
    address,
    governmentDocNumber,
    fatherName,
    motherName,
  } = req.body;

  // 2. Keep the original validation for essential fields
  if (!name || !email || !phone || !qualification) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    // 3. Create the application with all the new data
    await prisma.facultyApplication.create({
      data: {
        name,
        email,
        phone,
        qualification,
        branchId, // Security
        subjectIds: subjectIds || [],
        gender: gender,
        doj: doj ? new Date(doj) : null,
        bloodGroup: bloodGroup,
        alternatePhone: alternatePhone,
        address: address,
        governmentDocNumber: governmentDocNumber,
        fatherName: fatherName,
        motherName: motherName,
      },
    });
    res
      .status(201)
      .json({ message: "Faculty application submitted successfully." });
  } catch (error) {
    next(error);
  }
};


export const getUnifiedApplications = async (
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
    // 1. Fetch student applications in a standardized format
    const studentApps = await prisma.admissionApplication.findMany({
      where: { branchId },
      select: {
        id: true,
        applicantName: true,
        gradeLevel: true,
        status: true,
        createdAt: true,
      },
    });

    // 2. Fetch faculty applications in a standardized format
    const facultyApps = await prisma.facultyApplication.findMany({
      where: { branchId },
      select: {
        id: true,
        name: true, // Note: field is 'name', not 'applicantName'
        qualification: true,
        status: true,
        createdAt: true, // You may need to add this field to your FacultyApplication schema
      },
    });

    // 3. Map both lists into a common structure
    const unifiedList = [
      ...studentApps.map((app) => ({
        id: app.id,
        applicantName: app.applicantName,
        type: "Student",
        details: `Grade ${app.gradeLevel}`,
        status: app.status,
        createdAt: app.createdAt,
      })),
      ...facultyApps.map((app) => ({
        id: app.id,
        applicantName: app.name, // Standardize to 'applicantName'
        type: "Faculty",
        details: app.qualification,
        status: app.status,
        createdAt: app.createdAt,
      })),
    ];

    // 4. Sort the combined list by date
    const sortedList = unifiedList.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    res.status(200).json(sortedList);
  } catch (error) {
    next(error);
  }
};


export const getClassFeeSummaries = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Get all classes for the registrar's branch
    const classes = await prisma.schoolClass.findMany({
      where: { branchId },
      select: { id: true, gradeLevel: true, section: true },
    });

    // 2. Process each class to calculate its fee summary in parallel
    const summaries = await Promise.all(
      classes.map(async (sClass) => {
        // Find all student IDs for the current class
        const studentsInClass = await prisma.student.findMany({
          where: { classId: sClass.id },
          select: { id: true },
        });
        const studentIds = studentsInClass.map((s) => s.id);
        const studentCount = studentIds.length;
        // If the class has no students, return a zero-value summary
        if (studentIds.length === 0) {
          return {
            classId: sClass.id,
            className: `Grade ${sClass.gradeLevel} - ${sClass.section}`,
            totalBilled: 0,
            totalCollected: 0,
            totalPending: 0,
            defaulterCount: 0,
            studentCount: 0,
          };
        }

        // 3. Aggregate the total and paid amounts for all students in the class
        const feeTotals = await prisma.feeRecord.aggregate({
          where: { studentId: { in: studentIds } },
          _sum: {
            totalAmount: true,
            paidAmount: true,
          },
        });

        // 4. Count how many students have outstanding fees (defaulters)
        const defaulterResult = await prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(DISTINCT "studentId")
            FROM "FeeRecord"
            WHERE "studentId" IN (${Prisma.join(studentIds)})
            AND "totalAmount" > "paidAmount"
        `;
        const defaulterCount = Number(defaulterResult[0]?.count || 0);

        const totalBilled = feeTotals._sum.totalAmount || 0;
        const totalCollected = feeTotals._sum.paidAmount || 0;

        return {
          classId: sClass.id,
          className: `Grade ${sClass.gradeLevel} - ${sClass.section}`,
          totalBilled,
          totalCollected,
          totalPending: totalBilled - totalCollected,
          defaulterCount: defaulterCount,
          studentCount: studentCount,
        };
      })
    );

    res.status(200).json(summaries);
  } catch (error) {
    next(error);
  }
};


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



export const deleteStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // One single, fast, and safe operation.
    // The database will automatically delete all related records.
    await prisma.student.delete({
      where: {
        id: id,
        branchId: branchId, // Security check still works
      },
    });

    res.status(204).send();
  } catch (error: any) {
    if (error.code === "P2025") {
      // "Record not found"
      return res
        .status(404)
        .json({ message: "Student not found in your branch." });
    }
    next(error);
  }
};

export const getExaminations = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const examinations = await prisma.examination.findMany({
      where: {
        branchId: branchId,
      },
      orderBy: {
        startDate: "desc",
      },
    });
    res.status(200).json(examinations);
  } catch (error) {
    next(error);
  }
};

export const createExamination = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { name, startDate, endDate } = req.body;

  if (!name || !startDate || !endDate) {
    return res
      .status(400)
      .json({ message: "Name, Start Date, and End Date are required." });
  }

  // --- THIS IS THE FIX YOU SUGGESTED ---
  const now = new Date();
  const start = new Date(startDate); // The start of the exam day (e.g., 00:00:00)
  const end = new Date(endDate); // The start of the end day

  // To make the 'end' date inclusive, set it to the end of that day
  end.setHours(23, 59, 59, 999);

  let calculatedStatus: ExamStatus;

  if (now > end) {
    // If 'now' is already past the end of the exam's last day
    calculatedStatus = ExamStatus.Completed;
  } else if (now >= start) {
    // If 'now' is after the start, but not after the end, it's ONGOING
    calculatedStatus = ExamStatus.Ongoing;
  } else {
    // Otherwise, it must be in the future
    calculatedStatus = ExamStatus.Upcoming;
  }
  // --- END OF FIX ---

  try {
    const newExamination = await prisma.examination.create({
      data: {
        name: name,
        startDate: new Date(startDate), // Store the clean date
        endDate: new Date(endDate), // Store the clean date
        branchId: branchId,

        // Use the dynamically calculated status
        status: calculatedStatus,

        // This default is still correct
        resultStatus: ExamResultStatus.Pending,
      },
    });
    res.status(201).json(newExamination);
  } catch (error) {
    next(error);
  }
};


export const createExamSchedule = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // FIX 1: Use your helper to get branchId
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const {
      examinationId,
      classId,
      subjectId,
      date,
      startTime,
      endTime,
      room,
      totalMarks,
    } = req.body;

    // FIX 2: Use your JSON response pattern for validation
    if (
      !examinationId ||
      !classId ||
      !subjectId ||
      !date ||
      !startTime ||
      !endTime ||
      !totalMarks
    ) {
      return res
        .status(400)
        .json({ message: "Missing required fields for exam schedule." });
    }

    // 3. Create the new exam schedule in the database
    const newSchedule = await prisma.examSchedule.create({
      data: {
        examinationId,
        classId,
        subjectId,
        date: new Date(date), // Ensure date is stored as a Date object
        startTime,
        endTime,
        room,
        totalMarks: Number(totalMarks),
        branchId, 
      },
    });

    // 4. Send the successful response
    res.status(201).json({
      status: "success",
      data: {
        schedule: newSchedule,
      },
    });
  } catch (error) {
    // Pass any errors to your global error handler
    next(error);
  }
};


export const getExamSchedulesForExamination = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // FIX 1: Use your helper to get branchId
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Get the examinationId from the URL parameters
    const { examinationId } = req.params;

    // 2. Find all schedules that match BOTH the examination and the branch
    const schedules = await prisma.examSchedule.findMany({
      where: {
        examinationId: examinationId,
        branchId: branchId, // Security check
      },
      // Optional: Sort them logically
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // 3. Send the successful response
    res.status(200).json({
      status: "success",
      results: schedules.length,
      data: {
        schedules: schedules,
      },
    });
  } catch (error) {
    next(error);
  }
};


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


export const getAllRoomsByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Get all rooms that belong to hostels in the registrar's branch
    const rooms = await prisma.room.findMany({
      where: {
        hostel: {
          branchId: branchId,
        },
      },
    });

    // 2. Get all students who are assigned to *any* of these rooms
    const studentsInHostels = await prisma.student.findMany({
      where: {
        roomId: { in: rooms.map((r) => r.id) },
        branchId: branchId, // Security check
      },
      select: {
        id: true,
        roomId: true,
      },
    });

    // 3. Map the students back to their rooms to create the 'occupantIds' array
    //    that your 'HostelManagement.tsx' component expects.
    const roomsWithOccupants = rooms.map((room) => {
      const occupantIds = studentsInHostels
        .filter((s) => s.roomId === room.id)
        .map((s) => s.id);

      return {
        ...room,
        occupantIds: occupantIds, // This now matches your frontend's type
      };
    });

    res.status(200).json(roomsWithOccupants);
  } catch (error) {
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
export const updateStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id: studentId } = req.params; // Get the student's ID from the URL

  // 1. Explicitly "whitelist" the fields you allow to be updated from the form.
  const {
    name,
    classId,
    dob, // This will be a string like "2025-10-02"
    address,
    gender,
    guardianInfo,
    status,
  } = req.body;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  // 2. Create a clean updateData object for Prisma
  const updateData: Prisma.StudentUpdateInput = {};

  // Conditionally add fields to the update object if they were provided
  if (name !== undefined) updateData.name = name;
  if (classId !== undefined) updateData.class = { connect: { id: classId } };
  if (address !== undefined) updateData.address = address;
  if (gender !== undefined) updateData.gender = gender;
  if (guardianInfo !== undefined) updateData.guardianInfo = guardianInfo;
  if (status !== undefined) updateData.status = status;

  // 3. THIS IS THE FIX:
  // Convert the 'dob' string into a valid JavaScript Date object
  if (dob) {
    updateData.dob = new Date(dob);
  }

  try {
    // 4. Update the student record securely, ensuring it's in the registrar's branch
    const updatedStudent = await prisma.student.update({
      where: {
        id: studentId,
        branchId: branchId, // Security check
      },
      data: updateData,
    });

    res
      .status(200)
      .json({
        message: "Student updated successfully.",
        student: updatedStudent,
      });
  } catch (error: any) {
    // Catch the error if the student wasn't found (e.g., wrong ID or branch)
    if (error.code === "P2025") {
      return res
        .status(404)
        .json({ message: "Student not found in your branch." });
    }
    // Pass any other errors (like the validation error we just fixed) to the handler
    console.error("Error updating student:", error);
    next(error);
  }
};
/**
 * @description Reset passwords for a student (if they have a user account) and their parent.
 * @route POST /api/registrar/students/:id/reset-password
 */
export const resetStudentAndParentPasswords = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // This is the Student ID

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Find the student, their linked User record, and their parent's User record
    const student = await prisma.student.findFirst({
      where: { id, branchId },
      include: {
        parent: true, // This is the parent's User record
        user: true, // This is the student's own User record (from our previous schema fix)
      },
    });

    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found in your branch." });
    }
    if (!student.parent) {
      return res
        .status(404)
        .json({ message: "Parent account not found for this student." });
    }
    if (!student.user) {
      return res
        .status(404)
        .json({ message: "Student user account not found for this student." });
    }

    // 2. Generate new passwords for BOTH
    const parentPassword = generatePassword();
    const studentPassword = generatePassword();

    // 3. Update both passwords in a transaction
    await prisma.$transaction([
      // Update parent's password
      prisma.user.update({
        where: { id: student.parentId! },
        data: {
          passwordHash: await bcrypt.hash(parentPassword, 10),
        },
      }),
      // Update student's password
      prisma.user.update({
        where: { id: student.userId! }, // Use the student's user record ID
        data: {
          passwordHash: await bcrypt.hash(studentPassword, 10),
        },
      }),
    ]);

    // 4. Send back the response in the format the modal expects
    res.status(200).json({
      message: "Student and parent passwords have been reset.",
      // This is the structure the 'ResetCredentialsModal' component expects
      student: {
        id: student.user.userId, // Send human-readable student ID
        pass: studentPassword,
      },
      parent: {
        id: student.parent.userId, // Send human-readable parent ID
        pass: parentPassword,
      },
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
    const { id: classId } = req.params;
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
          where: { id: classId, branchId },
        });

        if (!classExists) {
            return res.status(404).json({ message: "Class not found in your branch." });
        }

        // This operation connects the class to existing subjects.
       await prisma.schoolClass.update({
         where: { id: classId },
         data: {
           subjects: {
             // 'set' disconnects all previously connected subjects
             // and connects only the ones in this new list.
             set: subjectIds.map((subjectId) => ({ id: subjectId })),
           },
         },
       });

        res.status(200).json({ message: "Class subjects updated successfully." });
    } catch (error) {
        next(error);
    }
};

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


export const getClassDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id: classId } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Get Class Info, Subjects, and Mentor
    const classInfo = await prisma.schoolClass.findFirst({
      where: { id: classId, branchId: branchId },
      include: {
        subjects: {
          include: {
            teacher: { select: { name: true } },
          },
        },
        mentor: { select: { name: true } },
      },
    });

    if (!classInfo) {
      return res
        .status(404)
        .json({ message: "Class not found in your branch." });
    }

    // 2. Format Subject & Performance Data (Same as before)
    const subjectsWithDetails = [];
    const performance = [];
    for (const sub of classInfo.subjects) {
      const avg = await prisma.examMark.aggregate({
        _avg: { score: true },
        where: { examSchedule: { classId: classId, subjectId: sub.id } },
      });
      const averageScore = avg._avg.score || 0;
      subjectsWithDetails.push({
        subjectId: sub.id,
        subjectName: sub.name,
        teacherName: sub.teacher?.name || "N/A",
        syllabusCompletion: 0, // Placeholder
      });
      performance.push({
        subjectName: sub.name,
        averageScore: averageScore,
      });
    }

    // 3. Get Fee Details (Same as before)
    const feeAggregates = await prisma.feeRecord.aggregate({
      _sum: { totalAmount: true, paidAmount: true },
      where: { student: { classId: classId } },
    });
    const totalPending =
      (feeAggregates._sum?.totalAmount ?? 0) -
      (feeAggregates._sum?.paidAmount ?? 0);
    const defaulterList = await prisma.$queryRaw<any[]>`
      SELECT s.id, s.name, SUM(fr."totalAmount" - fr."paidAmount") as "pendingAmount"
      FROM "Student" s
      JOIN "FeeRecord" fr ON s.id = fr."studentId"
      WHERE s."classId" = ${classId}
      GROUP BY s.id, s.name
      HAVING SUM(fr."totalAmount" - fr."paidAmount") > 0
    `;
    const fees = {
      totalPending: totalPending,
      defaulters: defaulterList.map((d) => ({
        studentId: d.id,
        studentName: d.name,
        pendingAmount: Number(d.pendingAmount),
      })),
    };

    // 4. --- RANK CALCULATION LOGIC ---
    // Get all students in the class
    const studentsInClass = await prisma.student.findMany({
      where: { classId: classId },
      select: { id: true, name: true },
    });

    // Helper function to get average scores
    const getAverageScores = async (studentIds: string[]) => {
      const averages = await prisma.examMark.groupBy({
        by: ["studentId"],
        _avg: { score: true },
        where: { studentId: { in: studentIds } },
      });
      return new Map(averages.map((a) => [a.studentId, a._avg.score || 0]));
    };

    // Calculate class ranks
    const classScores = await getAverageScores(
      studentsInClass.map((s) => s.id)
    );
    const sortedClassRanks = [...classScores.entries()]
      .sort((a, b) => b[1] - a[1])
      // --- THIS IS THE FIX ---
      // Tell TypeScript this is a 2-element tuple
      .map((entry, index) => [entry[0], index + 1] as [string, number]);
    const classRankMap = new Map(sortedClassRanks);

    // Calculate school ranks (based on grade level)
    const schoolScores = await getAverageScores(
      (
        await prisma.student.findMany({
          where: { branchId: branchId, gradeLevel: classInfo.gradeLevel },
          select: { id: true },
        })
      ).map((s) => s.id)
    );
    const sortedSchoolRanks = [...schoolScores.entries()]
      .sort((a, b) => b[1] - a[1])
      // --- THIS IS THE FIX ---
      // Tell TypeScript this is a 2-element tuple
      .map((entry, index) => [entry[0], index + 1] as [string, number]);
    const schoolRankMap = new Map(sortedSchoolRanks);

    // 5. Assemble Student Roster with Ranks
    const studentsWithRank = studentsInClass.map((student) => ({
      id: student.id,
      name: student.name,
      classRank: classRankMap.get(student.id) || null,
      schoolRank: schoolRankMap.get(student.id) || null,
    }));

    // 6. Assemble the final ClassDetails object
    const classDetails = {
      classInfo: { ...classInfo, mentorName: classInfo.mentor?.name || "N/A" },
      students: studentsWithRank,
      subjects: subjectsWithDetails,
      performance: performance,
      attendance: [],
      fees: fees,
    };

    res.status(200).json(classDetails);
  } catch (error) {
    next(error);
  }
};

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

export const getAllStaffForBranch = async (
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

  const staffRoles: UserRole[] = [
    "Teacher",
    "Registrar",
    "Librarian",
    "Principal",
    "SupportStaff",
  ];

  try {
    // 1. Get all subjects in the branch for easy lookup
    const allSubjects = await prisma.subject.findMany({
      where: { branchId: branchId },
      select: { id: true, name: true, teacherId: true },
    });

    // 2. Get all staff users
    const staffUsers = await prisma.user.findMany({
      where: {
        branchId: branchId,
        role: { in: staffRoles },
      },
      include: {
        teacher: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    // 3. --- NEW: Get all attendance records for the branch ---
    const allAttendance = await prisma.staffAttendanceRecord.findMany({
      where: { branchId },
      select: { userId: true, status: true }, // Only get what we need
    });

    // 4. Manually build the correct object for each user
    const combinedStaff = staffUsers.map((user) => {
      // --- NEW: Attendance Calculation ---
      // Find all records for this specific user
      const userRecords = allAttendance.filter((rec) => rec.userId === user.id);
      const totalDays = userRecords.length;
      // Count "Present" and "HalfDay" as present
      const presentDays = userRecords.filter(
        (rec) => rec.status === "Present" || rec.status === "HalfDay"
      ).length;
      // Calculate percentage, default to null if no records exist
      const attendancePercentage =
        totalDays === 0 ? null : (presentDays / totalDays) * 100;
      // --- End of New Code ---

      // This logic is for non-teacher staff
      if (!user.teacher) {
        return {
          ...user,
          attendancePercentage, // Add the percentage
        };
      }

      // This logic is for teachers
      const assignedSubjects = allSubjects.filter(
        (subject) => subject.teacherId === user.teacher!.id
      );
      const subjectIds = assignedSubjects.map((subject) => subject.id);

      return {
        ...user,
        teacher: {
          ...user.teacher,
          subjectIds: subjectIds,
        },
        attendancePercentage, // Add the percentage here too
      };
    });

    res.status(200).json(combinedStaff);
  } catch (error) {
    next(error);
  }
};

export const updateTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // Teacher ID from URL

  // 1. Validate incoming data structure (basic check)
  const { subjectIds, salary, ...otherData } = req.body;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (subjectIds !== undefined && !Array.isArray(subjectIds)) {
    return res
      .status(400)
      .json({ message: "subjectIds must be an array of strings." });
  }
  // Optional: Add more validation here (e.g., check email format)

  // 2. Build the update payload using the defined interface for type safety
  const updateData: TeacherUpdatePayload = { ...otherData };

  if (salary !== undefined) {
    const parsedSalary = Number(salary);
    if (!isNaN(parsedSalary)) {
      updateData.salary = parsedSalary;
    } else {
      return res
        .status(400)
        .json({ message: "Invalid salary format. Must be a number." });
    }
  }

  // 3. Handle subjectIds specifically
  // This assumes your Prisma schema has `subjectIds String[]` on the Teacher model
  if (subjectIds !== undefined) {
    // Ensure all elements in the array are strings (basic sanitation)
    if (subjectIds.every((item: any) => typeof item === "string")) {
      updateData.subjectIds = subjectIds;
    } else {
      return res
        .status(400)
        .json({ message: "subjectIds array must contain only strings." });
    }
  }

  try {
    // 4. Use prisma.teacher.update with strong typing
    const updatedTeacher = await prisma.teacher.update({
      where: {
        id: id,
        branchId: branchId, // Security: Ensures the teacher belongs to the registrar's branch
      },
      // Use the type-safe updateData object
      data: updateData as Prisma.TeacherUpdateInput, // Cast to Prisma's input type
    });


    res
      .status(200)
      .json({
        message: "Teacher profile updated successfully.",
        teacher: updatedTeacher,
      });
  } catch (error: any) {
    // Check if the error is Prisma's "Record not found" error
    if (error.code === "P2025") {
      return res
        .status(404)
        .json({
          message: "Teacher not found in your branch or does not exist.",
        });
    }
    // Handle other potential errors (validation, database connection, etc.)
    console.error("Error updating teacher:", error); // Log the actual error for debugging
    next(error);
  }
};


export const getSupportStaffByBranch = async (
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
    const supportStaff = await prisma.user.findMany({
      where: {
        branchId,
        role: {
          in: [UserRole.Librarian, UserRole.SupportStaff, UserRole.Registrar],
        },
      },
      
      select: {
        id: true, 
        userId: true, 
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true, 
        designation: true, 
        salary: true, 
      },
      orderBy: { name: "asc" },
    });
    res.status(200).json(supportStaff);
  } catch (error) {
    next(error);
  }
};

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
export const updateSupportStaff = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // User ID from URL

  // 1. Explicitly pull ONLY the allowed fields for support staff update
  const { name, email, phone, designation, status, salary } = req.body;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  // 2. Build the update payload using the defined interface
  const updateData: SupportStaffUpdatePayload = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (phone !== undefined) updateData.phone = phone; // Allows setting to null/empty
  if (designation !== undefined) updateData.designation = designation; // Allows setting to null/empty
  if (status !== undefined) updateData.status = status;

  // Handle salary separately for number conversion
  if (salary !== undefined) {
    const parsedSalary = Number(salary);
    if (!isNaN(parsedSalary)) {
      updateData.salary = parsedSalary;
    } else {
      // Don't include salary in update if it's not a valid number
      console.warn(`Invalid salary format received for user ${id}: ${salary}`);
      // Optionally return a 400 error:
      // return res.status(400).json({ message: "Invalid salary format. Must be a number." });
    }
  }

  // 3. Define the allowed roles for this update operation
  const allowedRoles: UserRole[] = [
    UserRole.Librarian,
    UserRole.SupportStaff,
    UserRole.Registrar,
  ];

  try {
    // 4. Use prisma.user.update for a single record
    const updatedStaff = await prisma.user.update({
      where: {
        id: id,
        branchId: branchId, // Security: Ensure user belongs to the registrar's branch
        role: { in: allowedRoles }, // Security: Ensure we only update valid support staff roles
      },
      data: updateData as Prisma.UserUpdateInput, // Use the clean updateData
    });

    // Prisma throws P2025 if not found, caught below

    res
      .status(200)
      .json({
        message: "Staff profile updated successfully.",
        staff: updatedStaff,
      });
  } catch (error: any) {
    // Check if the error is Prisma's "Record not found" error
    if (error.code === "P2025") {
      return res
        .status(404)
        .json({
          message:
            "Support staff member not found in your branch or does not have an updatable role.",
        });
    }
    // Handle other potential errors (validation, database connection, etc.)
    console.error("Error updating support staff:", error);
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


export const resetUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const { id: userIdToReset } = req.params; // This is the User's database ID

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Find the user to get their human-readable userId
    const userToReset = await prisma.user.findFirst({
      where: {
        id: userIdToReset,
        branchId: branchId, // Security: Ensure user is in the registrar's branch
      },
      select: {
        id: true,
        userId: true, // The human-readable ID (e.g., VRTX-...)
      }
    });

    if (!userToReset) {
      return res.status(404).json({ message: "User not found in your branch." });
    }

    // 2. Generate and hash the new password
    const newPassword = generatePassword(); // From your helpers
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 3. Update the user's password in the database
    await prisma.user.update({
      where: {
        id: userToReset.id, // Update using the database ID
      },
      data: {
        passwordHash: hashedPassword,
      },
    });

    // 4. Return the human-readable ID and the *unhashed* new password
    res.status(200).json({
      message: "Password reset successfully.",
      userId: userToReset.userId, // Send the VRTX-... ID
      newPassword: newPassword,    // Send the plain text password
    });

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

export const createTimetableConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { classId } = req.params;
  const { timeSlots } = req.body;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (!classId || !Array.isArray(timeSlots)) {
    return res
      .status(400)
      .json({
        message: "Class ID and a valid array of time slots are required.",
      });
  }

  try {
    const config = await prisma.timetableConfig.upsert({
      where: {
        // THIS IS THE FIX: Use the composite unique key.
        // Prisma typically names this by joining the fields with an underscore.
        classId_branchId: {
          classId: classId,
          branchId: branchId,
        },
      },
      update: {
        timeSlots: timeSlots,
      },
      create: {
        classId: classId,
        branchId: branchId,
        timeSlots: timeSlots,
      },
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
            day: day as unknown as import("@prisma/client").Day,
            startTime: startTime as string,
          },
          select: { teacherId: true },
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





export const getDailyAttendanceForClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { classId } = req.params;
  const { date } = req.query;

  if (!branchId)
    return res.status(401).json({ message: "Authentication required." });
  if (!date || typeof date !== "string")
    return res
      .status(400)
      .json({ message: "A valid 'date' query parameter is required." });

  try {
    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: classId, branchId },
    });
    if (!schoolClass)
      return res
        .status(404)
        .json({ message: "Class not found in your branch." });

    const targetDate = new Date(date);

    // --- FIX: Check if attendance has been saved ---
    // We check if even one record exists for this class on this date.
    const attendanceCount = await prisma.attendanceRecord.count({
      where: {
        classId: classId,
        date: targetDate,
      },
    });

    const isSaved = attendanceCount > 0;
    // --- END FIX ---

    const students = await prisma.student.findMany({
      where: { classId },
      select: {
        id: true,
        name: true,
        attendanceRecords: {
          where: { date: targetDate },
        },
      },
    });

    // The name 'attendanceList' is clearer than 'attendanceReport'
    const attendanceList = students.map((student) => ({
      studentId: student.id,
      studentName: student.name,
      // If saved, use the record's status. If not saved, default to 'Present'.
      status: student.attendanceRecords[0]?.status || "Present",
    }));

    // --- FIX: Return the object the frontend expects ---
    res.status(200).json({
      isSaved: isSaved,
      attendance: attendanceList,
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffAttendanceAndLeaveForMonth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { staffId, year, month } = req.params; // staffId is the User ID

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10); // 0-indexed (0=Jan, 11=Dec)

  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
    return res.status(400).json({ message: "Invalid year or month." });
  }

  try {
    // 1. Verify the staff member belongs to the registrar's branch
    const staffUser = await prisma.user.findFirst({
      where: { id: staffId, branchId: branchId },
      select: { id: true }, // We only need to confirm they exist in this branch
    });

    if (!staffUser) {
      return res
        .status(404)
        .json({ message: "Staff member not found in your branch." });
    }

    const startDate = new Date(Date.UTC(yearNum, monthNum, 1));
    const endDate = new Date(Date.UTC(yearNum, monthNum + 1, 0, 23, 59, 59));

    const [attendance, leaves] = await Promise.all([
      // --- THIS IS THE FIX ---
      // We now correctly read from 'staffAttendanceRecord' using the 'userId'
      prisma.staffAttendanceRecord.findMany({
        where: {
          userId: staffUser.id, // Use the User ID (which is staffId)
          date: { gte: startDate, lte: endDate },
        },
      }),
      // --- END OF FIX ---

      prisma.leaveApplication.findMany({
        where: {
          applicantId: staffUser.id, // This was already correct
          status: "Approved",
          AND: [
            { fromDate: { lte: endDate.toISOString() } },
            { toDate: { gte: startDate.toISOString() } },
          ],
        },
      }),
    ]);

    res.status(200).json({ attendance, leaves });
  } catch (error) {
    console.error("Error fetching staff calendar data:", error);
    next(error);
  }
};

export const getTeacherAttendance = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { date } = req.query;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });
    if (!date || typeof date !== 'string') return res.status(400).json({ message: "A valid 'date' query parameter is required." });

    try {
        const targetDate = new Date(date);

        // FIX: Fetch from StaffAttendanceRecord
        const attendanceRecords = await prisma.staffAttendanceRecord.findMany({
            where: { branchId, date: targetDate }
        });

        const isSaved = attendanceRecords.length > 0;

        res.status(200).json({
            isSaved: isSaved,
            attendance: attendanceRecords
        });

    } catch (error) {
        next(error);
    }
};


export const saveTeacherAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  // This 'records' array now contains 'userId' instead of 'teacherId'
  const { attendanceData: records } = req.body;

  if (!branchId)
    return res.status(401).json({ message: "Authentication required." });
  if (!Array.isArray(records))
    return res
      .status(400)
      .json({ message: "attendanceData must be an array." });

  try {
    const operations = records.map((record) => {
      const recordDate = new Date(`${record.date}T00:00:00.000Z`);  
      return prisma.staffAttendanceRecord.upsert({
        where: {
          userId_date: {
            // Use the new @@unique constraint
            userId: record.userId,
            date: recordDate,
          },
        },
        update: { status: record.status as TeacherAttendanceStatus },
        create: {
          userId: record.userId, // Use userId
          date: recordDate,
          status: record.status as TeacherAttendanceStatus,
          branchId,
        },
      });
    });

    await prisma.$transaction(operations);

    res.status(200).json({ message: "Teacher attendance saved successfully." });
  } catch (error) {
    next(error);
  }
};


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


export const getMyLeaveApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const applicantId = req.user?.id; // Get applicant ID from authenticated user

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

export const createHostel = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  // 1. Destructure ALL data from the body, including the rooms array
  const { name, warden, wardenNumber, rooms = [] } = req.body;

  if (!name || !warden) {
    return res
      .status(400)
      .json({ message: "Hostel name and warden are required." });
  }

  try {
    // 2. Use a transaction to create the hostel AND its rooms
    const newHostel = await prisma.$transaction(async (tx) => {
      // 3. Create the hostel first
      const hostel = await tx.hostel.create({
        data: {
          name,
          warden,
          wardenNumber, // Added this field
          branchId,
        },
      });

      // 4. If the frontend sent any rooms...
      if (rooms.length > 0) {
        // 5. ...create them all, linked to the new hostel's ID
        await tx.room.createMany({
          data: rooms.map((room: any) => ({
            roomNumber: room.roomNumber,
            roomType: room.roomType,
            capacity: room.capacity,
            fee: room.fee,
            hostelId: hostel.id, // This links the room to the hostel
          })),
        });
      }

      return hostel; // Return the created hostel
    });

    res.status(201).json(newHostel);
  } catch (error) {
    next(error);
  }
};

export const updateHostel = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id: hostelId } = req.params; // This is the hostel's ID

  // 1. Destructure ALL data from the body
  const { name, warden, wardenNumber, rooms = [] } = req.body;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 2. Update the hostel's main details (name, warden, etc.)
      await tx.hostel.update({
        where: { id: hostelId, branchId: branchId }, // Security check
        data: {
          name,
          warden,
          wardenNumber,
        },
      });

      // 3. Separate new rooms from existing rooms
      const newRooms = rooms.filter((room: any) => room.id.startsWith("new-"));
      const existingRoomIds = rooms
        .filter((room: any) => !room.id.startsWith("new-"))
        .map((room: any) => room.id);

      // 4. Find any rooms in the DB that are no longer in our list
      const roomsToDelete = await tx.room.findMany({
        where: {
          hostelId: hostelId,
          id: { notIn: existingRoomIds }, // Find rooms NOT in the list
        },
        select: { id: true },
      });
      const roomIdsToDelete = roomsToDelete.map((r) => r.id);

      // 5. If we have rooms to delete...
      if (roomIdsToDelete.length > 0) {
        // 5a. ...first un-assign all students from those rooms
        await tx.student.updateMany({
          where: { roomId: { in: roomIdsToDelete } },
          data: { roomId: null },
        });

        // 5b. ...then safely delete the empty rooms
        await tx.room.deleteMany({
          where: { id: { in: roomIdsToDelete } },
        });
      }

      // 6. Create all the new rooms
      if (newRooms.length > 0) {
        await tx.room.createMany({
          data: newRooms.map((room: any) => ({
            roomNumber: room.roomNumber,
            roomType: room.roomType,
            capacity: room.capacity,
            fee: room.fee,
            hostelId: hostelId, // Link to this hostel
          })),
        });
      }
    });

    res.status(200).json({ message: "Hostel updated successfully." });
  } catch (error: any) {
    // Handle case where the hostel ID wasn't found
    if (error.code === "P2025") {
      return res
        .status(404)
        .json({ message: "Hostel not found in your branch." });
    }
    next(error);
  }
};

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

export const getSchoolDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req); // Get the registrar's branch

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // This query now works perfectly with your new model
    const documents = await prisma.schoolDocument.findMany({
      where: {
        branchId: branchId,
      },
      orderBy: {
        uploadedAt: "desc",
      },
    });

    res.status(200).json(documents);
  } catch (error) {
    next(error);
  }
};


export const createSchoolDocument = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const uploadedBy = (req as any).user?.name || "Registrar"; // Get user from auth

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  // 1. Get the metadata from the request body. The fileUrl comes from Vercel Blob.
  const { name, type, ownerId, fileUrl } = req.body;

  if (!name || !type || !ownerId || !fileUrl) {
    return res.status(400).json({ message: "Missing required fields: name, type, ownerId, fileUrl" });
  }

  try {
    // 2. Create the document record in your database
    const newDocument = await prisma.schoolDocument.create({
      data: {
        branchId: branchId,
        name: name,
        type: type, // "Student" or "Staff"
        ownerId: ownerId, // The ID of the student or staff member
        fileUrl: fileUrl,
        
      },
    });

    res.status(201).json(newDocument);
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



export const deleteSubject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // This is the Subject ID

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // Use 'deleteMany' for a secure, scoped delete.
    // This query ensures that a registrar can ONLY delete a subject
    // that belongs to their own branch.
    const result = await prisma.subject.deleteMany({
      where: {
        id: id,
        branchId: branchId,
      },
    });

    // 'result.count' will be 0 if no subject was found with that ID in that branch
    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Subject not found in your branch." });
    }

    res.status(204).send(); // 204 No Content is standard for a successful delete
  } catch (error: any) {
    // Check for a foreign key constraint violation
    // This happens if the subject is still being used by a Timetable, Class, Exam, etc.
    if (error.code === "P2003") {
      return res
        .status(409)
        .json({
          message:
            "Cannot delete subject. It is still in use by a class, timetable, or exam schedule.",
        });
    }
    // Handle other errors
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


export const createLeaveApplication = async (req: Request, res: Response, next: NextFunction) => {
  const applicantId = req.user?.id; // Get applicant ID from authenticated user

  if (!applicantId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  
  // Destructure all expected fields from the body
  const {
    leaveType,
    startDate,
    endDate,
    isHalfDay,
    reason,
  } = req.body;

  if (!leaveType || !startDate || !endDate || !reason) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    const newApplication = await prisma.leaveApplication.create({
      data: {
        applicantId: applicantId, // Use the authenticated user's ID
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

export const getStudentProfileDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { studentId } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // 1. Fetch Student and essential relations
    const student = await prisma.student.findFirst({
      where: { id: studentId, branchId: branchId },
      include: {
        parent: true,
        user: true,
        class: true,
        feeRecords: { include: { payments: true } },
        attendanceRecords: { orderBy: { date: "desc" }, take: 90 },
        suspensionRecords: {
          where: { endDate: { gte: new Date() } },
          orderBy: { endDate: "desc" },
        },
        examMarks: {
          include: {
            examSchedule: { include: { subject: true } },
          },
        },
        FeeAdjustment: { orderBy: { date: "desc" } },
      },
    });

    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found in your branch." });
    }

    // 2. Calculate Summaries and Format Data

    const attendanceTotal = await prisma.attendanceRecord.count({
      where: { studentId: studentId },
    });
    const attendancePresent = await prisma.attendanceRecord.count({
      where: { studentId: studentId, status: "Present" },
    });
    const attendance = {
      total: attendanceTotal,
      present: attendancePresent,
      percentage:
        attendanceTotal > 0 ? (attendancePresent / attendanceTotal) * 100 : 100,
    };

    const feeStatus = {
      total: student.feeRecords.reduce((sum, r) => sum + r.totalAmount, 0),
      paid: student.feeRecords.reduce((sum, r) => sum + r.paidAmount, 0),
      pending: student.feeRecords.reduce(
        (sum, r) => sum + (r.totalAmount - r.paidAmount),
        0
      ),
    };

    type PaymentItem = FeePayment & { type: "payment" }; // <-- Corrected
    type AdjustmentItem = FeeAdjustment & { type: "adjustment" }; // <-- Corrected
    type HistoryItem = PaymentItem | AdjustmentItem;

    const paymentHistory = student.feeRecords
      .flatMap((fr) => fr.payments)
      .map((p) => ({ ...p, itemType: "payment" as const })); // Use a different property name like 'itemType'

    // Map adjustments, adding the same 'itemType' property
    const adjustmentHistory = (student.FeeAdjustment || []).map(
      (adj) => ({ ...adj, itemType: "adjustment" as const }) // Use 'itemType'
    );

    // Combine the arrays (TypeScript can now infer the union type)
    const feeHistory = [...paymentHistory, ...adjustmentHistory].sort(
      (a, b) => {
        let dateA: Date | undefined | null;
        let dateB: Date | undefined | null;

        // Check the discriminating property 'itemType'
        if (a.itemType === "payment") {
          dateA = a.paidDate;
        } else {
          // 'a' must be AdjustmentItem
          dateA = a.date;
        }

        if (b.itemType === "payment") {
          dateB = b.paidDate;
        } else {
          // 'b' must be AdjustmentItem
          dateB = b.date;
        }

        // Ensure dates are valid before comparing
        const timeA = dateA ? new Date(dateA).getTime() : 0;
        const timeB = dateB ? new Date(dateB).getTime() : 0;
        return timeB - timeA; // Sort descending (most recent first)
      }
    );

    const grades = student.examMarks.map((mark) => ({
      courseName: mark.examSchedule.subject.name,
      score: mark.score,
    }));

    const rank = { class: "N/A", school: "N/A" };

    const skills = [
      { subject: "Communication", A: Math.random() * 5 },
      { subject: "Problem Solving", A: Math.random() * 5 },
      { subject: "Teamwork", A: Math.random() * 5 },
      { subject: "Creativity", A: Math.random() * 5 },
      { subject: "Leadership", A: Math.random() * 5 },
    ];

    // FIX 3: Remove the frontend-specific 'StudentProfile' type annotation.
    // The structure returned implicitly matches what the frontend expects.
    const profile = {
      student: {
        ...student,
        passwordHash: undefined,
        // Explicitly remove relations included for calculation but not needed in final student object
        feeRecords: undefined,
        attendanceRecords: undefined,
        suspensionRecords: undefined,
        examMarks: undefined,
        FeeAdjustment: undefined,
      },
      parent: student.parent
        ? {
            ...student.parent,
            passwordHash: undefined,
          }
        : null,
      classInfo: student.class
        ? `Grade ${student.class.gradeLevel} - ${student.class.section}`
        : "N/A",
      attendance: attendance,
      feeStatus: feeStatus,
      attendanceHistory: student.attendanceRecords, // Send the original records
      feeHistory: feeHistory,
      grades: grades,
      rank: rank,
      skills: skills,
      activeSuspension:
        student.suspensionRecords.length > 0
          ? student.suspensionRecords[0]
          : null,
    };

    res.status(200).json(profile);
  } catch (error) {
    console.error("Error fetching student profile:", error);
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
  // 1. Get the branchId from the authenticated user's session
  const branchId = getRegistrarBranchId(req);
  const { name, teacherId } = req.body;

  // 2. Add a check to ensure a branchId was found
  if (!branchId) {
    return res
      .status(401)
      .json({
        message: "Authentication error: Branch could not be identified.",
      });
  }

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ message: "Subject name is required." });
  }

  try {
    const newSubject = await prisma.subject.create({
      data: {
        name: name.trim(),
        // 3. Include the branchId in the data being saved
        branchId: branchId,
        ...(teacherId && { teacherId: teacherId }),
      },
    });
    res.status(201).json(newSubject);
  } catch (error) {
    // This will catch potential errors, like if a subject with that name already exists
    next(error);
  }
};

export const updateSubject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // Subject ID

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  // 1. Get the allowed fields from the body
  const { name, teacherId } = req.body;

  // 2. Build the update data object
  const updateData: any = {}; // Use 'any' or a specific interface

  if (name !== undefined) {
    updateData.name = name;
  }

  // 3. THIS IS THE FIX:
  // We are now updating the 'teacherId' field directly.
  if (teacherId !== undefined) {
    // If frontend sends an empty string "", set the database field to null.
    // Otherwise, set it to the provided teacherId.
    updateData.teacherId = teacherId || null;
  }

  try {
    // 4. Use updateMany for security, ensuring the subject is in the registrar's branch
    const result = await prisma.subject.updateMany({
      where: {
        id: id,
        branchId: branchId,
      },
      data: updateData, // This will now send { name: "...", teacherId: "..." }
    });

    // 5. Check if anything was actually updated
    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Subject not found in your branch." });
    }

    res.status(200).json({ message: "Subject updated successfully." });
  } catch (error) {
    next(error);
  }

  
};