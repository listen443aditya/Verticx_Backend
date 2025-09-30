import { Request, Response, NextFunction } from "express";
import { UserRole } from "../types/api";
import { verifyJwt } from "../utils/jwt";
import { db } from "../services/database";

// Note: The global type declaration for Express.Request is good practice.
// If you haven't already, move this to a dedicated file like `src/types/express/index.d.ts`
// to keep it clean and apply it globally without re-declaring it.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string; // Added name based on usage in other controllers
        role: UserRole;
        branchId: string | null;
      };
    }
  }
}

// ✨ FIX: Renamed 'authenticate' to 'protect' to match what your routes expect.
export const protect = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Authentication token is required." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyJwt(token);
    const user = (db.users as any[]).find((u) => u.id === decoded.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Attach the full user object to the request
    req.user = {
      id: user.id,
      name: user.name,
      role: user.role,
      branchId: user.branchId || null,
    };

    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token." });
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
