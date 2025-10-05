// src/controllers/superAdminController.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";

export const getMasterConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const masterConfig = await prisma.systemSettings.findUnique({
      where: { id: "global" },
    });
    if (!masterConfig) {
      return res
        .status(500)
        .json({ message: "Master configuration could not be found." });
    }
    res.status(200).json(masterConfig);
  } catch (error) {
    next(error);
  }
};

export const updateMasterConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { defaultErpPrice, globalFeatureToggles, loginPageAnnouncement } =
      req.body;
    if (defaultErpPrice === undefined || globalFeatureToggles === undefined) {
      return res.status(400).json({ message: "Invalid request body." });
    }
    const updatedSettings = await prisma.systemSettings.update({
      where: { id: "global" },
      data: { defaultErpPrice, globalFeatureToggles, loginPageAnnouncement },
    });
    res
      .status(200)
      .json({
        message: "Master configuration updated.",
        settings: updatedSettings,
      });
  } catch (error) {
    next(error);
  }
};
