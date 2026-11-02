// Single PrismaClient across hot reloads in development.
import { PrismaClient } from "@prisma/client";

declare global {
  var __docentraPrisma: PrismaClient | undefined;
}

// Tests are pointed at the isolated test database. Without this, a test run
// would silently read and write the development database — passing against seed
// data it never created.
const testDatabaseUrl =
  process.env.VITEST || process.env.NODE_ENV === "test"
    ? process.env.TEST_DATABASE_URL
    : undefined;

export const prisma =
  globalThis.__docentraPrisma ??
  new PrismaClient(testDatabaseUrl ? { datasourceUrl: testDatabaseUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalThis.__docentraPrisma = prisma;
}
