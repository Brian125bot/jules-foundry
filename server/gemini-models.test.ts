import { describe, expect, it } from "vitest";
import { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_OPTIONS, assertGeminiModelAvailable, isSupportedGeminiModel, normalizeGeminiModelName } from "./services/gemini-models";

describe("Gemini model selection policy", () => {
  it("exposes the requested bounded model catalog with the existing 2.5 Flash default", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(GEMINI_MODEL_OPTIONS.map(model => model.id)).toEqual([
      "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash",
    ]);
    expect(isSupportedGeminiModel("gemini-3.7-flash")).toBe(true);
    expect(isSupportedGeminiModel("gemini-unknown-preview")).toBe(false);
  });

  it("normalizes provider resource names and fails closed when an allowlisted model is unavailable", () => {
    expect(normalizeGeminiModelName("models/gemini-3.6-flash")).toBe("gemini-3.6-flash");
    expect(assertGeminiModelAvailable("gemini-3.6-flash", ["models/gemini-3.6-flash", "gemini-2.5-flash"])).toBe("gemini-3.6-flash");
    expect(() => assertGeminiModelAvailable("gemini-3.7-flash", ["gemini-2.5-flash"])).toThrow(/not available/i);
    expect(() => assertGeminiModelAvailable("gemini-unknown-preview", ["gemini-unknown-preview"])).toThrow(/not supported/i);
  });
});
