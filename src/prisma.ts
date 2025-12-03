// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient({
//   log: ['query', 'warn', 'error']
// });

// export default prisma;


import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

// Initialize Prisma with the Accelerate extension
const prisma = new PrismaClient().$extends(withAccelerate());

export default prisma;
