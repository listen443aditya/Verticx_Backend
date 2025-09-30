import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, UserRole } from "../types/api";

// The secret key should be stored in environment variables, not in the code.
const JWT_SECRET = process.env.JWT_SECRET || "your-default-super-secret-key";

export interface UserPayload {
  id: string;
  role: UserRole;
  branchId?: string;
}

/**
 * Creates a JWT for a given user payload.
 * @param user The user object to encode.
 * @returns The generated JWT string.
 */
export const createToken = (user: User): string => {
  const payload: UserPayload = {
    id: user.id,
    role: user.role,
    branchId: user.branchId,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
};

/**
 * Verifies a JWT and returns its payload.
 * Throws an error if the token is invalid or expired.
 * @param token The JWT string to verify.
 * @returns The decoded user payload.
 */
export const verifyToken = (token: string): UserPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

// --- MISSING CONTROLLER FUNCTIONS ADDED BELOW ---

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // TODO: Add your logic here to find the user in the DB and verify their password.
    // If valid, create a token using createToken() and send it back.
    res.status(501).json({ message: "Login endpoint not implemented yet." });
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
    // TODO: Add your logic here to verify the OTP.
    res
      .status(501)
      .json({ message: "Verify OTP endpoint not implemented yet." });
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
    // TODO: Add your logic here for school registration.
    res
      .status(501)
      .json({ message: "Register School endpoint not implemented yet." });
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
    // TODO: If you are using a token blocklist, add the logic here.
    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    next(error);
  }
};

export const checkSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // The 'protect' middleware has already run and attached the user to `req.user`.
    // We can just return the user data for the frontend to use.
    const user = req.user;
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // TODO: Add your logic here to handle password changes.
    res
      .status(501)
      .json({ message: "Change Password endpoint not implemented yet." });
  } catch (error) {
    next(error);
  }
};
