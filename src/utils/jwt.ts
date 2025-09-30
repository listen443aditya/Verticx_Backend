import jwt, { SignOptions } from "jsonwebtoken";
import { UserRole } from "../types/api"; // FIX: Changed import from 'Role' to 'UserRole'
import dotenv from "dotenv";
dotenv.config();

const SECRET: jwt.Secret = process.env.JWT_SECRET || "dev_secret";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

export interface JwtPayload {
  userId: string;
  role: UserRole; // ✨ FIX: Updated the type to use UserRole
  branchId?: string | null;
  iat?: number;
  exp?: number;
}

export function signJwt(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, SECRET, options);
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
