// src/app.ts
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import principalRoutes from "./routes/principal";
import registrarRoutes from "./routes/registrar";
import parentRoutes from "./routes/parent";
import librarianRoutes from "./routes/librarian";
import teacherRoutes from "./routes/teacher";
import studentRoutes from "./routes/student";
import miscRoutes from "./routes/misc";
import generalRoutes from "./routes/general";


const app: Express = express();

// --- Middlewares ---

// ✅ CORS Configuration
const allowedOrigins = [
  "http://localhost:5173", // Local development
  "https://verticx.vercel.app", // Production frontend
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // allow cookies/authorization headers
};
app.use(cors(corsOptions));

// ✅ Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---
// Each route file is responsible for a specific user role or feature set.
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/principal", principalRoutes);
app.use("/api/registrar", registrarRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/librarian", librarianRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/general", generalRoutes);
app.use("/api/misc", miscRoutes);
app.use("/api/superadmin", adminRoutes);
// --- Health Check ---
app.get("/", (req: Request, res: Response) => {
  res.status(200).send('Verticx Backend is running');
});

// --- Error Handling ---
// Catch-all error handler.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({
    message: "Something went wrong on the server!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

export default app;
