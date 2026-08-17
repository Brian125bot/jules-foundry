import { describe, expect, it } from "vitest";
import { matchJulesSource, missingJulesSourceMessage, normalizeCompiledInitiative, requiresScopeReview, SCOPE_REVIEW_PATH } from "./services/providers";

describe("Gemini task-packet normalization", () => {
  it("quarantines an empty allowed-paths array instead of failing or broadening task scope", () => {
    const initiative = normalizeCompiledInitiative({
      tasks: [{
        title: "Review session logic",
        description: "Inspect the session logic and propose a bounded update.",
        riskTier: "green",
        allowedPaths: [],
        nonGoals: ["Do not change deployment settings."],
        acceptanceCriteria: [{ id: "AC-1", text: "A bounded implementation plan exists." }],
        dependencies: [],
      }],
    });
    expect(initiative.tasks[0]?.allowedPaths).toEqual([SCOPE_REVIEW_PATH]);
    expect(initiative.tasks[0]?.riskTier).toBe("red");
    expect(initiative.tasks[0]?.nonGoals).toContain("Do not modify repository files until allowed paths are explicitly reviewed.");
  });

  it("quarantines an omitted allowedPaths field and marks it as non-dispatchable", () => {
    const initiative = normalizeCompiledInitiative({
      tasks: [{
        title: "Map test coverage",
        description: "Inspect current test coverage and identify the smallest safe update.",
        riskTier: "amber",
        nonGoals: ["Do not modify source files."],
        acceptanceCriteria: [{ id: "AC-2", text: "A bounded test coverage report exists." }],
        dependencies: [],
      }],
    });
    const allowedPaths = initiative.tasks[0]?.allowedPaths ?? [];
    expect(allowedPaths).toEqual([SCOPE_REVIEW_PATH]);
    expect(requiresScopeReview(allowedPaths)).toBe(true);
    expect(requiresScopeReview(["server/routes.ts"])).toBe(false);
  });
});

describe("Jules source discovery", () => {
  it("matches connected repositories case-insensitively and provides actionable connection guidance when absent", () => {
    const source = matchJulesSource([{ name: "sources/github-brian125bot-getit", id: "github-brian125bot-getit", githubRepo: { owner: "Brian125Bot", repo: "GetIt" } }], "brian125bot/getit");
    expect(source?.name).toBe("sources/github-brian125bot-getit");
    expect(missingJulesSourceMessage("brian125bot/getit")).toContain("connect this GitHub repository");
    expect(missingJulesSourceMessage("brian125bot/getit")).toContain("cannot create a repository connection");
  });
});
