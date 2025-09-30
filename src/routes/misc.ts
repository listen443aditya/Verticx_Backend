import { Router } from 'express';
import * as miscCtrl from '../controllers/miscController';
import { protect } from '../middlewares/auth';

const router = Router();
router.post('/generate-content', protect, miscCtrl.generateContent);

export default router;
