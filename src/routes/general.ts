import { Router } from 'express';
import * as generalCtrl from '../controllers/generalController';
import { protect } from "../middlewares/auth";

const router = Router();

router.get('/branches/:id', protect, generalCtrl.getBranch);
router.get('/users/:id', protect, generalCtrl.getUser);
router.put('/profile', protect, generalCtrl.updateProfile);

export default router;
