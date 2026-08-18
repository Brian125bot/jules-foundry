import express from "express";
import { describe, expect, it } from "vitest";
import { registerLocalStorageRoutes } from "./local-storage";

describe("local artifact routes", () => {
  it("registers the wildcard artifact route under Express 5", () => {
    const app = express();
    expect(() => registerLocalStorageRoutes(app)).not.toThrow();
  });
});
