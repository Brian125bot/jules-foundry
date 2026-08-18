import { describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn(() => false) } }));

import axios from "axios";
import { listGeminiModels } from "./services/providers";

describe("Gemini provider model catalog", () => {
  it("walks paginated model responses, normalizes resource names, and retains only generation-capable entries", async () => {
    const getMock = vi.mocked(axios.get);
    getMock
      .mockResolvedValueOnce({ data: { models: [
        { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
      ], nextPageToken: "page-2" } } as never)
      .mockResolvedValueOnce({ data: { models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
      ] } } as never);

    await expect(listGeminiModels("model-catalog-key")).resolves.toEqual(["gemini-2.5-flash", "gemini-3.6-flash"]);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock.mock.calls[1]?.[1]).toMatchObject({ params: { key: "model-catalog-key", pageSize: 1000, pageToken: "page-2" } });
  });
});
