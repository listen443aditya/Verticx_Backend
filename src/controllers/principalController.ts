// The Final, Corrected `src/controllers/principalController.ts`

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
} from "@prisma/client";
import { generatePassword } from "../utils/helpers";
import bcrypt from "bcryptjs";

const principalApiService = new PrincipalApiService();

// --- UTILITY: A guard to ensure the user is a Principal with a Branch ---
const getPrincipalBranchId = (req: Request): string | null => {
  if (req.user?.role === "Principal" && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
};


// helper to resolve a branch when caller might pass either DB id or registrationId
async function resolveBranchByIdOrRegistration(identifier: string | undefined) {
  if (!identifier) return null;
  // try id first
  let branch = await prisma.branch.findUnique({ where: { id: identifier } });
  if (branch) return branch;
  // fallback to registrationId
  branch = await prisma.branch.findUnique({ where: { registrationId: identifier } });
  return branch;
}

// --- CONTROLLER FUNCTIONS ---

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
        where: { teacher: { branchId }, status: "Pending" },
      }),
      prisma.branch.findMany({ select: { id: true, name: true, stats: true } }),
    ]);

    // --- Data Transformation with Explicit Types ---
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
          courses?: { syllabusCompletion: number | null }[]; // optional & nullable
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
      // stats is stored as JsonValue, so we need to safely cast/parse it
      const stats = (b.stats as any) || {}; // fallback to empty object
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

    const dashboardData = {
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
          progress: s.syllabusCompletion ?? 0, // default to 0 if null
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


// export const getBranchDetails = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   const idOrReg = req.params.id;

//   try {
//     const branch = await prisma.branch.findFirst({
//       where: {
//         OR: [
//           { id: idOrReg },
//           { registrationId: idOrReg }, // fallback when frontend sent registrationId
//         ],
//       },
//     });

//     if (!branch) {
//       return res.status(404).json({ error: "Branch not found" });
//     }

//     res.status(200).json(branch);
//   } catch (err) {
//     next(err);
//   }
// };




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
  const branchId = getPrincipalBranchId(req);

  if (!branchId) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    const application = await prisma.facultyApplication.findUnique({
      where: { id },
    });
    if (!application || application.branchId !== branchId) {
      return res.status(404).json({ message: "Application not found." });
    }

    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newTeacherUser = await prisma.user.create({
      data: {
        name: application.name,
        email: application.email,
        phone: application.phone,
        branchId: branchId,
        role: "Teacher",
        passwordHash: hashedPassword,
        userId: `VRTX-${branchId.substring(0, 4)}-TCH-${Date.now()
          .toString()
          .slice(-4)}`,
      },
    });

    await prisma.teacher.create({
      data: {
        user: { connect: { id: newTeacherUser.id } },
        name: application.name,
        email: application.email,
        phone: application.phone,
        qualification: application.qualification,
        branch: { connect: { id: branchId } },
        salary: salary,
      },
    });

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
// ... (The rest of the file uses principalApiService, which will now work with the import)
// ... All subsequent functions remain the same, but with fixes for implicit 'any' types where applicable.

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
      credentials: { email: newUser.email, password: tempPassword, userId },
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
    // FIX: Added explicit type for find parameter
    const principal = staff.find((u: { id: string }) => u.id === req.user!.id);

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
