//`src/controllers/principalController.ts`

import { Request, Response, NextFunction } from "express";
import { PrincipalApiService } from "../services/principalApiService";
import prisma from "../prisma";
import {
  SchoolClass,
  Teacher,
  Student,
  Course,
  ExamMark,
  FeeRecord,
  Branch,
  UserRole,
  ExamResultStatus,
} from "@prisma/client";
import { generatePassword } from "../utils/helpers";
import bcrypt from "bcryptjs";
type GraphDataPoint = {
  name: string; 
  value: number; 
};
const principalApiService = new PrincipalApiService();

const getPrincipalBranchId = (req: Request): string | null => {
  if (req.user?.role === "Principal" && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
};

const getPrincipalAuth = async (req: Request) => {
  const userId = req.user?.id;
  if (!userId) return null;

  // 1. If user has a branchId (e.g. from token), verify it's the one they manage
  if (req.user?.branchId) return req.user.branchId;

  // 2. Fallback: Find the branch where this user is the Principal
  const branch = await prisma.branch.findUnique({
    where: { principalId: userId },
    select: { id: true },
  });
  return branch?.id || null;
};

export const getClassDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  const { classId } = req.params;
  if (!branchId) return res.status(401).json({ message: "Unauthorized." });

  try {
    // 1. Fetch Class Info (Include Mentor Name for completeness)
    const classInfo = await prisma.schoolClass.findFirst({
      where: { id: classId, branchId },
      include: {
        mentor: { select: { id: true, name: true } },
      },
    });

    if (!classInfo) {
      return res
        .status(404)
        .json({ message: "Class not found in your branch." });
    }

    // 2. Fetch Related Data
    const students = await prisma.student.findMany({
      where: { classId },
      orderBy: { name: "asc" },
    });

    const courses = await prisma.course.findMany({
      where: { schoolClassId: classId },
      include: { subject: true, teacher: true },
    });

    const performance = courses.map((c) => ({
      subjectId: c.subjectId,
      subjectName: c.subject.name,
      averageScore: 70 + Math.random() * 25, 
    }));

    // 4. Calculate Fees
    const feeRecords = await prisma.feeRecord.findMany({
      where: { student: { classId } },
    });

    const totalPending = feeRecords.reduce(
      (sum, r) => sum + (r.totalAmount - r.paidAmount),
      0
    );

    const defaulters = feeRecords
      .filter((r) => r.totalAmount > r.paidAmount)
      .map((r) => {
        const student = students.find((s) => s.id === r.studentId);
        return {
          studentId: r.studentId,
          studentName: student?.name || "Unknown",
          pendingAmount: r.totalAmount - r.paidAmount,
        };
      });

    const details: any = {
      classInfo: {
        ...classInfo,
        mentorTeacherId: classInfo.mentorId,
      },
      students,
      subjects: courses.map((c) => ({
        subjectId: c.subjectId,
        subjectName: c.subject.name,
        teacherName: c.teacher?.name || "N/A",
        syllabusCompletion: c.syllabusCompletion,
      })),
      performance,
      fees: {
        totalPending,
        defaulters,
      },
    };

    res.status(200).json(details);
  } catch (error) {
    next(error);
  }
};



export const assignClassMentor = async (req: Request, res: Response, next: NextFunction) => {
    const branchId = getPrincipalBranchId(req);
    const { classId } = req.params;
    const { teacherId } = req.body; // teacherId can be string or null

    if (!branchId) return res.status(401).json({ message: "Unauthorized." });

    try {
        await prisma.schoolClass.updateMany({
            where: { id: classId, branchId }, // Security check
            data: { mentorId: teacherId },
        });
        res.status(200).json({ message: "Mentor updated successfully." });
    } catch (error) {
        next(error);
    }
};


export const assignFeeTemplateToClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  const { classId } = req.params;
  const { feeTemplateId } = req.body;

  if (!branchId) return res.status(401).json({ message: "Unauthorized." });

  try {
    // This code is now correct AFTER you update your schema.prisma
    await prisma.schoolClass.updateMany({
      where: { id: classId, branchId },
      data: { feeTemplateId: feeTemplateId },
    });
    res.status(200).json({ message: "Fee template assigned successfully." });
  } catch (error) {
    next(error);
  }
};


async function resolveBranchByIdOrRegistration(identifier: string | undefined) {
  if (!identifier) return null;
  // try id first
  let branch = await prisma.branch.findUnique({ where: { id: identifier } });
  if (branch) return branch;
  // fallback to registrationId
  branch = await prisma.branch.findUnique({ where: { registrationId: identifier } });
  return branch;
}

export const getPrincipalDashboardData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({
      message: "Unauthorized: Principal must be associated with a branch.",
    });
  }

  try {
    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      feesCollected,
      classPerformance,
      teacherPerformanceRaw,
      topStudentsRaw,
      syllabusProgress,
      collectionsByGrade,
      allEvents,
      pendingStaffRequests,
      allBranches,
      lastPayment,
    ] = await prisma.$transaction([
      prisma.student.count({ where: { branchId } }),
      prisma.teacher.count({ where: { branchId } }),
      prisma.schoolClass.count({ where: { branchId } }),
      prisma.feePayment.aggregate({
        _sum: { amount: true },
        where: { student: { branchId } },
      }),
      prisma.schoolClass.findMany({
        where: { branchId },
        select: {
          gradeLevel: true,
          section: true,
          examMarks: { select: { score: true } },
        },
      }),
      prisma.teacher.findMany({
        where: { branchId },
        select: {
          id: true,
          name: true,
          courses: { select: { syllabusCompletion: true } },
          examMarks: { select: { score: true } },
        },
      }),
      prisma.student.findMany({
        where: { branchId },
        select: {
          id: true,
          name: true,
          class: { select: { gradeLevel: true, section: true } },
          examMarks: { select: { score: true } },
        },
        take: 100,
      }),
      prisma.course.findMany({
        where: { branchId },
        select: {
          subject: { select: { name: true } },
          syllabusCompletion: true,
        },
      }),
      prisma.schoolClass.findMany({
        where: { branchId },
        select: {
          gradeLevel: true,
          section: true,
          students: {
            select: {
              feeRecords: { select: { totalAmount: true, paidAmount: true } },
            },
          },
        },
      }),
      prisma.schoolEvent.findMany({ where: { branchId } }),
      prisma.leaveApplication.count({
        where: {
          status: "Pending",
          applicant: {
            branchId: branchId,
            role: { in: ["Teacher", "Registrar", "Librarian", "SupportStaff"] },
          },
        },
      }),
      prisma.branch.findMany({
        select: {
          id: true,
          name: true,
          stats: true,
          email: true,
          helplineNumber: true,
          nextDueDate: true,
          billingCycle: true,
          location: true,
        },
      }),
      prisma.erpPayment.findFirst({
  where: { branchId: branchId },
  orderBy: { paymentDate: "desc" },
}),
    ]);

    const transformedClassPerformance = classPerformance.map(
      (c: {
        gradeLevel: number;
        section: string;
        examMarks: { score: number }[];
      }) => {
        const total = c.examMarks.length;
        const sum = c.examMarks.reduce(
          (acc: number, mark: { score: number }) => acc + mark.score,
          0
        );
        return {
          name: `Grade ${c.gradeLevel}-${c.section}`,
          performance: total > 0 ? sum / total : 0,
        };
      }
    );

    const transformedTeacherPerformance = teacherPerformanceRaw
      .map(
        (t: {
          id: string;
          name: string;
          courses?: { syllabusCompletion: number | null }[];
          examMarks?: { score: number | null }[];
        }) => {
          const avgSyllabus = t.courses?.length
            ? t.courses.reduce(
                (acc, c) => acc + (c.syllabusCompletion ?? 0),
                0
              ) / t.courses.length
            : 0;

          const avgScore = t.examMarks?.length
            ? t.examMarks.reduce((acc, m) => acc + (m.score ?? 0), 0) /
              t.examMarks.length
            : 0;

          return {
            teacherId: t.id,
            teacherName: t.name,
            avgStudentScore: avgScore,
            syllabusCompletion: avgSyllabus,
            performanceIndex: avgSyllabus * 0.4 + avgScore * 0.6,
          };
        }
      )
      .sort((a, b) => b.performanceIndex - a.performanceIndex)
      .slice(0, 5);

    const transformedTopStudents = topStudentsRaw
      .map((s) => {
        const totalMarks = s.examMarks.length;
        const sumOfMarks = s.examMarks.reduce(
          (acc: number, mark: { score: number }) => acc + mark.score,
          0
        );
        return {
          student: s,
          avgScore: totalMarks > 0 ? sumOfMarks / totalMarks : 0,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5)
      .map((s, index) => ({
        studentId: s.student.id,
        studentName: s.student.name,
        className: s.student.class
          ? `Grade ${s.student.class.gradeLevel}-${s.student.class.section}`
          : "N/A",
        rank: index + 1,
      }));

    const allScores = allBranches
    .map((b) => {
      const stats = (b.stats as any) || {};
      const healthScore =
        typeof stats.healthScore === "number" ? stats.healthScore : 70;
      return {
        id: b.id,
        score: healthScore,
      };
    })
    .sort((a, b) => b.score - a.score);


    const myRank =
      allScores.findIndex((s: { id: string }) => s.id === branchId) + 1;
    const myScore =
      allScores.find((s: { id: string }) => s.id === branchId)?.score || 70;
    const averageScore =
      allScores.reduce(
        (acc: number, s: { score: number }) => acc + s.score,
        0
      ) / (allScores.length || 1);
    const myBranchDetails = allBranches.find((b) => b.id === branchId);
    const dashboardData = {
      branch: {
        name: myBranchDetails?.name,
        email: myBranchDetails?.email,
        helplineNumber: myBranchDetails?.helplineNumber,
        nextDueDate: myBranchDetails?.nextDueDate,
        billingCycle: myBranchDetails?.billingCycle,
        location: myBranchDetails?.location,
      },
      lastPayment: lastPayment || null,
      summary: {
        totalStudents,
        totalTeachers,
        totalClasses,
        feesCollected: feesCollected._sum.amount || 0,
      },
      classPerformance: transformedClassPerformance,
      teacherPerformance: transformedTeacherPerformance,
      topStudents: transformedTopStudents,
      syllabusProgress: syllabusProgress.map(
        (s: {
          subject: { name: string };
          syllabusCompletion: number | null;
        }) => ({
          name: s.subject.name,
          progress: s.syllabusCompletion ?? 0,
        })
      ),

      collectionsByGrade: collectionsByGrade.map(
        (c: {
          gradeLevel: number;
          section: string;
          students: {
            feeRecords: { totalAmount: number; paidAmount: number }[];
          }[];
        }) => {
          const totals = c.students
            .flatMap((s) => s.feeRecords)
            .reduce(
              (acc, fr) => {
                acc.due += fr.totalAmount;
                acc.collected += fr.paidAmount;
                return acc;
              },
              { due: 0, collected: 0 }
            );
          return {
            name: `Grade ${c.gradeLevel}-${c.section}`,
            ...totals,
          };
        }
      ),

      schoolRank: myRank || allBranches.length,
      schoolScore: myScore,
      averageSchoolScore: averageScore,
      allEvents,
      pendingStaffRequests: {
        leave: pendingStaffRequests,
        attendance: 0,
        fees: 0,
      },
      classes: await prisma.schoolClass
        .findMany({
          where: { branchId },
          select: { id: true, gradeLevel: true, section: true },
        })
        .then((classes) =>
          classes.map(
            (c: { id: string; gradeLevel: number; section: string }) => ({
              id: c.id,
              name: `Grade ${c.gradeLevel}-${c.section}`,
            })
          )
        ),
      subjectPerformanceByClass: {},
    };

    res.status(200).json(dashboardData);
  } catch (error) {
    next(error);
  }
};



export const getBranchDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  try {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }
    res.status(200).json(branch);
  } catch (error) {
    next(error);
  }
};



export const updateBranchDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  try {
    const updatedBranch = await prisma.branch.update({
      where: { id: branchId },
      data: req.body,
    });
    res.status(200).json(updatedBranch);
  } catch (error) {
    next(error);
  }
};

export const getFacultyApplicationsByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  try {
    const applications = await prisma.facultyApplication.findMany({
      where: { branchId },
    });
    res.status(200).json(applications);
  } catch (error) {
    next(error);
  }
};

export const approveFacultyApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const { salary } = req.body;
  const branchId = getPrincipalBranchId(req); // Assuming this helper exists

  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    // 1. Find the application and verify it's in the principal's branch
    const application = await prisma.facultyApplication.findUnique({
      where: { id },
    });
    if (!application || application.branchId !== branchId) {
      return res.status(404).json({ message: "Application not found." });
    }

    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 2. Create the User record
    const newTeacherUser = await prisma.user.create({
      data: {
        name: application.name,
        email: application.email,
        phone: application.phone,
        branchId: branchId,
        role: "Teacher",
        designation: "Teacher",
        passwordHash: hashedPassword,
        userId: `VRTX-${branchId.substring(0, 4)}-TCH-${Date.now()
          .toString()
          .slice(-4)}`,
      },
    });

    // 3. Create the Teacher record, copying all data
    await prisma.teacher.create({
      data: {
        user: { connect: { id: newTeacherUser.id } },
        name: application.name,
        email: application.email,
        phone: application.phone,
        qualification: application.qualification,
        branch: { connect: { id: branchId } },
        salary: salary,
        subjectIds: application.subjectIds,
        gender: application.gender,
        doj: application.doj,
        bloodGroup: application.bloodGroup,
        alternatePhone: application.alternatePhone,
        address: application.address,
        governmentDocNumber: application.governmentDocNumber,
        fatherName: application.fatherName,
        motherName: application.motherName,
      },
    });

    // 4. Update the application status
    await prisma.facultyApplication.update({
      where: { id },
      data: { status: "Approved" },
    });

    res.status(200).json({
      message: "Application approved.",
      credentials: { userId: newTeacherUser.userId, password: tempPassword },
    });
  } catch (error) {
    next(error);
  }
};


export const requestProfileAccessOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    // In a real application, you would generate a random OTP, save it to the user's record with an expiry,
    // and then use an SMS service to send it to the user's phone number.

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.user.update({
      where: { id: req.user.id },
      data: { profileAccessOtp: otp },
    });

    // This log simulates the SMS sending process for development.
    // In production, you would replace this with a call to an SMS gateway API (like Twilio, Vonage, etc.).
    console.log(
      `[SIMULATED SMS] OTP for user ${req.user.name} (${req.user.id}): ${otp}`
    );

    res
      .status(200)
      .json({ message: "OTP sent to your registered mobile number." });
  } catch (error) {
    next(error);
  }
};

export const verifyProfileAccessOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ message: "OTP is required." });
    }

    // Find the user to get the stored OTP
    const userWithOtp = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!userWithOtp || !userWithOtp.profileAccessOtp) {
      return res
        .status(400)
        .json({ message: "No OTP was requested or it has expired." });
    }

    if (userWithOtp.profileAccessOtp === otp) {
      // OTP is correct. Clear the OTP from the database to prevent reuse.
      await prisma.user.update({
        where: { id: req.user.id },
        data: { profileAccessOtp: null },
      });
      res
        .status(200)
        .json({ success: true, message: "OTP verified successfully." });
    } else {
      // OTP is incorrect
      res.status(401).json({ success: false, message: "Invalid OTP." });
    }
  } catch (error) {
    next(error);
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

export const getFaculty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res.status(401).json({ message: "Unauthorized access." });
    }

    const staff = await prisma.user.findMany({
      where: {
        branchId: req.user.branchId,
        role: {
          in: [
            "Teacher",
            "Registrar",
            "Librarian",
            "SupportStaff",
            "Principal",
          ],
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
        createdAt: true,
        teacher: true,
        salary: true, 
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(staff);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
export const createStaffMember = async (req: Request, res: Response) => {
  try {
    // Ensure authenticated principal with branch
    if (!req.user?.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }

    const branchId = req.user.branchId;
    const { name, email, phone, salary, role, designation } = req.body;

    // Basic validation
    if (!name || !email || !role) {
      return res
        .status(400)
        .json({ message: "Missing required fields: name, email or role." });
    }

    // Map role to prefix for userId
    const rolePrefixMap: Record<string, string> = {
      Registrar: "REG",
      Librarian: "LIB",
      Teacher: "TCH",
      Accountant: "ACC",
      Clerk: "CLK",
      Student:"STU",
      SupportStaff: "STF",
      Parent: "PRT"
    };
    const prefix = rolePrefixMap[role] || "STF";

    // Generate a reasonably-unique userId based on role count + branch slice
    const roleCount = await prisma.user.count({ where: { role } });
    const seq = (roleCount + 1).toString().padStart(6, "0");
    const userId = `VRTX-${prefix}-${seq}`;

    // generate temporary password and hash it
    const tempPassword = generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Create the base user record
    const newUser = await prisma.user.create({
      data: {
        userId,
        name,
        email,
        phone,
        branchId,
        role,
        designation: designation || null,
        passwordHash,
      },
    });

    // If the staff is a teacher, also create Teacher record linking to the user
    if (role === "Teacher") {
      await prisma.teacher.create({
        data: {
          user: { connect: { id: newUser.id } },
          name,
          email,
          phone,
          qualification: req.body.qualification || null,
          branch: { connect: { id: branchId } },
          salary: salary ?? null,
        },
      });
    }

    // Respond with credentials expected by frontend (email + generated password + userId)
    res.status(201).json({
      message: "Staff member created.",
      credentials: { email: newUser.email, password: tempPassword, userId: newUser.userId },
    });
  } catch (error: any) {
    // handle unique constraint error (email/userId collision)
    if (error?.code === "P2002") {
      // Prisma unique constraint violation
      return res
        .status(409)
        .json({ message: "A user with that email or userId already exists." });
    }
    res.status(500).json({ message: error?.message || "Server error." });
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

export const deleteStaff = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || !req.user.branchId) {
      return res
        .status(401)
        .json({ message: "Authentication required with a valid branch." });
    }

    const staffId = req.params.id;

    // Prevent deleting yourself in controller too (extra guard)
    if (req.user.id === staffId) {
      return res
        .status(403)
        .json({ message: "You cannot delete your own account." });
    }

    await principalApiService.deleteStaff(
      staffId,
      req.user.id,
      req.user.branchId
    );
    res.status(204).send();
  } catch (error: any) {
    if (error.code === "NOT_FOUND")
      return res.status(404).json({ message: error.message });
    if (error.code === "FORBIDDEN")
      return res.status(403).json({ message: error.message });
    next(error);
  }
};

export const getTeacherProfileDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = await getPrincipalAuth(req);
    // This 'id' from params is the User ID (UUID) passed from the staff list
    const { id: userId } = req.params;

    if (!branchId) return res.status(401).json({ message: "Unauthorized" });

    // 1. Fetch Teacher with the User relation to get the readable ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId: userId, branchId },
      include: {
        user: { select: { userId: true } }, // <--- FETCH THE READABLE ID (VRTX-...)
        schoolClasses: true,
        subjects: true,
        attendanceRecords: {
          orderBy: { date: "desc" },
          take: 30,
        },
        courses: {
          include: {
            subject: { select: { name: true } },
            schoolClass: {
              select: { id: true, gradeLevel: true, section: true },
            },
          },
        },
      },
    });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found." });
    }

    // 2. Fetch Mentored Classes
    const mentoredClasses = await prisma.schoolClass.findMany({
      where: { mentorId: teacher.id, branchId },
      select: { id: true, gradeLevel: true, section: true },
    });

    // 3. Logic: Syllabus Progress
    const syllabusProgress = await Promise.all(
      teacher.courses.map(async (course) => {
        if (!course.schoolClass || !course.subject) return null;

        const [totalLectures, completedLectures] = await Promise.all([
          prisma.lecture.count({
            where: {
              teacherId: teacher.id,
              classId: course.schoolClassId!,
              subjectId: course.subjectId,
            },
          }),
          prisma.lecture.count({
            where: {
              teacherId: teacher.id,
              classId: course.schoolClassId!,
              subjectId: course.subjectId,
              status: "completed",
            },
          }),
        ]);

        const percentage =
          totalLectures > 0
            ? Math.round((completedLectures / totalLectures) * 100)
            : 0;

        return {
          className: `Grade ${course.schoolClass.gradeLevel}-${course.schoolClass.section}`,
          subjectName: course.subject.name,
          completionPercentage: percentage,
        };
      })
    );

    // 4. Logic: Class Performance
    const examAggregates = await prisma.examMark.groupBy({
      by: ["schoolClassId"],
      where: { teacherId: teacher.id },
      _avg: { score: true, totalMarks: true },
    });

    const classIdToNameMap = new Map(
      teacher.schoolClasses.map((c) => [
        c.id,
        `Grade ${c.gradeLevel}-${c.section}`,
      ])
    );

    const classPerformance = examAggregates
      .map((agg) => {
        const avgScore = agg._avg.score || 0;
        const avgTotal = agg._avg.totalMarks || 100;
        const percentage = Math.round((avgScore / avgTotal) * 100);

        return {
          className: classIdToNameMap.get(agg.schoolClassId) || "Unknown Class",
          averageStudentScore: percentage,
        };
      })
      .filter((item) => item.className !== "Unknown Class");

    // 5. Logic: Payroll History
    const payrollRecords = await prisma.payrollRecord.findMany({
      where: { staffId: userId },
      orderBy: { id: "desc" },
      take: 6,
      select: { month: true, netPayable: true, status: true },
    });

    const payrollHistory = payrollRecords.map((p) => ({
      month: p.month,
      amount: p.netPayable || 0,
      status: p.status as "Paid" | "Pending",
    }));

    // 6. Attendance Stats
    const present = teacher.attendanceRecords.filter(
      (r) => r.status === "Present"
    ).length;
    const total = teacher.attendanceRecords.length;

    // --- Final Assembly ---
    // Remove the 'user' object from the spread to keep the response clean
    const { user, ...teacherData } = teacher;

    const profile = {
      teacher: {
        ...teacherData,
        // FORCE OVERWRITE: We replace the UUID with the readable ID from the User table
        userId: user.userId,
      },
      assignedClasses:
        teacher.schoolClasses.map((c) => ({
          id: c.id,
          name: `Grade ${c.gradeLevel}-${c.section}`,
        })) || [],
      assignedSubjects: teacher.subjects || [],
      mentoredClasses:
        mentoredClasses.map((c) => ({
          id: c.id,
          name: `Grade ${c.gradeLevel}-${c.section}`,
        })) || [],

      syllabusProgress: syllabusProgress.filter((p) => p !== null),
      classPerformance: classPerformance,
      payrollHistory: payrollHistory,

      attendance: { present, total },
    };

    res.status(200).json(profile);
  } catch (error: any) {
    next(error);
  }
};


export const getSchoolEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  try {
    const events = await prisma.schoolEvent.findMany({
      where: { branchId },
      orderBy: { date: "desc" },
    });
    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
};

export const deleteSchoolEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  const { eventId } = req.params;
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  try {
    // Security check: ensure the event belongs to the principal's branch before deleting
    const eventToDelete = await prisma.schoolEvent.findFirst({
      where: { id: eventId, branchId: branchId },
    });

    if (!eventToDelete) {
      return res
        .status(404)
        .json({ message: "Event not found in your branch." });
    }

    await prisma.schoolEvent.delete({ where: { id: eventId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getValidatedBranchId = async (req: Request) => {
  const branchId = getPrincipalBranchId(req);
  if (
    !branchId ||
    !(await prisma.branch.findUnique({ where: { id: branchId } }))
  ) {
    return null;
  }
  return branchId;
};

export const getStudentsForPrincipal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = await getValidatedBranchId(req);
    if (!branchId)
      return res
        .status(404)
        .json({ message: "Branch not found for this principal." });
    const students = await prisma.student.findMany({
      where: { branchId },
      orderBy: { name: "asc" },
    });
    res.status(200).json(students);
  } catch (error) {
    next(error);
  }
};

export const getSchoolClassesForPrincipal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = await getValidatedBranchId(req);
    if (!branchId)
      return res
        .status(404)
        .json({ message: "Branch not found for this principal." });
    const classes = await prisma.schoolClass.findMany({
      where: { branchId },
      orderBy: [{ gradeLevel: "asc" }, { section: "asc" }],
    });
    res.status(200).json(classes);
  } catch (error) {
    next(error);
  }
};

export const getSuspensionRecordsForPrincipal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = await getValidatedBranchId(req);
    if (!branchId)
      return res
        .status(404)
        .json({ message: "Branch not found for this principal." });

    // THE TRUE NAME IS SPOKEN: The scribe now calls the chronicle by its correct name.
    const records = await prisma.suspensionRecord.findMany({
      where: { student: { branchId } },
    });

    res.status(200).json(records);
  } catch (error) {
    next(error);
  }
};

export const getFeeRecordsForPrincipal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = await getValidatedBranchId(req);
    if (!branchId)
      return res
        .status(404)
        .json({ message: "Branch not found for this principal." });
    const records = await prisma.feeRecord.findMany({
      where: { student: { branchId } },
    });
    res.status(200).json(records);
  } catch (error) {
    next(error);
  }
};

export const getAttendanceRecordsForPrincipal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = await getValidatedBranchId(req);
    if (!branchId)
      return res
        .status(404)
        .json({ message: "Branch not found for this principal." });
    const records = await prisma.attendanceRecord.findMany({
      where: { student: { branchId } },
    });
    res.status(200).json(records);
  } catch (error) {
    next(error);
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




export const getPrincipalClassView = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = await getPrincipalAuth(req);
    if (!branchId) return res.status(401).json({ message: "Unauthorized" });

    // 1. Fetch Classes with related data
    const classes = await prisma.schoolClass.findMany({
      where: { branchId },
      include: {
        // Get teachers via Courses linked to this class
        courses: {
          include: {
            teacher: {
              select: { name: true, user: { select: { email: true } } },
            },
            subject: { select: { name: true } },
          },
        },
        // Get students to calculate stats
        students: {
          select: {
            id: true,
            attendanceRecords: { take: 30 }, // Last 30 days
            examMarks: { select: { score: true, totalMarks: true } },
          },
        },
        // Get Syllabus progress (we'll calculate this from Lectures)
        // Note: This is complex, so we might approximate it or do a separate query if performance is bad
      },
    });

    // 2. Transform Data for Frontend
    const aggregatedClasses = await Promise.all(
      classes.map(async (c) => {
        // Calculate Avg Attendance
        let totalPresence = 0;
        let totalRecords = 0;
        c.students.forEach((s) => {
          totalPresence += s.attendanceRecords.filter(
            (r) => r.status === "Present"
          ).length;
          totalRecords += s.attendanceRecords.length;
        });
        const avgAttendance =
          totalRecords > 0 ? (totalPresence / totalRecords) * 100 : 0;

        // Calculate Avg Performance
        let totalScore = 0;
        let totalMaxScore = 0;
        c.students.forEach((s) => {
          s.examMarks.forEach((m) => {
            totalScore += m.score;
            totalMaxScore += m.totalMarks;
          });
        });
        const avgPerformance =
          totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

        // Calculate Syllabus Completion (Average of all courses in class)
        // This is a simplified calculation. Real logic would look at Lecture tables.
        // We will assume 0 for now to keep the query fast, or fetch if needed.
        const syllabusCompletion = 0;

        // Extract unique teachers
        const teacherMap = new Map();
        c.courses.forEach((course) => {
          if (course.teacher && !teacherMap.has(course.teacherId)) {
            teacherMap.set(course.teacherId, {
              name: course.teacher.name,
              subject: course.subject.name,
            });
          }
        });
        const uniqueTeachers = Array.from(teacherMap.values());

        return {
          id: c.id,
          branchId: c.branchId,
          gradeLevel: c.gradeLevel,
          section: c.section,
          subjectIds: [], // Placeholder, not strictly needed for this view
          studentIds: c.students.map((s) => s.id),
          mentorTeacherId: c.mentorId,
          feeTemplateId: c.feeTemplateId,

          // Extended Props
          students: [], // We don't send full student objects here to save bandwidth
          stats: {
            avgAttendance,
            avgPerformance,
            syllabusCompletion,
          },
          teachers: uniqueTeachers,
        };
      })
    );

    res.status(200).json(aggregatedClasses);
  } catch (error: any) {
    next(error);
  }
};

export const getAttendanceOverview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res
      .status(401)
      .json({ message: "Authentication required with a valid branch." });
  }

  try {
    const today = new Date();
    // Set to the very start of the day in UTC
    const startDate = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    // Set to the very end of the day in UTC
    const endDate = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    // 1. Get Student Attendance
    const [totalStudents, presentStudents, classAttendanceRaw] =
      await Promise.all([
        prisma.student.count({ where: { branchId } }),
        prisma.attendanceRecord.count({
          where: {
            student: { branchId },
            date: { gte: startDate, lte: endDate },
            status: "Present",
          },
        }),
        prisma.schoolClass.findMany({
          where: { branchId },
          select: {
            id: true,
            gradeLevel: true,
            section: true,
            students: {
              select: {
                id: true,
                name: true,
                attendanceRecords: {
                  where: { date: { gte: startDate, lte: endDate } },
                },
              },
            },
          },
        }),
      ]);

    // 2. Process Student Attendance
    const classAttendance = classAttendanceRaw.map((c) => {
      let present = 0;
      const absentees: { id: string; name: string }[] = [];
      c.students.forEach((s) => {
        const record = s.attendanceRecords[0];
        if (
          record &&
          (record.status === "Present" || record.status === "Tardy")
        ) {
          present++;
        } else if (!record || record.status === "Absent") {
          absentees.push({ id: s.id, name: s.name });
        }
      });
      return {
        classId: c.id,
        className: `Grade ${c.gradeLevel} - ${c.section}`,
        total: c.students.length,
        present: present,
        absentees: absentees,
      };
    });

    // 3. Get Staff Attendance
    // Explicitly cast the array to UserRole[]
    const allStaffRoles: UserRole[] = [
      "Teacher",
      "Registrar",
      "Librarian",
      "SupportStaff",
      "Principal",
    ];
    const [totalStaff, staffAttendanceRecords] = await Promise.all([
      prisma.user.count({
        where: { branchId, role: { in: allStaffRoles } },
      }),
      prisma.staffAttendanceRecord.findMany({
        where: {
          branchId: branchId,
          date: { gte: startDate, lte: endDate },
        },
        include: {
          user: { select: { name: true } },
        },
      }),
    ]);

    // 4. Process Staff Attendance
    const staffPresent = staffAttendanceRecords.filter(
      (s) => s.status === "Present" || s.status === "HalfDay"
    ).length;

    const staffAttendance = staffAttendanceRecords.map((s) => ({
      teacherId: s.userId, // Use userId
      teacherName: s.user.name,
      status: s.status,
    }));

    // 5. Assemble final payload
    const overview = {
      summary: {
        studentsPresent: presentStudents,
        studentsTotal: totalStudents,
        staffPresent: staffPresent,
        staffTotal: totalStaff,
      },
      classAttendance,
      staffAttendance,
    };

    res.status(200).json(overview);
  } catch (error) {
    next(error);
  }
};

export const getExaminationsWithResultStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const now = new Date(); 

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.$transaction([

      prisma.examination.updateMany({
        where: {
          branchId,
          status: "Upcoming",
          startDate: { lte: now },
        },
        data: { status: "Ongoing" },
      }),
      prisma.examination.updateMany({
        where: {
          branchId,
          status: "Ongoing",
          endDate: { lt: today },
        },
        data: { status: "Completed" },
      }),
    ]);
    const examinations = await prisma.examination.findMany({
      where: { branchId },
      orderBy: { startDate: "desc" },
    });

    res.status(200).json(examinations);
  } catch (error) {
    next(error);
  }
};
export const publishExaminationResults = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  const { examId } = req.params;

  if (!branchId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    // Use updateMany for security to ensure the principal
    // can only publish an exam in their own branch.
    const result = await prisma.examination.updateMany({
      where: {
        id: examId,
        branchId: branchId,
        status: "Completed", // Can only publish completed exams
      },
      data: {
        resultStatus: ExamResultStatus.Published,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({
        message: "Completed examination not found in your branch.",
      });
    }

    res.status(200).json({ message: "Results published successfully." });
  } catch (error) {
    next(error);
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


export const getFinancialsOverview = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized: Principal must be associated with a branch." });
  }

  try {
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // --- 1. Fetch Core Data, Scoped by Branch ---
    const [branch, feePaymentsThisMonth, allPayroll, manualExpenses, erpPayments] = await prisma.$transaction([
      prisma.branch.findUnique({ where: { id: branchId } }),
      prisma.feePayment.findMany({
        where: {
          student: { branchId: branchId },
          paidDate: { gte: currentMonthStart }
        }
      }),
      prisma.payrollRecord.findMany({ where: { branchId: branchId, status: 'Paid' } }),
      prisma.manualExpense.findMany({ where: { branchId: branchId } }),
      prisma.erpPayment.findMany({ where: { branchId: branchId } })
    ]);

    if (!branch) {
        return res.status(404).json({ message: "Branch not found." });
    }

    const sessionStart = new Date(branch.academicSessionStartDate || `${today.getFullYear()}-04-01`);

    // --- 2. Calculate Monthly & Session Figures ---
    const monthlyTuitionRevenue = feePaymentsThisMonth.reduce((sum, p) => sum + p.amount, 0);

    const monthlyPayroll = allPayroll
      .filter(p => p.paidAt && new Date(p.paidAt) >= currentMonthStart)
      .reduce((sum, p) => sum + (p.netPayable || 0), 0);

    const monthlyManualExpenses = manualExpenses
      .filter(e => new Date(e.date) >= currentMonthStart)
      .reduce((sum, e) => sum + e.amount, 0);

    const sessionPayroll = allPayroll
        .filter(p => p.paidAt && new Date(p.paidAt) >= sessionStart)
        .reduce((sum, p) => sum + (p.netPayable || 0), 0);

    const sessionManualExpenses = manualExpenses
        .filter(e => new Date(e.date) >= sessionStart)
        .reduce((sum, e) => sum + e.amount, 0);

    const sessionErpPayments = erpPayments
        .filter(p => new Date(p.paymentDate) >= sessionStart)
        .reduce((sum, p) => sum + p.amount, 0);
        
    const monthlyExpenditure = monthlyPayroll + monthlyManualExpenses;
    const sessionExpenditure = sessionPayroll + sessionManualExpenses + sessionErpPayments;

    // --- 3. Calculate Total Pending Fees ---
    const feeRecordAggregates = await prisma.feeRecord.aggregate({
        _sum: { totalAmount: true, paidAmount: true },
        where: { student: { branchId: branchId } },
    });
    const totalPending = (feeRecordAggregates._sum.totalAmount || 0) - (feeRecordAggregates._sum.paidAmount || 0);


    // --- 4. Get Class-wise Fee Summaries ---
    const classes = await prisma.schoolClass.findMany({
        where: { branchId },
        include: { _count: { select: { students: true } } }
    });

    const classFeeSummaries = await Promise.all(
        classes.map(async (c) => {
            const defaulterAggregate = await prisma.feeRecord.aggregate({
                _sum: { totalAmount: true, paidAmount: true },
                _count: { studentId: true},
                where: { 
                    student: { classId: c.id },
                    paidAmount: { lt: prisma.feeRecord.fields.totalAmount }
                },
            });
            return {
                classId: c.id,
                className: `Grade ${c.gradeLevel} - ${c.section}`,
                studentCount: c._count.students,
                defaulterCount: defaulterAggregate._count.studentId,
                pendingAmount: (defaulterAggregate._sum.totalAmount || 0) - (defaulterAggregate._sum.paidAmount || 0),
            };
        })
    );
    
    // --- 5. Assemble the Overview Object ---
    const overview = {
      monthly: {
        revenue: monthlyTuitionRevenue,
        expenditure: monthlyExpenditure,
        net: monthlyTuitionRevenue - monthlyExpenditure,
        revenueBreakdown: [{ name: "Tuition Fees", value: monthlyTuitionRevenue }],
        expenditureBreakdown: [
          { name: "Staff Payroll", value: monthlyPayroll },
          { name: "Other Expenses", value: monthlyManualExpenses },
        ].filter((item) => item.value > 0),
      },
      session: {
        revenue: (feeRecordAggregates._sum.paidAmount || 0),
        expenditure: sessionExpenditure,
        net: (feeRecordAggregates._sum.paidAmount || 0) - sessionExpenditure,
      },
      summary: {
        totalPending,
        // FIX APPLIED HERE: Use the nullish coalescing operator '??' to provide a default value of 0.
        erpBillAmountForCycle: (branch.erpPricePerStudent ?? 0) * (await prisma.student.count({ where: { branchId } })),
        erpNextDueDate: branch.nextDueDate,
        erpBillingCycle: branch.billingCycle,
        isErpBillPaid: branch.nextDueDate ? new Date(branch.nextDueDate) > today : false,
      },
      classFeeSummaries,
    };

    res.status(200).json(overview);
  } catch (error) {
    next(error); 
  }
};

export const addFeeAdjustment = async (req: Request, res: Response) => {
  try {
    if (!req.user || !req.user.branchId) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const staff = await principalApiService.getStaffByBranch(req.user.branchId);
    // FIX: Added explicit type for find parameter
    const principal = staff.find((u: { id: string }) => u.id === req.user!.id);

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
    // FIX: Added explicit type for find parameter
    const principal = staff.find((u: { id: string }) => u.id === req.user!.id);

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
    // FIX: Added explicit type for find parameter
    const principal = staff.find((u: { id: string }) => u.id === req.user!.id);

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
  res: Response,
  next: NextFunction
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
 
    if (error.message.includes("Branch not found")) {
      return res
        .status(404)
        .json({
          message:
            "The branch associated with your account could not be found. Please contact support.",
        });
    }
    next(error);
  }
};

export const getErpPaymentsForBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const branchId = getPrincipalBranchId(req);

    // --- THE FORTIFICATION ---
    if (!branchId) {
      return res
        .status(404)
        .json({ message: "Principal is not associated with a branch." });
    }
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res
        .status(404)
        .json({ message: "The branch for this account could not be found." });
    }
    // --- End of Fortification ---

    const payments = await prisma.erpPayment.findMany({
      where: { branchId: branchId },
      orderBy: { paymentDate: "desc" },
    });

    res.status(200).json(payments);
  } catch (error) {
    next(error);
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
    // FIX: Added explicit type for find parameter
    const principal = staff.find((u: { id: string }) => u.id === req.user!.id);

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
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    const applications = await prisma.leaveApplication.findMany({
      where: {
        applicant: {
          branchId: branchId,
          role: { in: ["Teacher", "Registrar", "Librarian", "SupportStaff"] },
        },
      },
      include: {
        applicant: {
          select: { name: true, role: true },
        },
      },
      orderBy: { fromDate: "desc" },
    });

    // FIX: Manually map to the fields your frontend component expects
    const formattedApplications = applications.map((app) => ({
      ...app,
      applicantName: app.applicant.name, // Add top-level applicantName
      applicantRole: app.applicant.role, // Add top-level applicantRole
      startDate: app.fromDate, // Copy fromDate to startDate
      endDate: app.toDate, // Copy toDate to endDate
    }));

    res.status(200).json(formattedApplications);
  } catch (error) {
    next(error);
  }
};

export const processLeaveApplication = async (req: Request, res: Response, next: NextFunction) => {
  const branchId = getPrincipalBranchId(req);
  const { id: applicationId } = req.params;
  const { status } = req.body; // "Approved" or "Rejected"

  if (!branchId || !req.user) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (status !== 'Approved' && status !== 'Rejected') {
    return res.status(400).json({ message: "Invalid status." });
  }

  try {
    // 1. Find the application to ensure it belongs to the principal's branch
    const application = await prisma.leaveApplication.findFirst({
        where: {
            id: applicationId,
            applicant: { branchId: branchId } // Security check
        }
    });

    if (!application) {
        return res.status(404).json({ message: "Leave application not found in your branch." });
    }

    // 2. Update the application
    const updatedApplication = await prisma.leaveApplication.update({
      where: {
        id: applicationId
      },
      data: { 
        status: status,
        // You MUST add 'reviewedBy' to your 'LeaveApplication' schema for this to work
        // reviewedBy: req.user.name 
      }
    });
    
    res.status(200).json(updatedApplication);
  } catch (error) {
    next(error);
  }
};

export const raiseComplaintAboutStudent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  const { studentId, raisedById, raisedByName, raisedByRole, complaintText } =
    req.body;

  try {
    const newComplaint = await prisma.complaint.create({
      data: {
        complaintText,
        studentId,
        raisedById,
        raisedByName,
        raisedByRole,
        branchId,
        // 'status' and 'submittedAt' will be set by default
      },
    });
    res.status(201).json(newComplaint);
  } catch (error) {
    next(error);
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



export const getComplaintsForBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    // This will now work correctly!
    const complaints = await prisma.complaint.findMany({
      where: { branchId: branchId },
      include: {
        student: { select: { name: true } }, // Include the student's name
      },
      orderBy: { submittedAt: "desc" },
    });
    res.status(200).json(complaints);
  } catch (error) {
    next(error);
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
    // FIX: Added explicit type for find parameter
    const principal = staff.find((u: { id: string }) => u.id === req.user!.id);

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
    // FIX: Added explicit type for find parameter
    const principal = staff.find((u: { id: string }) => u.id === req.user!.id);

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
    // FIX: Added explicit type for find parameter
    const principal = staff.find((u: { id: string }) => u.id === req.user!.id);

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


export const getTeachersByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { branchId } = req.params;
    // The Guard's Vigil: We ensure the land is true before we summon its people.
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }
    const teachers = await prisma.teacher.findMany({ where: { branchId } });
    res.status(200).json(teachers);
  } catch (error) {
    next(error);
  }
};

export const getStudentsByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { branchId } = req.params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }
    const students = await prisma.student.findMany({ where: { branchId } });
    res.status(200).json(students);
  } catch (error) {
    next(error);
  }
};

export const getFeeTemplatesByBranch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { branchId } = req.params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }
    const feeTemplates = await prisma.feeTemplate.findMany({
      where: { branchId },
    });
    res.status(200).json(feeTemplates);
  } catch (error) {
    next(error);
  }
};



export const getStaffMemberAttendance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const branchId = getPrincipalBranchId(req);
  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  const { staffId, year, month } = req.params; 
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10); // 0-indexed (0=Jan, 11=Dec)

  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
    return res.status(400).json({ message: "Invalid year or month." });
  }

  const startDate = new Date(Date.UTC(yearNum, monthNum, 1));
  const endDate = new Date(Date.UTC(yearNum, monthNum + 1, 0, 23, 59, 59));
  // --- END FIX 1 ---

  try {
    const staffMember = await prisma.user.findFirst({
      where: { id: staffId, branchId: branchId },
    });

    if (!staffMember) {
      return res
        .status(404)
        .json({ message: "Staff member not found in your branch." });
    }

    const [attendance, leaves] = await prisma.$transaction([
      prisma.staffAttendanceRecord.findMany({
        where: {
          userId: staffId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),

      prisma.leaveApplication.findMany({
        where: {
          applicantId: staffId,
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
    next(error);
  }
};