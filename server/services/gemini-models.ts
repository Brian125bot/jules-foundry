export type GeminiModelOption = {
  id: string;
  label: string;
  tier: "frontier" | "workhorse" | "efficient" | "lite";
  description: string;
};

export const GEMINI_MODEL_OPTIONS: readonly GeminiModelOption[] = [
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", tier: "frontier", description: "High-capability workhorse for complex coding and agent workflows." },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", tier: "workhorse", description: "Balanced coding, reasoning, and multimodal workhorse." },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", tier: "workhorse", description: "Prior-generation fast general-purpose model." },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", tier: "lite", description: "Low-latency and high-throughput planning or review option." },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", tier: "lite", description: "Earlier Flash-Lite option for compatible accounts." },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "efficient", description: "Established default for bounded Foundry inference." },
] as const;

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function isSupportedGeminiModel(model: string): model is (typeof GEMINI_MODEL_OPTIONS)[number]["id"] {
  return GEMINI_MODEL_OPTIONS.some(option => option.id === model);
}

export function normalizeGeminiModelName(value: string) {
  return value.replace(/^models\//, "").trim();
}

export function assertGeminiModelAvailable(model: string, availableModels: string[]) {
  if (!isSupportedGeminiModel(model)) throw new Error("The requested Gemini model is not supported by Jules Foundry.");
  const available = new Set(availableModels.map(normalizeGeminiModelName));
  if (!available.has(model)) throw new Error(`Gemini model '${model}' is not available for the configured Gemini credential. Choose an available model or verify the credential.`);
  return model;
}
