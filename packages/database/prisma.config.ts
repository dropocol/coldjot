// Prisma 7 config (for the migrate CLI). Prisma 7 removed the datasource
// `url` from schema.prisma; the migration URL is configured here instead.
// See https://pris.ly/d/prisma7-config
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
