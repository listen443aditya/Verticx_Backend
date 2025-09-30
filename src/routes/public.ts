import { Router } from 'express';
const router = Router();

// public/* endpoints (example)
router.get('/health', (req, res) => res.status(200).json({ ok: true }));

export default router;
