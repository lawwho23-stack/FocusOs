import { PrismaClient } from "@prisma/client";

// One shared Prisma Client for the whole app.
// Why: Next.js reloads code often in dev. Without this, each reload
// opens a new database connection and Supabase runs out of connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
