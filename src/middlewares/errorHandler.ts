import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err.status && err.message) {
    return res.status(err.status).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal Server Error' });
}
