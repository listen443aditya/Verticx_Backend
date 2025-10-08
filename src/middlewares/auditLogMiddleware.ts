import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import { UserRole } from "@prisma/client";

interface AuthenticatedRequest extends Request {
  user?: { id: string; name: string; role: UserRole; branchId: string | null };
}

export const auditLogMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  next();

  res.on("finish", async () => {
    try {
      const { method, originalUrl, body } = req;
      const { statusCode } = res;

      if (
        !["POST", "PUT", "PATCH", "DELETE"].includes(method) ||
        statusCode > 299
      ) {
        return;
      }

      // --- THE ORACLE'S LEDGER ---
      // Replace the placeholders with the true names you discovered
      // using Ctrl + Space inside the 'data' block.
      await prisma.auditLog.create({
        data: {
          actorId: req.user?.id,
          actorName: req.user?.name || "System",
          actorRole: req.user?.role || "Unknown",

          action: `${method} ${originalUrl}`,
          statusCode: statusCode,
          details: body ? { requestBody: body } : undefined,
        },
      });
    } catch (error) {
      console.error("CRITICAL: Failed to write to audit log:", error);
    }
  });
};
