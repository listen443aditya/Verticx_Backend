// backend/src/routes/generalRoutes.ts
import { Router } from "express";
import * as generalCtrl from "../controllers/generalController";
import { protect } from "../middlewares/auth";

const router = Router();
router.use(protect);

router.get("/students", generalCtrl.getStudentsForBranch);
router.get("/teachers", generalCtrl.getTeachersByBranch);
router.get("/leaves/settings", generalCtrl.getLeaveSettingsForBranch);
router.get("/leaves/my-applications", generalCtrl.getMyLeaveApplications);
router.post("/leaves/applications", generalCtrl.createLeaveApplication);
router.get("/events", generalCtrl.getSchoolEvents);
router.get("/classes", generalCtrl.getSchoolClassesByBranch);
router.get("/library/search", generalCtrl.searchLibraryBooks);

router.put("/profile", generalCtrl.updateProfile);

router.get("/branches/:id", generalCtrl.getBranch);
router.get("/users/:id", generalCtrl.getUser);
router.get("/user-details/:userId", generalCtrl.getUser);
router.get("/classes/:id", generalCtrl.getClassById);
router.get("/subjects/:id", generalCtrl.getSubjectById);
router.get("/examinations/:id", generalCtrl.getExaminationById);

export default router;
