import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "";

export default defineConfig({
  ...(databaseUrl.length > 0 ? { dbCredentials: { url: databaseUrl } } : {}),
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/adapters/persistence/schema.ts",
});
