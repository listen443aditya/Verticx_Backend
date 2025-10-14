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
} from "@prisma/client";
import { generatePassword } from "../utils/helpers";
import bcrypt from "bcryptjs";
type GraphDataPoint = {
  name: string; 
  value: number; 
};
const principalApiService = new PrincipalApiService();

// --- UTILITY: A guard to ensure the user is a Principal with a Branch ---
const getPrincipalBranchId = (req: Request): string | null => {
  if (req.user?.role === "Principal" && req.user.branchId) {
    return req.user.branchId;
  }
  return null;
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
    const classInfo = await prisma.schoolClass.findFirst({
      where: { id: classId, branchId },
    });

    if (!classInfo) {
      return res
        .status(404)
        .json({ message: "Class not found in your branch." });
    }

    const students = await prisma.student.findMany({ where: { classId } });
    const courses = await prisma.course.findMany({
      where: { schoolClassId: classId },
      include: { subject: true, teacher: true },
    });

    const performance = courses.map((c) => ({
      subjectId: c.subjectId,
      subjectName: c.subject.name,
      averageScore: 70 + Math.random() * 25, // Mock data for now
    }));

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
      classInfo,
      students,
      subjects: courses.map((c) => ({
        subjectId: c.subjectId,
        subjectName: c.subject.name,
        teacherName: c.teacher?.name || "N/A",
        // CORRECTED: Use the correct field name from your schema
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

export const getFaculty = async (req: Request, res: Response) => {
  try {
    if (!req.user?.branchId) {
      return res.status(401).json({ message: "Unauthorized access." });
    }

    const staff = await prisma.user.findMany({
      where: {
        branchId: req.user.branchId,
        role: {
          in: ["Teacher", "Registrar", "Librarian"],
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
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
    const profile = await principalApiService.getTeacherProfileDetails(
      req.params.id
    );
    res.status(200).json(profile);
  } catch (error: any) {
    if (error.code === "NOT_FOUND")
      return res.status(404).json({ message: error.message });
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
