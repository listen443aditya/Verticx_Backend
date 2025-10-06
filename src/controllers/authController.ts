// src/controllers/authController.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../prisma";
import { User, UserRole } from "../types/api";
import { randomInt } from "crypto"; // Import crypto for OTP generation

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "Lq9w1fe&hbA//=r5H%l=+WSG*^7@j@Ncw7+B!mp=m@t^Qi^CNaf@uKBf@vu2fiJv@$ih$oQRcpLlo%gJ2de7tT!C*/GY$Lp5yyfpDPyQAJnZkn/7zHNeTd16S6COSpMW";

// A custom interface to add the 'user' property to Express's Request object
interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

export interface UserPayload {
  id: string;
  name: string;
  role: UserRole;
  branchId: string | null;
}

/**
 * Creates a JWT for a given user payload.
 */
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

  const expiresIn = 86400; // 24 hours in seconds

  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

/**
 * Verifies a JWT and returns its payload.
 */
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
      where: { OR: [{ email: identifier }, { id: identifier }] },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // --- OTP LOGIC IMPLEMENTED HERE ---
    const rolesRequiringOtp: UserRole[] = [
      "SuperAdmin",
      "Admin",
      "Principal",
      "Registrar",
    ];

    if (rolesRequiringOtp.includes(user.role)) {
      // This user needs OTP verification.
      const otp = randomInt(100000, 999999).toString(); // Generate a 6-digit OTP

      // Save the OTP to the user's record in the database.
      await prisma.user.update({
        where: { id: user.id },
        data: { currentOtp: otp },
      });

      // For development: Log the OTP to the server console so you can easily test.
      console.log(`OTP for ${user.email}: ${otp}`);

      const { passwordHash: _, ...userWithoutPassword } = user;

      // Send a response indicating that OTP is required, without the session token.
      return res
        .status(200)
        .json({ user: userWithoutPassword, otpRequired: true });
    } else {
      // This user does NOT need OTP. Log them in directly.
      const token = createToken(user);
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

    const isOtpValid = user.currentOtp === otp;

    if (!isOtpValid) {
      return res.status(401).json({ message: "Invalid OTP." });
    }

    // OTP is valid, clear it to prevent reuse and create a session token.
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { currentOtp: null },
    });

    const token = createToken(updatedUser);
    const { passwordHash: _, ...userWithoutPassword } = updatedUser;

    res.status(200).json({ user: userWithoutPassword, token });
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

    // FIX: Updated validation to match the form data. Password is no longer required here.
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

    // Check if a request with the same unique details already exists
    const existingRequest = await prisma.registrationRequest.findFirst({
        where: { OR: [{ registrationId }, { email }] }
    });
    
    if (existingRequest) {
        return res.status(409).json({ message: "A registration request with this ID or email already exists." });
    }

    // FIX: Create a RegistrationRequest in the database instead of a User and Branch.
    const newRequest = await prisma.registrationRequest.create({
        data: {
            schoolName,
            registrationId,
            principalName,
            email,
            phone,
            location,
        }
    });

    // Send a success response confirming the request was submitted.
    res.status(201).json({
      message: "Registration request submitted successfully! We will review your application and contact you shortly.",
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

    const freshUser = await prisma.user.findUnique({
      where: { id: userFromToken.id },
    });
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }

    const { passwordHash: _, ...userWithoutPassword } = freshUser;
    res.status(200).json({ user: userWithoutPassword });
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
