// src/utils/authUtils.ts
import { Request } from 'express';

export function getBranchId(req: Request): string {
  // Use req.user for consistency with other controllers
  if (!req.user || !req.user.branchId) {
    throw new Error('Branch ID not found in request user object');
  }
  return req.user.branchId;
}