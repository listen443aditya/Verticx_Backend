import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { Request, Response, NextFunction } from "express";
import app from "./app";
import prisma from "./prisma";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

async function startServer() {
  try {
    await prisma.$connect();
    console.log(" Prisma connected");

    const server = http.createServer(app);

    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      console.error("Unhandled error (server.ts middleware):", err);
      if (res.headersSent) return next(err);
      res.status(500).json({ error: "Internal Server Error" });
    });

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Verticx backend running on port ${PORT}`);
    });

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

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled Rejection:", reason);
    });

    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
      process.exit(1);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
