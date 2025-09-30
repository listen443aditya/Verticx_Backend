// src/routes/auth.ts
import { Router } from "express";
// ✨ FIX: Use named imports for controller functions
import {
  login,
  verifyOtp,
  registerSchool,
  logout,
  checkSession,
  changePassword,
} from "../controllers/authController";
import { protect } from "../middlewares/auth";

const router = Router();

// Public routes
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.post("/register-school", registerSchool);

// Protected routes (require a valid token)
router.post("/logout", protect, logout);
router.get("/session", protect, checkSession);
router.post("/change-password", protect, changePassword);

export default router;
