import { PrismaPg } from "@prisma/adapter-pg";
// @ts-ignore – Prisma 7 NodeNext tip çözümleme sorunu, runtime'da çalışır
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error", "warn"],
});
