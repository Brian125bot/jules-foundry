import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "server/local-runtime.ts",
        "server/local-db.ts",
        "server/local-storage.ts",
        "server/services/session-control.ts",
        "server/services/vault.ts",
      ],
      thresholds: {
        statements: 85,
        branches: 60,
        functions: 85,
        lines: 85,
      },
    },
  },
});
