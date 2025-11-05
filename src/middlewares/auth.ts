import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../prisma"; // Import your Prisma client
import { UserRole } from "../types/api";

export interface UserPayload {
  id: string;
  name: string;
  role: UserRole;
  branchId: string | null;
}

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

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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

    // 2. Find the user in the REAL database
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!currentUser) {
      return res
        .status(401)
        .json({ message: "User for this token no longer exists." });
    }

    let userBranchId: string | null = currentUser.branchId;

    // If the user is a Principal, their branchId is on the User table is null.
    // We must find the branch they are the principal OF.
    if (currentUser.role === "Principal") {
      const branch = await prisma.branch.findUnique({
        where: { principalId: currentUser.id },
        select: { id: true },
      });

      // If a branch is found, set this as their branchId for this request
      if (branch) {
        userBranchId = branch.id;
      }
    }

    // 3. Attach the user payload to the request object
    req.user = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
      branchId: userBranchId, // Use the new role-aware variable
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

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
