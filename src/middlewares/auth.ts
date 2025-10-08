
// src/middlewares/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../prisma"; // Import your Prisma client
import { UserRole } from "../types/api";

// This is the shape of the data we store in the JWT
export interface UserPayload {
  id: string;
  name: string;
  role: UserRole;
  branchId: string | null;
}

// Your global type declaration for Express.Request is good practice.
// You can move this to a separate `*.d.ts` file if you like.
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "Lq9w1fe&hbA//=r5H%l=+WSG*^7@j@Ncw7+B!mp=m@t^Qi^CNaf@uKBf@vu2fiJv@$ih$oQRcpLlo%gJ2de7tT!C*/GY$Lp5yyfpDPyQAJnZkn/7zHNeTd16S6COSpMW";

// FIX: Rewritten to be async and use Prisma for database lookups.
export const protect = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Authentication token is required." });
  }

  const token = authHeader.split(" ")[1];

  try {
    // 1. Verify the token
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;

    // 2. Find the user in the REAL database using Prisma
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!currentUser) {
      // Correctly send 401 if the user for the token no longer exists
      return res.status(401).json({ message: "User for this token no longer exists." });
    }

    // 3. Attach the user payload to the request object
    req.user = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
      branchId: currentUser.branchId,
    };

    next();
  } catch (error) {
    // This catches invalid/expired tokens from jwt.verify
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

// This function is not used by your admin router but is kept for consistency.
export const authorize = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action.",
      });
    }
    next();
  };
};
