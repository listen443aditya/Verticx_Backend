// src/server.ts
import dotenv from "dotenv";
dotenv.config(); // MUST happen before importing modules that read process.env

import http from "http";
import { Request, Response, NextFunction } from "express";
import app from "./app";
import prisma from "./prisma";

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    // Connect DB (Prisma)
    await prisma.$connect();
    console.log("✅ Prisma connected");

    // Create HTTP server so we can gracefully close it later
    const server = http.createServer(app);

    // Register an error handler on the Express app if app.ts doesn't already register one.
    // Prefer keeping this inside app.ts as the *last* middleware. If you keep it here, it's OK
    // as long as it's added after app routes are mounted.
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      console.error("Unhandled error (express middleware):", err);
      if (res.headersSent) return next(err);
      res.status(500).json({ error: "Internal Server Error" });
    });

    server.listen(PORT, () => {
      console.log(`🚀 Verticx backend running on port ${PORT}`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      server.close(async (err?: Error) => {
        if (err) {
          console.error("Error while closing server:", err);
          process.exit(1);
        }
        try {
          await prisma.$disconnect();
          console.log("✅ Prisma disconnected");
          process.exit(0);
        } catch (e) {
          console.error("Error during Prisma disconnect:", e);
          process.exit(1);
        }
      });
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    // Observability: catch unhandled errors and rejections
    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled Rejection at:", reason);
    });

    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception thrown:", err);
      // In many setups you should crash and restart — keep deterministic state.
      process.exit(1);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
