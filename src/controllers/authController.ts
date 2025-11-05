//`src/controllers/authController.ts`

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../prisma";
import { User, UserRole } from "../types/api";
import { randomInt } from "crypto";
import { sendOtpEmail } from "../services/emailService"; 
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "Lq9w1fe&hbA//=r5H%l=+WSG*^7@j@Ncw7+B!mp=m@t^Qi^CNaf@uKBf@vu2fiJv@$ih$oQRcpLlo%gJ2de7tT!C*/GY$Lp5yyfpDPyQAJnZkn/7zHNeTd16S6COSpMW";

interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

export interface UserPayload {
  id: string;
  name: string;
  role: UserRole;
  branchId: string | null;
}

export const createToken = (user: {
  id: string;
  name: string;
  role: UserRole;
  branchId?: string | null;
}): string => {
  const payload: UserPayload = {
    id: user.id,
    name: user.name,
    role: user.role,
    branchId: user.branchId ?? null,
  };
  const expiresIn = 86400; // 24 hours
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

export const verifyToken = (token: string): UserPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

// --- CONTROLLER FUNCTIONS ---

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ message: "Username/Email and password are required." });
    }
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { userId: identifier }] },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (!user.name) {
      return res
        .status(500)
        .json({
          message:
            "User account is corrupted (missing name). Please contact support.",
        });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const rolesRequiringOtp: UserRole[] = [
      "SuperAdmin",
      "Admin",
      "Principal",
      "Registrar",
    ];

    if (rolesRequiringOtp.includes(user.role)) {
      const otp = randomInt(100000, 999999).toString();
      await prisma.user.update({
        where: { id: user.id },
        data: { currentOtp: otp },
      });
      console.log(`OTP for ${user.email}: ${otp}`);
      const { passwordHash: _, ...userWithoutPassword } = user;
      return res
        .status(200)
        .json({ user: userWithoutPassword, otpRequired: true });
    } else {
      const token = createToken(user as UserPayload);
      const { passwordHash: _, ...userWithoutPassword } = user;
      return res.status(200).json({ user: userWithoutPassword, token });
    }
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) {
      return res.status(400).json({ message: "User ID and OTP are required." });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.currentOtp) {
      return res.status(401).json({ message: "Invalid OTP request." });
    }
    if (!user.name) {
      return res
        .status(500)
        .json({ message: "User account is corrupted (missing name)." });
    }
    const isOtpValid = user.currentOtp === otp;
    if (!isOtpValid) {
      return res.status(401).json({ message: "Invalid OTP." });
    }
    // Clear the OTP
    await prisma.user.update({
      where: { id: userId },
      data: { currentOtp: null },
    });
    let userBranchId: string | null = user.branchId;

    if (user.role === "Principal") {
      const branch = await prisma.branch.findUnique({
        where: { principalId: user.id },
        select: { id: true },
      });
      if (branch) {
        userBranchId = branch.id;
      }
    }
    const userPayload: UserPayload = {
      id: user.id,
      name: user.name,
      role: user.role,
      branchId: userBranchId,
    };
    const token = createToken(userPayload);
    res.status(200).json({ user: userPayload, token });
  } catch (error) {
    next(error);
  }
};

export const registerSchool = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      schoolName,
      registrationId,
      principalName,
      email,
      phone,
      location,
    } = req.body;

    if (
      !schoolName ||
      !registrationId ||
      !principalName ||
      !email ||
      !phone ||
      !location
    ) {
      return res
        .status(400)
        .json({ message: "All fields are required for school registration." });
    }

    const existingRequest = await prisma.registrationRequest.findFirst({
      where: { OR: [{ registrationId }, { email }] },
    });

    if (existingRequest) {
      return res
        .status(409)
        .json({
          message:
            "A registration request with this ID or email already exists.",
        });
    }

    const newRequest = await prisma.registrationRequest.create({
      data: {
        schoolName,
        registrationId,
        principalName,
        email,
        phone,
        location,
      },
    });

    res.status(201).json({
      message:
        "Registration request submitted successfully! We will review your application and contact you shortly.",
      requestId: newRequest.id,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res
      .status(200)
      .json({ message: "Logged out successfully. Please clear your token." });
  } catch (error) {
    next(error);
  }
};

export const checkSession = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userFromToken = req.user;
    if (!userFromToken) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const userExists = await prisma.user.findUnique({
      where: { id: userFromToken.id },
      select: { id: true, status: true },
    });

    if (!userExists) {
      return res.status(401).json({ message: "User not found" });
    }

    if (userExists.status !== "active") {
      return res.status(403).json({ message: "User account is not active." });
    }
    res.status(200).json({ user: userFromToken });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userFromToken = req.user;

    if (!currentPassword || !newPassword || !userFromToken) {
      return res
        .status(400)
        .json({ message: "Current and new password are required." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userFromToken.id },
    });
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Incorrect current password." });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedNewPassword },
    });

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    next(error);
  }
};



export const sendLoginOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { email },
      data: { currentOtp: otp, otpExpiry: otpExpiry },
    });
    await sendOtpEmail(email, otp);

    res.status(200).json({ message: "OTP has been sent to your email." });
  } catch (error) {
    next(error); 
  }
};