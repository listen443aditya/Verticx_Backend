// The Final, Perfected `src/script/seed.ts`

import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

// Initialize Prisma Client
const prisma = new PrismaClient();

// --- Super Admin Details ---
// The secret soul (id) and public face (email) are now distinct.
const SUPER_ADMIN_ID = "superadmin@verticx.com";
const SUPER_ADMIN_EMAIL = "aditya@verticx.com";
// The new, branded login ID.
const SUPER_ADMIN_USER_ID = "VRTX-SUPERADMIN";
const SUPER_ADMIN_PASSWORD = "#Aditya@845101";

async function seedSuperAdmin() {
  console.log("Starting to seed Super Admin...");

  // We seek the Super Admin by their immutable soul (the id).
  const existingSuperAdmin = await prisma.user.findUnique({
    where: {
      id: SUPER_ADMIN_ID,
    },
  });

  if (existingSuperAdmin) {
    console.log("Super Admin already exists. Seeding skipped.");
    return;
  }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, saltRounds);
  console.log("Password hashed successfully.");

  // We create a complete being, with all three parts of their identity.
  await prisma.user.create({
    data: {
      id: SUPER_ADMIN_ID, // The secret soul.
      userId: SUPER_ADMIN_USER_ID, // The branded login.
      email: SUPER_ADMIN_EMAIL, // The public face.
      phone: "9801537137",
      passwordHash: hashedPassword,
      name: "Aditya",
      role: UserRole.SuperAdmin,
    },
  });

  console.log("✅ Super Admin user has been created successfully!");
}

// --- Main execution block ---
async function main() {
  try {
    await seedSuperAdmin();
  } catch (error) {
    console.error("Error seeding Super Admin:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log("Database connection closed.");
  }
}

main();
