// backend/src/routes/generalRoutes.ts
import { Router } from "express";
import * as generalCtrl from "../controllers/generalController";
import { protect } from "../middlewares/auth";

const router = Router();

// All routes in this file are protected and shared by authenticated users
router.use(protect);

// --- ORIGINAL ROUTES ---
router.get("/branches/:id", generalCtrl.getBranch);
router.get("/users/:id", generalCtrl.getUser); // This is NOT the one you want
router.put("/profile", generalCtrl.updateProfile);

// --- SHARED DATA ROUTES ---
router.get("/user-details/:userId", generalCtrl.getUser); // This IS the one you want
router.get("/students", generalCtrl.getStudentsForBranch);
router.get("/teachers", generalCtrl.getTeachersByBranch);
router.get("/leaves/settings", generalCtrl.getLeaveSettingsForBranch);
router.get("/leaves/my-applications", generalCtrl.getMyLeaveApplications);
router.post("/leaves/applications", generalCtrl.createLeaveApplication);
router.get("/events", generalCtrl.getSchoolEvents);
router.get("/classes", generalCtrl.getSchoolClassesByBranch);
router.get("/classes/:id", generalCtrl.getClassById);
router.get("/subjects/:id", generalCtrl.getSubjectById);
router.get("/examinations/:id", generalCtrl.getExaminationById);
router.get("/library/search", generalCtrl.searchLibraryBooks);

export default router;
