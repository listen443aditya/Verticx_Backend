// src/controllers/generalController.ts
import { Request, Response } from "express";
import { sharedApiService } from "../services";

// NOTE: The `declare global` for Express.Request has been REMOVED.
// It is already defined centrally in `src/middlewares/auth.ts`,
// and redeclaring it here causes a type conflict. We now rely on the single source of truth.

export async function getBranch(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const branch = await sharedApiService.getBranchById(id);
    if (!branch) {
      return res.status(404).json({ error: "Branch not found" });
    }
    res.status(200).json(branch);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

export async function getUser(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const user = await sharedApiService.getPublicUserProfile(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

export async function updateProfile(req: Request, res: Response) {
  try {
    // The `protect` middleware ensures `req.user` exists.
    // This check provides an extra layer of safety and satisfies TypeScript.
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { name, phone } = req.body;
    const updatedUser = await sharedApiService.updateUserProfile(req.user.id, {
      name,
      phone,
    });
    res.status(200).json(updatedUser);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}
