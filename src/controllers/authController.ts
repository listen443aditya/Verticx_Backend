import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../prisma";
import { User, UserRole } from "../types/api";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "4d7eac3a255b62ccdc84521e9d6fab2d4ee910ea9dfb4cc15051cf016fb91a85";

// A custom interface to add the 'user' property to Express's Request object
interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

// FIX: Standardized branchId to `string | null` to match the Prisma schema.
export interface UserPayload {
  id: string;
  name: string;
  role: UserRole;
  branchId: string | null;
}

/**
 * Creates a JWT for a given user payload.
 */
// FIX: Made the function signature robust to handle `null` or `undefined` for branchId.
export const createToken = (user: {
  id: string;
  name: string;
  role: UserRole;
  branchId?: string | null; // Accepts both null and undefined
}): string => {
  const payload: UserPayload = {
    id: user.id,
    name: user.name,
    role: user.role,
    // Safely coalesce undefined or null to just null for the payload
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

    const token = createToken(user);
    const { passwordHash: _, ...userWithoutPassword } = user;

    res.status(200).json({ user: userWithoutPassword, token });
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
      branchLocation,
      principalName,
      principalEmail,
      principalPassword,
    } = req.body;

    if (
      !schoolName ||
      !branchLocation ||
      !principalName ||
      !principalEmail ||
      !principalPassword
    ) {
      return res
        .status(400)
        .json({ message: "All fields are required for school registration." });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: principalEmail },
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(principalPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const newBranch = await tx.branch.create({
        data: {
          name: schoolName,
          location: branchLocation,
          registrationId: `REG-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase()}`,
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
          passwordHash: hashedPassword,
          role: "Principal",
          branchId: newBranch.id,
        },
      });

      await tx.branch.update({
        where: { id: newBranch.id },
        data: { principalId: principalUser.id },
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
