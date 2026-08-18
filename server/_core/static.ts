import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";

export function serveLocalStatic(app: Express) {
  const distPath = process.env.FOUNDRY_STATIC_DIR || path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) console.error("Could not find the local browser build. Run pnpm build before starting production Jules Foundry.");
  app.use(express.static(distPath));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.resolve(distPath, "index.html")));
}
