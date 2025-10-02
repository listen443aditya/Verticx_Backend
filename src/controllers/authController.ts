// src/controllers/authController.ts

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../prisma";
import { User, UserRole } from "../types/api";

// The secret key should be stored in environment variables, not in the code.
const JWT_SECRET = process.env.JWT_SECRET || "your-default-super-secret-key";

// A custom interface to add the 'user' property to Express's Request object
interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

export interface UserPayload {
  id: string;
  role: UserRole;
  branchId?: string;
}

/**
 * Creates a JWT for a given user payload.
 */
export const createToken = (user: User): string => {
  const payload: UserPayload = {
    id: user.id,
    role: user.role,
    branchId: user.branchId,
  };
  const expiresIn = process.env.JWT_EXPIRES_IN || "24h";
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

// --- IMPLEMENTED CONTROLLER FUNCTIONS ---

/**
 * Handles user login.
 * Finds user by ID/email, verifies password, and returns a JWT.
 */
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
        .json({ message: "Identifier and password are required." });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { id: identifier }] },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = createToken(user);
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({ user: userWithoutPassword, token });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifies a one-time password for two-factor authentication.
 */
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

    if (!user || !user.otpSecret || !user.otpExpiry) {
      return res.status(401).json({ message: "Invalid OTP request." });
    }

    const isOtpValid = user.otpSecret === otp;
    const isOtpExpired = new Date() > new Date(user.otpExpiry);

    if (!isOtpValid || isOtpExpired) {
      return res.status(401).json({ message: "Invalid or expired OTP." });
    }

    // OTP is valid, clear it from the database to prevent reuse
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { otpSecret: null, otpExpiry: null },
    });

    const token = createToken(updatedUser);
    const { password: _, ...userWithoutPassword } = updatedUser;

    res.status(200).json({ user: userWithoutPassword, token });
  } catch (error) {
    next(error);
  }
};

/**
 * Registers a new school, creating a Branch and a Principal User in a transaction.
 */
export const registerSchool = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { schoolName, branchLocation, principalName, principalEmail, principalPassword } = req.body;

    if (!schoolName || !branchLocation || !principalName || !principalEmail || !principalPassword) {
      return res.status(400).json({ message: "All fields are required for school registration." });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: principalEmail } });
    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(principalPassword, 10);

    // Use a transaction to ensure both the branch and the user are created successfully.
    const result = await prisma.$transaction(async (tx) => {
      const newBranch = await tx.branch.create({
        data: {
          name: schoolName,
          location: branchLocation,
          // You can set default enabled features for new schools here
          enabledFeatures: {
            online_payments_enabled: false,
            transport_module_enabled: true,
            hostel_module_enabled: false,
          },
        },
      });

      const principalUser = await tx.user.create({
        data: {
          name: principalName,
          email: principalEmail,
          password: hashedPassword,
          role: "Principal",
          branchId: newBranch.id,
        },
      });

      // Update the branch with the principal's ID
      await tx.branch.update({
          where: { id: newBranch.id },
          data: { principalId: principalUser.id }
      });

      return { newBranch, principalUser };
    });

    res.status(201).json({
        message: "School registered successfully!",
        branchId: result.newBranch.id,
        principalId: result.principalUser.id,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logs a user out. For stateless JWTs, this is a client-side action.
 * This endpoint exists to provide a formal logout mechanism.
 */
export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // For stateless JWTs, the client is responsible for destroying the token.
    // If you were using a server-side token blocklist (e.g., in Redis),
    // you would add the token to that list here.
    res.status(200).json({ message: "Logged out successfully. Please clear your token." });
  } catch (error) {
    next(error);
  }
};

/**
 * Checks if the user's token is valid and returns fresh user data.
 */
export const checkSession = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // The 'protect' middleware has already validated the token.
    // We re-fetch the user from the DB to ensure the data is fresh.
    const userFromToken = req.user;
    if (!userFromToken) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const freshUser = await prisma.user.findUnique({ where: { id: userFromToken.id } });
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }

    const { password: _, ...userWithoutPassword } = freshUser;
    res.status(200).json({ user: userWithoutPassword });
  } catch (error) {
    next(error);
  }
};

/**
 * Allows a logged-in user to change their password.
 */
export const changePassword = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userFromToken = req.user;

    if (!currentPassword || !newPassword || !userFromToken) {
        return res.status(400).json({ message: "Current password and new password are required." });
    }

    const user = await prisma.user.findUnique({ where: { id: userFromToken.id } });
    if (!user) {
        return res.status(401).json({ message: "User not found." });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ message: "Incorrect current password." });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedNewPassword },
    });

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    next(error);
  }
};
