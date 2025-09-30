// src/app.ts
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import principalRoutes from './routes/principal';
import registrarRoutes from './routes/registrar';
import parentRoutes from './routes/parent';
import librarianRoutes from './routes/librarian';
import teacherRoutes from './routes/teacher';
import studentRoutes from './routes/student';
import miscRoutes from './routes/misc';
import generalRoutes from './routes/general';

const app: Express = express();

// --- Middlewares ---

// CORS Configuration
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- API Routes ---
// Each route file is responsible for a specific user role or feature set.
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/principal', principalRoutes);
app.use('/api/registrar', registrarRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/librarian', librarianRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/general', generalRoutes);
app.use('/api/misc', miscRoutes);


// --- Health Check ---
app.get('/', (req: Request, res: Response) => {
  res.status(200).send('Verticx Backend is running!');
});


// --- Error Handling ---
// A simple catch-all error handler.
// In a production app, you'd want more sophisticated logging and error reporting.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong on the server!', error: err.message });
});

export default app;


