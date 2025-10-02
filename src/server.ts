// src/server.ts
import dotenv from "dotenv";
dotenv.config(); // Load env before anything else

import http from "http";
import { Request, Response, NextFunction } from "express";
import app from "./app";
import prisma from "./prisma";

const PORT = Number(process.env.PORT) || 8080;

async function startServer() {
  try {
    // Connect Prisma
    await prisma.$connect();
    console.log(" Prisma connected");

    // Create HTTP server
    const server = http.createServer(app);

    // Optional: global error handler (safety net).
    // Note: app.ts already has one. Keeping here as double protection.
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      console.error("Unhandled error (server.ts middleware):", err);
      if (res.headersSent) return next(err);
      res.status(500).json({ error: "Internal Server Error" });
    });

    // Start listening
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Verticx backend running on port ${PORT}`);
    });

    // ✅ Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.log(`\n Received ${signal}. Shutting down gracefully...`);
      server.close(async (err?: Error) => {
        if (err) {
          console.error("Error while closing server:", err);
          process.exit(1);
        }
        try {
          await prisma.$disconnect();
          console.log(" Prisma disconnected");
          process.exit(0);
        } catch (e) {
          console.error("Error during Prisma disconnect:", e);
          process.exit(1);
        }
      });
    };


    

    // ADD THIS LINE
    console.log(
      `[DEBUG] The value of process.env.PORT from Railway is: ${process.env.PORT}`
    );

    dotenv.config(); // Load env before anything else





    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    // ✅ Observability
    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled Rejection:", reason);
    });

    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
      // In production you may prefer process.exit(1) + restart
      process.exit(1);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
