import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/api'; // Assuming you have a UserRole type

/**
 * Middleware factory to restrict access to specific user roles.
 * @param allowedRoles - An array of roles that are permitted to access the route.
 * @returns An Express middleware function.
 */
export const restrictTo = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden. You do not have permission to perform this action.' });
    }
    next();
  };
};
