// src/scripts/seed.ts

import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

// Initialize Prisma Client
const prisma = new PrismaClient();

// --- Super Admin Details ---
const SUPER_ADMIN_ID = "listen443Aditya";
const SUPER_ADMIN_EMAIL = "superadmin@verticx.com";
const SUPER_ADMIN_PASSWORD = "#Aditya@845101";

async function seedSuperAdmin() {
  console.log("Starting to seed Super Admin...");

  // 1. Check if the super admin already exists to prevent duplicates
  const existingSuperAdmin = await prisma.user.findUnique({
    where: {
      id: SUPER_ADMIN_ID,
    },
  });

  if (existingSuperAdmin) {
    console.log("Super Admin already exists. Seeding skipped.");
    return;
  }

  // 2. Hash the password
  // A salt round of 10 is a strong, standard choice.
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, saltRounds);
  console.log("Password hashed successfully.");

  // 3. Create the user in the database
  await prisma.user.create({
    data: {
      id: SUPER_ADMIN_ID,
      email: SUPER_ADMIN_EMAIL,
      password: hashedPassword, // Store the HASHED password
      name: "Super Admin", // A default name
      role: UserRole.SuperAdmin, // Ensure this matches your Prisma schema enum for roles
      // Add any other required fields with default values
      // e.g., status: 'active'
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
    // 5. Always disconnect from the database
    await prisma.$disconnect();
    console.log("Database connection closed.");
  }
}

main();
