// src/app.ts

import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

// Import all routers
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import superAdminRoutes from "./routes/superadmin"; // Import the new router
import principalRoutes from "./routes/principal";
import registrarRoutes from "./routes/registrar";
import parentRoutes from "./routes/parent";
import librarianRoutes from "./routes/librarian";
import teacherRoutes from "./routes/teacher";
import studentRoutes from "./routes/student";
import generalRoutes from "./routes/general";

const app: Express = express();

// --- Middlewares ---
const allowedOrigins = ["https://verticx.vercel.app"];
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.endsWith(".vercel.app")
    ) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API Test Route ---
app.get("/api/ping", (req, res) => res.status(200).json({ message: "Pong!" }));

// --- API Routes ---
app.use("/api/auth", authRoutes);
app.use("/api", generalRoutes); // For routes like /api/profile

// FIX: Use the new, dedicated routers for each role
app.use("/api/admin", superAdminRoutes);
app.use("/api/superadmin", superAdminRoutes);

app.use("/api/principal", principalRoutes);
app.use("/api/registrar", registrarRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/librarian", librarianRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);

// --- Health Check ---
app.get("/", (req, res) =>
  res.status(200).send("✅ Verticx Backend is running!")
);

// --- Error Handling ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({ message: "Something went wrong on the server!" });
});

export default app;
