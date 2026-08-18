import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle-local",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.FOUNDRY_DB_PATH ?? "./.local/jules-foundry.sqlite",
  },
});
