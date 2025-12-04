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
  EventStatus,
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

const ACADEMIC_MONTH_NAMES = [
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "January",
  "February",
  "March",
];

const getRemainingMonthsCount = (): number => {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0=Jan, 11=Dec
  // Session: Apr(3) to Mar(2)
  if (currentMonth === 2) return 1; // If March, 1 month (current)
  if (currentMonth >= 3) return 12 - (currentMonth - 3); // Apr-Dec
  return 3 - currentMonth; // Jan-Feb
};

const getAcademicMonthIndex = (date: Date) => {
  const month = date.getMonth(); // 0=Jan, 3=April
  if (month >= 3) return month - 3; // April(3) -> 0
  return month + 9; // Jan(0) -> 9
};
const getAuthenticatedBranchId = (req: Request): string | null => {
  if (req.user && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
};

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
      .json({
        message: "Unauthorized: Registrar not associated with a branch.",
      });
  }

  try {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const branchDetails = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { email: true, helplineNumber: true, location: true },
    });

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
      prisma.admissionApplication.count({
        where: { branchId, status: "Pending" },
      }),
      prisma.rectificationRequest.count({
        where: { branchId, status: "Pending" },
      }),
      prisma.feeRecord.aggregate({
        _sum: { totalAmount: true, paidAmount: true },
        where: { student: { branchId } },
      }),
      prisma.teacher.count({
        where: { branchId, subjectIds: { isEmpty: true } },
      }),
      prisma.schoolEvent.findMany({
        where: { branchId, status: "Pending" },
        take: 5,
        orderBy: { date: "asc" },
      }),
      prisma.admissionApplication.findMany({
        where: { branchId, status: "Pending" },
        take: 5,
        select: { id: true, applicantName: true, gradeLevel: true },
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
                where: {
                  paidAmount: { lt: prisma.feeRecord.fields.totalAmount },
                },
                select: { totalAmount: true, paidAmount: true },
              },
            },
          },
        },
      }),
      prisma.teacherAttendanceRecord.findMany({
        where: {
          branchId,
          date: {
            gte: new Date(now.setHours(0, 0, 0, 0)),
            lt: new Date(now.setHours(23, 59, 59, 999)),
          },
          status: { in: ["Absent", "HalfDay"] },
        },
        include: { teacher: { select: { name: true } } },
      }),
    ]);

    // --- Complex Calculation for Monthly Fee Overview ---
    const feeOverviewPromises = Array.from({ length: 6 }).map(async (_, i) => {
      const month = (currentMonth - i + 12) % 12;
      const year = currentMonth - i < 0 ? currentYear - 1 : currentYear;
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);

      const payments = await prisma.feePayment.aggregate({
        _sum: { amount: true },
        where: {
          student: { branchId },
          paidDate: { gte: monthStart, lte: monthEnd },
        },
      });
      const records = await prisma.feeRecord.aggregate({
        _sum: { totalAmount: true },
        where: {
          student: { branchId },
          dueDate: { gte: monthStart, lte: monthEnd },
        },
      });

      const paid = payments._sum.amount || 0;
      const totalDue = records._sum.totalAmount || 0;

      return {
        month: monthStart.toLocaleString("default", { month: "short" }),
        paid,
        pending: Math.max(0, totalDue - paid),
      };
    });
    const feeOverview = (await Promise.all(feeOverviewPromises)).reverse();

    // --- Final Data Shaping to Match Frontend Contract ---
    const dashboardData = {
      branch: branchDetails,
      summary: {
        pendingAdmissions,
        pendingAcademicRequests,
        feesPending:
          // Cast to any to avoid TS error on _sum in some environments
          ((feesPendingAggregate as any)._sum.totalAmount || 0) -
          ((feesPendingAggregate as any)._sum.paidAmount || 0),
        unassignedFaculty,
      },
      admissionRequests: admissionRequests.map((app) => ({
        ...app,
        type: "Student",
        subject: "",
      })),
      feeOverview,
      pendingEvents,
      classFeeSummaries: classFeeSummaries.map((c) => {
        const defaulters = c.students.filter((s) => s.feeRecords.length > 0);
        const pendingAmount = defaulters.reduce(
          (sum, s) =>
            sum +
            s.feeRecords.reduce(
              (recSum, rec) => recSum + (rec.totalAmount - rec.paidAmount),
              0
            ),
          0
        );
        return {
          classId: c.id,
          className: `Grade ${c.gradeLevel}-${c.section}`,
          defaulterCount: defaulters.length,
          pendingAmount,
        };
      }),
      // FIX: Cast 'att' to 'any' to access the included 'teacher' property
      teacherAttendanceStatus: teacherAttendanceStatus.map((att: any) => ({
        teacherId: att.teacherId,
        teacherName: att.teacher?.name || "Unknown", // Optional chaining for safety
        status: att.status,
      })),
      academicRequests: {
        count: pendingAcademicRequests,
        requests: [],
      },
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
  const branchId = getAuthenticatedBranchId(req);
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
  if (!branchId) return res.status(401).json({ message: "Unauthorized." });

  try {
    // 1. Get classes with their fee template amount
    const classes = await prisma.schoolClass.findMany({
      where: { branchId },
      select: {
        id: true,
        gradeLevel: true,
        section: true,
        feeTemplate: { select: { amount: true } },
      },
      orderBy: [{ gradeLevel: "asc" }, { section: "asc" }],
    });

    const summaries = await Promise.all(
      classes.map(async (sClass) => {
        // 2. Fetch ALL active students
        const students = await prisma.student.findMany({
          where: { classId: sClass.id, status: "active" },
          select: {
            id: true,
            feeRecords: { select: { totalAmount: true, paidAmount: true } },
            FeeAdjustment: { select: { type: true, amount: true } },
          },
        });

        let classTotalPending = 0;
        let defaulterCount = 0;

        students.forEach((student) => {
          const record = student.feeRecords[0];
          const adjustments = student.FeeAdjustment || [];

          // FIX: Cast sClass to 'any' to access feeTemplate safely
          const classWithTemplate = sClass as any;

          // A. Base Amount
          const baseTotal = record
            ? record.totalAmount
            : classWithTemplate.feeTemplate?.amount || 0;

          // B. Adjustments
          const totalAdjustments = adjustments.reduce((acc, adj) => {
            return adj.type === "charge" ? acc + adj.amount : acc - adj.amount;
          }, 0);

          const netTotal = record
            ? record.totalAmount
            : baseTotal + totalAdjustments;
          const paid = record ? record.paidAmount : 0;

          const pending = netTotal - paid;

          if (pending > 0) {
            classTotalPending += pending;
            defaulterCount++;
          }
        });

        return {
          classId: sClass.id,
          className: `Grade ${sClass.gradeLevel} - ${sClass.section}`,
          studentCount: students.length,
          defaulterCount,
          pendingAmount: classTotalPending,
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

export const deleteExamination = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;

  if (!branchId) return res.status(401).json({ message: "Unauthorized" });

  try {
    // Security: Use deleteMany to ensure we only delete if it belongs to this branch
    const result = await prisma.examination.deleteMany({
      where: { id, branchId },
    });

    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Examination not found in your branch." });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const updateExamination = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;
  const { name, startDate, endDate } = req.body;

  if (!branchId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const result = await prisma.examination.updateMany({
      where: { id, branchId },
      data: {
        name,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Examination not found." });
    }

    res.status(200).json({ message: "Examination updated successfully." });
  } catch (error) {
    next(error);
  }
};

export const deleteExamSchedule = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params; // Schedule ID

  if (!branchId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const result = await prisma.examSchedule.deleteMany({
      where: { id, branchId },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Schedule not found." });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const updateExamSchedule = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;
  const { date, startTime, endTime, room, totalMarks } = req.body;

  if (!branchId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const result = await prisma.examSchedule.updateMany({
      where: { id, branchId },
      data: {
        date: date ? new Date(date) : undefined,
        startTime,
        endTime,
        room,
        totalMarks: totalMarks ? Number(totalMarks) : undefined,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Schedule not found." });
    }

    res.status(200).json({ message: "Schedule updated successfully." });
  } catch (error) {
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
  const { studentId } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const student = await prisma.student.findFirst({
      where: { id: studentId, branchId }, 
      include: {
        parent: true,
        user: true,
      },
    });

    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found in your branch." });
    }
    if (!student.parent || !student.user) {
      return res
        .status(404)
        .json({ message: "Student or Parent user account missing." });
    }

    const parentPassword = generatePassword();
    const studentPassword = generatePassword();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: student.parentId! },
        data: {
          passwordHash: await bcrypt.hash(parentPassword, 10),
        },
      }),
      prisma.user.update({
        where: { id: student.userId! },
        data: {
          passwordHash: await bcrypt.hash(studentPassword, 10),
        },
      }),
    ]);

    res.status(200).json({
      message: "Student and parent passwords have been reset.",
      student: {
        id: student.user.userId,
        pass: studentPassword,
      },
      parent: {
        id: student.parent.userId,
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
      include: {
        _count: {
          select: { students: true },
        },
        subjects: {
          select: { id: true, name: true },
        },
        mentor: { select: { id: true, name: true } },
      },
      orderBy: [{ gradeLevel: "asc" }, { section: "asc" }],
    });

    const formattedClasses = classes.map((c) => {
      // FIX: Cast 'c' to 'any' to access the _count property safely
      const classWithCount = c as any;

      return {
        ...c,
        mentorTeacherId: c.mentorId,
        studentCount: classWithCount._count?.students || 0,
      };
    });

    res.status(200).json(formattedClasses);
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
        mentor: { select: { name: true, id: true } },
      },
    });

    if (!classInfo) {
      return res
        .status(404)
        .json({ message: "Class not found in your branch." });
    }

    // 2. Format Subject & Performance Data
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

    // 3. Get Fee Details
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

      // FIX: Cast 'a' to 'any' to allow access to studentId and _avg
      return new Map(
        averages.map((a: any) => [a.studentId, a._avg.score || 0])
      );
    };

    // Calculate class ranks
    const classScores = await getAverageScores(
      studentsInClass.map((s) => s.id)
    );

    const sortedClassRanks = [...classScores.entries()]
      .sort((a, b) => b[1] - a[1])
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
      classInfo: {
        ...classInfo,
        mentorName: classInfo.mentor?.name || "N/A",
        mentorTeacherId: classInfo.mentorId,
      },
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
const branchId = getAuthenticatedBranchId(req);
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
export const requestFeeTemplateUpdate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { templateId, newData, reason } = req.body;

  if (!branchId || !req.user) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (!templateId || !newData || !reason) {
    return res
      .status(400)
      .json({ message: "templateId, newData, and reason are required." });
  }

  try {
    const template = await prisma.feeTemplate.findFirst({
      where: { id: templateId, branchId },
    });
    if (!template) {
      return res
        .status(404)
        .json({ message: "Fee template not found in your branch." });
    }

    await prisma.feeRectificationRequest.create({
      data: {
        branchId,
        registrarId: req.user.id,
        registrarName: req.user.name || "Registrar",
        templateId: templateId,
        requestType: "update", // simple string, matching your schema expectation
        originalData: JSON.parse(JSON.stringify(template)), // Store current state
        newData: JSON.parse(JSON.stringify(newData)), // Store proposed state
        reason: reason,
        status: "Pending",
      },
    });

    res.status(200).json({
      message: "Update request submitted successfully for review.",
    });
  } catch (error) {
    next(error);
  }
};

export const requestFeeTemplateDeletion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { templateId, reason } = req.body;

  if (!branchId || !req.user) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (!templateId || !reason) {
    return res
      .status(400)
      .json({ message: "templateId and reason are required." });
  }

  try {
    const template = await prisma.feeTemplate.findFirst({
      where: { id: templateId, branchId },
    });
    if (!template) {
      return res
        .status(404)
        .json({ message: "Fee template not found in your branch." });
    }
    await prisma.feeRectificationRequest.create({
      data: {
        branchId,
        registrarId: req.user.id,
        registrarName: req.user.name || "Registrar",
        templateId: templateId,
        requestType: "delete",
        originalData: JSON.parse(JSON.stringify(template)),
        newData: Prisma.JsonNull, 
        reason: reason,
        status: "Pending",
      },
    });

    res.status(200).json({
      message: "Deletion request submitted successfully for review.",
    });
  } catch (error) {
    next(error);
  }
};

export const getFeeCollectionOverview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) return res.status(401).json({ message: "Unauthorized" });

  try {
    // 1. Fetch all students with ALL fee-related data
    const students = await prisma.student.findMany({
      where: { branchId },
      select: {
        id: true,
        name: true,
        user: { select: { userId: true } },
        class: {
          select: {
            gradeLevel: true,
            section: true,
            feeTemplate: { select: { amount: true } },
          },
        },
        room: { select: { fee: true } },
        busStop: { select: { charges: true } },

        feeRecords: {
          include: {
            payments: { orderBy: { paidDate: "desc" }, take: 1 },
          },
        },
        FeeAdjustment: true,
      },
      orderBy: { name: "asc" },
    });

    // 2. Flatten and Calculate
    const overview = students.map((studentRaw) => {
      const student = studentRaw as any;
      const record = student.feeRecords[0];

      // A. Base Tuition (Template or 0)
      const templateAmount = student.class?.feeTemplate?.amount || 0;

      // B. Dynamic Recurring Fees (Hostel + Transport)
      const annualHostelFee = (student.room?.fee || 0) * 12;
      const annualTransportFee = (student.busStop?.charges || 0) * 12;

      // C. Adjustments (Fines/Discounts)
      const adjustments = student.FeeAdjustment || [];
      const totalAdjustments = adjustments.reduce((acc: number, adj: any) => {
        return adj.type === "charge" ? acc + adj.amount : acc - adj.amount;
      }, 0);

      // D. Total Fee Calculation
      let netTotal = 0;

      if (record) {
        netTotal = record.totalAmount;
      } else {
        netTotal =
          templateAmount +
          annualHostelFee +
          annualTransportFee +
          totalAdjustments;
      }

      const paidAmount = record ? record.paidAmount : 0;
      const pending = netTotal - paidAmount;
      const lastPaidDate = record?.payments[0]?.paidDate || null;
      const dueDate = record?.dueDate
        ? record.dueDate.toISOString()
        : new Date().toISOString();

      return {
        studentId: student.id,
        userId: student.user?.userId || "N/A",
        name: student.name,
        className: student.class
          ? `Grade ${student.class.gradeLevel}-${student.class.section}`
          : "Unassigned",
        totalFee: netTotal,
        paidAmount: paidAmount,
        pendingAmount: pending,
        lastPaidDate: lastPaidDate,
        dueDate: dueDate,
        status: pending <= 0 && netTotal > 0 ? "Paid" : "Due",
      };
    });

    res.status(200).json(overview);
  } catch (error) {
    next(error);
  }
};
export const collectFeePayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) return res.status(401).json({ message: "Unauthorized" });

  const { studentId, amount, remarks, transactionId } = req.body;

  if (!studentId || !amount) {
    return res
      .status(400)
      .json({ message: "Student ID and Amount are required." });
  }

  try {
    // 1. Fetch student AND their class template info
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        feeRecords: true, // Check if record exists
        class: {
          include: { feeTemplate: true }, // Get template to initialize if record is missing
        },
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    const paymentAmount = parseFloat(amount);

    // CASE A: Fee Record ALREADY Exists -> Update it
    if (student.feeRecords.length > 0) {
      const recordId = student.feeRecords[0].id;

      await prisma.$transaction([
        prisma.feePayment.create({
          data: {
            studentId,
            feeRecordId: recordId,
            amount: paymentAmount,
            paidDate: new Date(),
            transactionId: transactionId || `CASH-${Date.now()}`,
            details: remarks || "Cash Payment collected by Registrar",
          },
        }),
        prisma.feeRecord.update({
          where: { id: recordId },
          data: {
            paidAmount: { increment: paymentAmount },
          },
        }),
      ]);
    }
    // CASE B: Fee Record DOES NOT Exist -> Create it (Initialize + Pay)
    else {
      // We need a template to know the Total Amount
      const templateAmount = student.class?.feeTemplate?.amount;

      if (!templateAmount) {
        return res.status(400).json({
          message:
            "Cannot collect fee: No Fee Template assigned to this student's class.",
        });
      }
      await prisma.feeRecord.create({
        data: {
          studentId: studentId,
          totalAmount: templateAmount,
          paidAmount: paymentAmount, // Initialize with this payment
          dueDate: new Date(new Date().getFullYear(), 3, 1), 
          payments: {
            create: {
              studentId: studentId,
              amount: paymentAmount,
              paidDate: new Date(),
              transactionId: transactionId || `CASH-${Date.now()}`,
              details: remarks || "Initial Payment collected by Registrar",
            },
          },
        },
      });
    }

    res.status(201).json({ message: "Payment collected successfully." });
  } catch (error) {
    next(error);
  }
};


/**
 * @description Get a list of fee defaulters for a specific class.
 * @route GET /api/registrar/classes/:classId/defaulters
 */
export const getDefaultersForClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { classId } = req.params;

  if (!branchId)
    return res.status(401).json({ message: "Authentication required." });

  try {
    // 1. Get the class to know the template amount
    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: classId },
      select: { feeTemplate: { select: { amount: true } } },
    });

    const templateAmount = schoolClass?.feeTemplate?.amount || 0;

    // 2. Fetch ALL students (Not just those with fee records)
    const students = await prisma.student.findMany({
      where: { classId, branchId, status: "active" },
      select: {
        id: true,
        name: true,
        userId: true,
        classRollNumber: true,
        guardianInfo: true,
        feeRecords: { select: { totalAmount: true, paidAmount: true } },
        FeeAdjustment: { select: { type: true, amount: true } },
      },
    });

    // 3. Filter and Map in memory
    const defaulters = students
      .map((student) => {
        const record = student.feeRecords[0];
        const adjustments = student.FeeAdjustment || [];

        // Same Logic as Summary
        const totalAdjustments = adjustments.reduce((acc, adj) => {
          return adj.type === "charge" ? acc + adj.amount : acc - adj.amount;
        }, 0);

        // If record exists, use it (it acts as the snapshot of truth).
        // If not, derive from template + adjustments.
        const netTotal = record
          ? record.totalAmount
          : templateAmount + totalAdjustments;
        const paid = record ? record.paidAmount : 0;
        const pending = netTotal - paid;

        if (pending <= 0) return null;

        const gInfo = student.guardianInfo as {
          phone?: string;
          name?: string;
        } | null;

        return {
          studentId: student.id,
          userId: student.userId, // Readable ID? (Check if your student table stores the VRTX id here or in relation)
          // If userId in student table is UUID, fetch user.userId.
          // Assuming based on previous fixes you want the readable one:
          // If your schema stores VRTX id on student.userId, keep this.
          // If it stores UUID, you need include: { user: true } and map student.user.userId

          studentName: student.name,
          rollNo: student.classRollNumber || "N/A",
          guardianPhone: gInfo?.phone || "N/A",
          pendingAmount: pending,
        };
      })
      .filter((s) => s !== null);

    res.status(200).json(defaulters);
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
const branchId = getAuthenticatedBranchId(req);
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
  const { id: hostelId } = req.params;
  const { name, warden, wardenNumber, rooms } = req.body; // 'rooms' is optional

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Update Hostel Basic Details
      await tx.hostel.update({
        where: { id: hostelId, branchId: branchId },
        data: {
          name,
          warden,
          wardenNumber,
        },
      });

      // 2. SMART ROOM UPDATE LOGIC
      // Only touch rooms if the 'rooms' array is explicitly provided.
      // If 'rooms' is undefined or null, we assume the user only wanted to edit the hostel name/warden.
      if (Array.isArray(rooms)) {
        // Get current IDs in DB
        const currentRooms = await tx.room.findMany({
          where: { hostelId },
          select: { id: true },
        });
        const currentRoomIds = currentRooms.map((r) => r.id);

        // Identify IDs coming from frontend
        const incomingRoomIds = rooms
          .filter((r: any) => !r.id.startsWith("new-")) // Filter out temp IDs
          .map((r: any) => r.id);

        // A. DELETE rooms that are in DB but NOT in the new list
        const roomsToDelete = currentRoomIds.filter(
          (id) => !incomingRoomIds.includes(id)
        );

        if (roomsToDelete.length > 0) {
          // Unassign students first to avoid FK constraint errors
          await tx.student.updateMany({
            where: { roomId: { in: roomsToDelete } },
            data: { roomId: null },
          });
          await tx.room.deleteMany({
            where: { id: { in: roomsToDelete } },
          });
        }

        // B. CREATE new rooms (IDs starting with "new-")
        const newRooms = rooms.filter((r: any) => r.id.startsWith("new-"));
        if (newRooms.length > 0) {
          await tx.room.createMany({
            data: newRooms.map((room: any) => ({
              hostelId,
              roomNumber: room.roomNumber,
              roomType: room.roomType,
              capacity: parseInt(room.capacity, 10),
              fee: parseFloat(room.fee),
            })),
          });
        }

        // C. UPDATE existing rooms
        // We iterate through existing rooms to update capacity/fee if changed
        const roomsToUpdate = rooms.filter(
          (r: any) => !r.id.startsWith("new-")
        );
        for (const room of roomsToUpdate) {
          await tx.room.update({
            where: { id: room.id },
            data: {
              roomNumber: room.roomNumber,
              roomType: room.roomType,
              capacity: parseInt(room.capacity, 10),
              fee: parseFloat(room.fee),
            },
          });
        }
      }
    });

    res.status(200).json({ message: "Hostel updated successfully." });
  } catch (error: any) {
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


export const getRooms = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id: hostelId } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const hostel = await prisma.hostel.findFirst({
      where: { id: hostelId, branchId },
    });
    if (!hostel) {
      return res
        .status(404)
        .json({ message: "Hostel not found in your branch." });
    }

    // 2. Get all rooms
    const rooms = await prisma.room.findMany({
      where: { hostelId: hostelId },
      orderBy: { roomNumber: "asc" },
    });

    // 3. Get students in these rooms with their Name and VRTX ID
    const studentsInHostel = await prisma.student.findMany({
      where: {
        roomId: { in: rooms.map((r) => r.id) },
        branchId: branchId,
      },
      select: {
        id: true,
        roomId: true,
        name: true,
        user: { select: { userId: true } }, // Fetch VRTX ID
      },
    });

    // 4. Map students to rooms
    const roomsWithOccupants = rooms.map((room) => {
      const occupants = studentsInHostel
        .filter((s) => s.roomId === room.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          userId: s.user?.userId || "N/A",
        }));

      return {
        ...room,
        occupants: occupants, // Send full objects, not just IDs
        // Keep occupantIds for backward compatibility if needed, but occupants is better
        occupantIds: occupants.map((o) => o.id),
      };
    });

    res.status(200).json(roomsWithOccupants);
  } catch (error) {
    next(error);
  }
};

export const assignStudentToRoom = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { roomId } = req.params;
  const { studentId } = req.body;

  if (!branchId)
    return res.status(401).json({ message: "Authentication required." });

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Fetch Room & Student
      const room = await tx.room.findFirst({
        where: { id: roomId, hostel: { branchId } },
        include: { _count: { select: { occupants: true } } },
      });
      if (!room) throw new Error("Room not found.");
      if (room._count.occupants >= room.capacity)
        throw new Error("Room is full.");

      const student = await tx.student.findFirst({
        where: { id: studentId, branchId },
        include: {
          feeRecords: true,
          class: { include: { feeTemplate: true } },
        },
      });
      if (!student) throw new Error("Student not found.");

      // 2. FINANCIAL LOGIC: Calculate & Apply Charge
      const monthsLeft = getRemainingMonthsCount();
      const totalCharge = room.fee * monthsLeft;

      if (totalCharge > 0) {
        let feeRecordId = student.feeRecords[0]?.id;

        // If student has no fee record yet, create one
        if (!feeRecordId) {
          const templateAmount = student.class?.feeTemplate?.amount || 0;
          const newRecord = await tx.feeRecord.create({
            data: {
              studentId,
              totalAmount: templateAmount,
              paidAmount: 0,
              dueDate: new Date(new Date().getFullYear(), 3, 1),
            },
          });
          feeRecordId = newRecord.id;
        }

        // A. Update the Balance (Permanent Debt Increase)
        await tx.feeRecord.update({
          where: { id: feeRecordId },
          data: { totalAmount: { increment: totalCharge } },
        });

        // B. Create Audit Log (So we know WHY it increased)
        await tx.feeAdjustment.create({
          data: {
            studentId,
            type: "charge", // Important: It's a charge, not a discount
            amount: totalCharge,
            reason: `Hostel Assigned: Room ${room.roomNumber} (${monthsLeft} months @ ${room.fee})`,
            adjustedBy: req.user?.name || "Registrar",
            date: new Date(),
          },
        });
      }

      // 3. Assign Room
      await tx.student.update({
        where: { id: studentId },
        data: { roomId: roomId },
      });
    });

    res.status(200).json({ message: "Student assigned and fees updated." });
  } catch (error: any) {
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


export const getTransportRoutes = async (
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
    // 1. Get routes AND include their stops
    const routes = await prisma.transportRoute.findMany({
      where: { branchId },
      include: {
        busStops: { orderBy: { name: "asc" } },
      },
    });

    // 2. Get member counts separately
    const [studentCounts, teacherCounts] = await Promise.all([
      prisma.student.groupBy({
        by: ["transportRouteId"],
        _count: { id: true },
        where: { branchId, transportRouteId: { not: null } },
      }),
      prisma.teacher.groupBy({
        by: ["transportRouteId"],
        _count: { id: true },
        where: { branchId, transportRouteId: { not: null } },
      }),
    ]);

    // FIX: Explicitly cast 'c' to 'any' to bypass TypeScript inference error on transportRouteId
    const studentCountMap = new Map(
      studentCounts.map((c: any) => [c.transportRouteId, c._count.id])
    );
    const teacherCountMap = new Map(
      teacherCounts.map((c: any) => [c.transportRouteId, c._count.id])
    );

    // 3. Combine data into the shape the frontend expects
    const routesWithCounts = routes.map((route) => {
      const memberCount =
        (studentCountMap.get(route.id) || 0) +
        (teacherCountMap.get(route.id) || 0);
      return {
        ...route,
        assignedMembers: { length: memberCount },
      };
    });

    res.status(200).json(routesWithCounts);
  } catch (error) {
    next(error);
  }
};

export const createTransportRoute = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    if (!branchId) {
        return res.status(401).json({ message: "Authentication required." });
    }

    const { busStops = [], ...routeData } = req.body;
    const { routeName, busNumber, driverName, capacity, driverNumber, conductorName, conductorNumber } = routeData;

    if (!routeName || !busNumber || !driverName || !capacity) {
        return res.status(400).json({ message: "Route name, bus number, driver name, and capacity are required." });
    }

    try {
        const newRoute = await prisma.$transaction(async (tx) => {
            const route = await tx.transportRoute.create({
                data: {
                    branchId,
                    routeName,
                    busNumber,
                    driverName,
                    capacity: parseInt(capacity, 10),
                    driverNumber,      // <-- New field
                    conductorName,     // <-- New field
                    conductorNumber,   // <-- New field
                    assignedMembers: [], // <-- Initialize JSON field
                },
            });

            if (busStops.length > 0) {
                await tx.busStop.createMany({
                    data: busStops.map((stop: any) => ({
                        name: stop.name,
                        pickupTime: stop.pickupTime,
                        dropTime: stop.dropTime,
                        charges: stop.charges,
                        routeId: route.id, // Link to the new route
                    })),
                });
            }
            return route;
        });

        res.status(201).json(newRoute);
    } catch (error) {
        next(error);
    }
};

export const updateTransportRoute = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getRegistrarBranchId(req);
    const { id: routeId } = req.params;
    const { busStops = [], ...routeData } = req.body;

    if (!branchId) return res.status(401).json({ message: "Authentication required." });

    try {
        await prisma.$transaction(async (tx) => {
            await tx.transportRoute.update({
                where: { id: routeId, branchId: branchId }, // Security check
                data: {
                    routeName: routeData.routeName,
                    busNumber: routeData.busNumber,
                    driverName: routeData.driverName,
                    capacity: routeData.capacity ? parseInt(routeData.capacity, 10) : undefined,
                    driverNumber: routeData.driverNumber,      // <-- New field
                    conductorName: routeData.conductorName,     // <-- New field
                    conductorNumber: routeData.conductorNumber,   // <-- New field
                },
            });

            // Separate new stops from existing ones
            const newStops = busStops.filter((stop: any) => stop.id.startsWith("new-"));
            const existingStopIds = busStops
                .filter((stop: any) => !stop.id.startsWith("new-"))
                .map((stop: any) => stop.id);

            // Find and delete stops that were removed from the UI
            const stopsToDelete = await tx.busStop.findMany({
                where: {
                    routeId: routeId,
                    id: { notIn: existingStopIds },
                },
                select: { id: true }
            });
            const stopIdsToDelete = stopsToDelete.map(s => s.id);

            if (stopIdsToDelete.length > 0) {
                // Un-assign members from these stops first
                await tx.student.updateMany({
                    where: { busStopId: { in: stopIdsToDelete } },
                    data: { busStopId: null, transportRouteId: null }
                });
                await tx.teacher.updateMany({
                    where: { busStopId: { in: stopIdsToDelete } },
                    data: { busStopId: null, transportRouteId: null }
                });

                // Delete the stops
                await tx.busStop.deleteMany({
                    where: { id: { in: stopIdsToDelete } }
                });
            }

            // Create the new stops
            if (newStops.length > 0) {
                await tx.busStop.createMany({
                    data: newStops.map((stop: any) => ({
                        name: stop.name,
                        pickupTime: stop.pickupTime,
                        dropTime: stop.dropTime,
                        charges: stop.charges,
                        routeId: routeId,
                    })),
                });
            }
        });

        res.status(200).json({ message: "Route updated successfully." });
    } catch (error: any) {
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Transport route not found in your branch." });
        }
        next(error);
    }
};

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


export const assignMemberToRoute = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { routeId, memberId, memberType, stopId } = req.body;

  if (!branchId)
    return res.status(401).json({ message: "Authentication required." });

  try {
    await prisma.$transaction(async (tx) => {
      const stop = await tx.busStop.findFirst({
        where: { id: stopId, routeId },
      });
      if (!stop) throw new Error("Stop not found.");

      // Financial Logic only for Students
      if (memberType === "Student") {
        const monthsLeft = getRemainingMonthsCount();
        const totalCharge = (stop.charges || 0) * monthsLeft;

        if (totalCharge > 0) {
          const student = await tx.student.findFirst({
            where: { id: memberId, branchId },
            include: {
              feeRecords: true,
              class: { include: { feeTemplate: true } },
            },
          });
          if (!student) throw new Error("Student not found.");

          let feeRecordId = student.feeRecords[0]?.id;

          if (!feeRecordId) {
            const templateAmount = student.class?.feeTemplate?.amount || 0;
            const newRecord = await tx.feeRecord.create({
              data: {
                studentId: memberId,
                totalAmount: templateAmount,
                paidAmount: 0,
                dueDate: new Date(new Date().getFullYear(), 3, 1),
              },
            });
            feeRecordId = newRecord.id;
          }

          // Update Balance & Log
          await tx.feeRecord.update({
            where: { id: feeRecordId },
            data: { totalAmount: { increment: totalCharge } },
          });

          await tx.feeAdjustment.create({
            data: {
              studentId: memberId,
              type: "charge",
              amount: totalCharge,
              reason: `Transport Assigned: ${stop.name} (${monthsLeft} months @ ${stop.charges})`,
              adjustedBy: req.user?.name || "Registrar",
              date: new Date(),
            },
          });
        }

        await tx.student.update({
          where: { id: memberId },
          data: { transportRouteId: routeId, busStopId: stopId },
        });
      } else {
        // Teacher logic (usually no fee impact)
        await tx.teacher.update({
          where: { id: memberId },
          data: { transportRouteId: routeId, busStopId: stopId },
        });
      }
    });
    res.status(200).json({ message: "Transport assigned and fees updated." });
  } catch (error: any) {
    next(error);
  }
};


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
        applicant: {
          branchId: branchId,
          role: "Student",
        },
      },
      include: {
        applicant: {
          select: {
            name: true,
            userId: true, 
            studentProfile: {
              select: {
                class: { select: { gradeLevel: true, section: true } }, 
              },
            },
          },
        },
      },
      orderBy: { fromDate: "desc" },
    });
    const formatted = applications.map((app) => {
      const sClass = app.applicant.studentProfile?.class;
      return {
        id: app.id,
        applicantName: app.applicant.name,
        studentId: app.applicant.userId, // Pass the ID
        studentClass: sClass
          ? `Grade ${sClass.gradeLevel}-${sClass.section}`
          : "N/A", // Pass the Class
        startDate: app.fromDate,
        endDate: app.toDate,
        leaveType: app.leaveType,
        reason: app.reason,
        status: app.status,
        isHalfDay: app.isHalfDay,
      };
    });

    res.status(200).json(formatted);
  } catch (error) {
    next(error);
  }
};


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
      include: {
        user: { select: { userId: true } },
      },
      orderBy: { name: "asc" },
    });

    // Swap the internal UUID with the readable VRTX- ID
    const formattedStudents = students.map((s) => ({
      ...s,
      userId: s.user?.userId || "N/A",
      user: undefined,
    }));

    res.status(200).json(formattedStudents);
  } catch (error) {
    next(error);
  }
};

export const getStudentProfileDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = await getRegistrarBranchId(req); // or getRegistrarBranchId
    const { studentId } = req.params;
    if (!branchId) return res.status(401).json({ message: "Unauthorized." });

    // 1. Fetch Student
    const student = await prisma.student.findFirst({
      where: { id: studentId, branchId },
      include: {
        class: {
          select: {
            id: true,
            gradeLevel: true,
            section: true,
            feeTemplate: { select: { amount: true, monthlyBreakdown: true } },
          },
        },
        room: { select: { fee: true, roomNumber: true } },
        busStop: { select: { charges: true, name: true } },
        parent: true,
        user: true,
        FeeAdjustment: { orderBy: { date: "asc" } },
        feeRecords: { include: { payments: true } },
        attendanceRecords: { orderBy: { date: "desc" }, take: 90 },
        grades: { include: { course: { select: { name: true } } } },
        skillAssessments: { orderBy: { assessedAt: "desc" }, take: 1 },
        submissions: {
          take: 5,
          orderBy: { submittedAt: "desc" },
          include: { assignment: { select: { title: true } } },
        },
        suspensionRecords: {
          where: { endDate: { gte: new Date() } },
          orderBy: { endDate: "desc" },
        },
        examMarks: {
          include: { examSchedule: { include: { subject: true } } },
        },
      },
    });

    if (!student)
      return res.status(404).json({ message: "Student not found." });

    // --- Ranking & Basic Stats ---
    // (Assuming you keep your existing ranking logic here...)
    let rankStats = { class: 0, school: 0 };
    // ... [Paste your existing Ranking Logic block here] ...

    const s = student as any;
    const {
      FeeAdjustment,
      feeRecords,
      attendanceRecords,
      skillAssessments,
      user: studentUser,
      parent,
      submissions,
      ...studentData
    } = s;

    // --- SMART FEE ENGINE (FIXED) ---

    // A. Service Start Dates
    const sessionStartYear =
      new Date().getMonth() < 3
        ? new Date().getFullYear() - 1
        : new Date().getFullYear();
    const sessionStartDate = new Date(sessionStartYear, 3, 1);

    const getServiceStartIndex = (keyword: string) => {
      const log = FeeAdjustment.find(
        (adj: any) => adj.reason && adj.reason.includes(keyword)
      );
      if (log) return getAcademicMonthIndex(new Date(log.date));

      // Fallback: If admission was during this session, use admission month
      const admission = new Date(s.createdAt);
      if (admission > sessionStartDate) return getAcademicMonthIndex(admission);
      return 0; // Default to start of session
    };

    const hostelStartIndex = s.room
      ? getServiceStartIndex("Hostel Assigned")
      : 999;
    const transportStartIndex = s.busStop
      ? getServiceStartIndex("Transport Assigned")
      : 999;

    // B. Breakdown Calculation
    const templateBreakdown =
      (s.class?.feeTemplate?.monthlyBreakdown as any[]) || [];
    const monthlyHostelFee = Number(s.room?.fee || 0);
    const monthlyTransportFee = Number(s.busStop?.charges || 0);

    let calculatedTotalFee = 0;

    const dynamicBreakdown = ACADEMIC_MONTH_NAMES.map((monthName, index) => {
      const templateMonth = templateBreakdown.find(
        (m: any) => m.month === monthName
      );

      // --- FIX: Priority to Summing Breakdown ---
      let tuition = 0;
      if (templateMonth) {
        if (
          templateMonth.breakdown &&
          Array.isArray(templateMonth.breakdown) &&
          templateMonth.breakdown.length > 0
        ) {
          // Priority 1: Calculate fresh sum from components
          tuition = templateMonth.breakdown.reduce(
            (sum: number, c: any) => sum + (Number(c.amount) || 0),
            0
          );
        } else if (templateMonth.total) {
          // Priority 2: Use total if breakdown is missing
          tuition = Number(templateMonth.total);
        }
      } else if (s.class?.feeTemplate?.amount) {
        // Priority 3: Distribute annual fee
        tuition = Math.ceil(s.class.feeTemplate.amount / 12);
      }

      // Service Charges
      const hostelCharge = index >= hostelStartIndex ? monthlyHostelFee : 0;
      const transportCharge =
        index >= transportStartIndex ? monthlyTransportFee : 0;

      const monthTotal = tuition + hostelCharge + transportCharge;
      calculatedTotalFee += monthTotal;

      // Components for Frontend
      const components = [];
      if (tuition > 0)
        components.push({ component: "Tuition", amount: tuition });
      if (hostelCharge > 0)
        components.push({
          component: `Hostel (${s.room?.roomNumber})`,
          amount: hostelCharge,
        });
      if (transportCharge > 0)
        components.push({
          component: `Transport (${s.busStop?.name})`,
          amount: transportCharge,
        });

      return {
        month: monthName,
        total: monthTotal,
        breakdown: components,
      };
    });

    // C. Ledger Logic
    const feeRecord = feeRecords[0];
    const adjustments = s.FeeAdjustment || [];
    const totalAdjustments = adjustments.reduce((acc: number, adj: any) => {
      return adj.type === "charge" ? acc + adj.amount : acc - adj.amount;
    }, 0);

    let netTotal = 0;
    let paidAmount = 0;

    if (feeRecord) {
      netTotal = feeRecord.totalAmount;
      paidAmount = feeRecord.paidAmount;
    } else {
      netTotal = calculatedTotalFee; // Use our robust calculation
      paidAmount = 0;
    }

    const feeStatus = {
      total: netTotal,
      paid: paidAmount,
      pending: netTotal - paidAmount,
    };

    // --- Formatting (History, etc.) ---
    // ... (Same formatting logic as previous steps) ...
    const paymentHistory = (feeRecord?.payments || []).map((p: any) => ({
      ...p,
      itemType: "payment" as const,
    }));
    const adjustmentHistory = (s.FeeAdjustment || []).map((adj: any) => ({
      ...adj,
      itemType: "adjustment" as const,
    }));
    const feeHistory = [...paymentHistory, ...adjustmentHistory].sort(
      (a: any, b: any) =>
        new Date(b.date || b.paidDate).getTime() -
        new Date(a.date || a.paidDate).getTime()
    );

    const grades = s.examMarks.map((mark: any) => ({
      courseName: mark.examSchedule?.subject?.name || "Unknown Subject",
      score: mark.score,
      total: mark.totalMarks || 100, // Optional: Include total if your frontend needs it
    }));

    // --- 2. Skills Logic ---
    // Takes the most recent assessment and converts the JSON object to an array
    let skills: { skill: string; value: number }[] = [];
    if (skillAssessments.length > 0 && skillAssessments[0].skills) {
      const skillObj = skillAssessments[0].skills as Record<string, number>;
      skills = Object.entries(skillObj).map(([key, value]) => ({
        skill: key,
        value: value,
      }));
    } else {
      // Optional: Default skills if none exist (prevents empty charts)
      skills = [
        { skill: "Communication", value: 0 },
        { skill: "Discipline", value: 0 },
        { skill: "Participation", value: 0 },
      ];
    }

    // --- 3. Recent Activity Logic ---
    // Combines Attendance (Top 3) and Assignment Submissions into one timeline
    const recentActivity = [
      ...attendanceRecords.slice(0, 3).map((a: any) => ({
        date: new Date(a.date).toISOString().split("T")[0],
        activity: `Marked ${a.status}`,
      })),
      ...submissions.map((sub: any) => ({
        date: new Date(sub.submittedAt).toISOString().split("T")[0],
        activity: `Submitted "${sub.assignment.title}"`,
      })),
    ]
      .sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      .slice(0, 10); // Keep only the 10 most recent events

    // --- Final Response ---
    const profile = {
      student: {
        ...studentData,
        userId: studentUser?.userId || "N/A",
        room: s.room,
        busStop: s.busStop,
      },
      userId: studentUser?.userId || "N/A",
      studentUser,
      parent,
      classInfo: s.class
        ? `Grade ${s.class.gradeLevel}-${s.class.section}`
        : "Unassigned",
      attendance: { present: 0, total: 0, absent: 0 }, // Add real logic back
      attendanceHistory: attendanceRecords,
      feeStatus,
      feeHistory,
      grades: grades,
      skills: skills,
      recentActivity: recentActivity,
      rank: rankStats,
      activeSuspension: null,
      feeBreakdown: dynamicBreakdown, // <--- Now guaranteed to have values
    };

    res.status(200).json(profile);
  } catch (error: any) {
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


export const getSchoolEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
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

export const createSchoolEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId || !req.user?.name) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { name, date, description, location, category, audience } = req.body;

  if (!name || !date || !category) {
    return res
      .status(400)
      .json({ message: "Name, date, and category are required." });
  }

  try {
    const newEvent = await prisma.schoolEvent.create({
      data: {
        branchId,
        name,
        date: new Date(date),
        description,
        location,
        category,
        audience,
        createdBy: req.user.name,
        status: EventStatus.Pending, // Events require approval
      },
    });
    res.status(201).json(newEvent);
  } catch (error) {
    next(error);
  }
};

export const updateSchoolEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getRegistrarBranchId(req);
  const { id } = req.params;
  const { name, date, description, location, category, audience } = req.body;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const result = await prisma.schoolEvent.updateMany({
      where: {
        id: id,
        branchId: branchId, // Security check
      },
      data: {
        name,
        date: new Date(date),
        description,
        location,
        category,
        audience,
        status: EventStatus.Pending, // Re-set to Pending after edit
      },
    });

    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Event not found in your branch." });
    }
    res.status(200).json({ message: "Event updated successfully." });
  } catch (error) {
    next(error);
  }
};

export const deleteSchoolEvent = async (
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
    const result = await prisma.schoolEvent.deleteMany({
      where: {
        id: id,
        branchId: branchId, // Security check
      },
    });

    if (result.count === 0) {
      return res
        .status(404)
        .json({ message: "Event not found in your branch." });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// --- Communication Management ---

export const getAnnouncements = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const announcements = await prisma.announcement.findMany({
      where: { branchId },
      orderBy: { sentAt: "desc" },
    });
    res.status(200).json(announcements);
  } catch (error) {
    next(error);
  }
};

export const sendAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { title, message, audience } = req.body;
  if (!title || !message || !audience) {
    return res.status(400).json({ message: "Title, message, and audience are required." });
  }

  try {
    const newAnnouncement = await prisma.announcement.create({
      data: {
        branchId,
        title,
        message,
        audience,
      },
    });
    res.status(201).json(newAnnouncement);
  } catch (error) {
    next(error);
  }
};

export const getSmsHistory = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const smsHistory = await prisma.smsMessage.findMany({
      where: { branchId },
      orderBy: { sentAt: "desc" },
    });
    res.status(200).json(smsHistory);
  } catch (error) {
    next(error);
  }
};

export const sendSmsToStudents = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getRegistrarBranchId(req);
  const sentBy = req.user?.name || "Registrar" || "Principal";

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const { studentIds, message } = req.body;
  if (!studentIds || !Array.isArray(studentIds) || !message) {
    return res.status(400).json({ message: "Student IDs array and message are required." });
  }

  try {
    // In a real app, you would fetch parents' phone numbers here
    // and send the SMS via an external gateway (e.g., Twilio).

    // For now, we will just LOG the action to the SmsMessage table.
    const newSmsLog = await prisma.smsMessage.create({
      data: {
        branchId,
        message,
        recipientCount: studentIds.length,
        sentBy,
      },
    });

    // We return the response the frontend expects
    res.status(201).json({
      success: true,
      count: studentIds.length,
      log: newSmsLog,
    });
  } catch (error) {
    next(error);
  }
};