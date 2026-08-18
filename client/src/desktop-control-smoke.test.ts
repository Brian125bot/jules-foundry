import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function pageSource(name: string) {
  return readFile(path.join(process.cwd(), "client", "src", "pages", name), "utf8");
}

describe("desktop control-plane smoke coverage", () => {
  it("retains the command-center navigation and primary initiative action", async () => {
    const source = await pageSource("Home.tsx");
    expect(source).toContain('setLocation("/initiatives")');
    expect(source).toContain('setLocation("/fleet")');
    expect(source).toContain('setLocation("/credentials")');
  });

  it("retains Fleet mission navigation and reconciliation controls", async () => {
    const source = await pageSource("Fleet.tsx");
    expect(source).toContain("reconcile.mutate()");
    expect(source).toContain("setLocation(`/tasks/${task.id}`)");
    expect(source).toContain("<ReconcileButton");
  });

  it("retains credential vault add, test, rotate, and delete actions", async () => {
    const source = await pageSource("Credentials.tsx");
    expect(source).toContain("credentials.save.useMutation");
    expect(source).toContain("credentials.test.useMutation");
    expect(source).toContain("credentials.delete.useMutation");
    expect(source).toContain("Rotate credential");
  });

  it("retains initiative create, compile, mission-open, and deletion controls", async () => {
    const source = await pageSource("Initiatives.tsx");
    expect(source).toContain("initiatives.create.useMutation");
    expect(source).toContain("initiatives.compile.useMutation");
    expect(source).toContain("initiatives.remove.useMutation");
    expect(source).toContain("Open mission");
    expect(source).toContain("Initiative Quality Gate");
    expect(source).toContain("quality.generateContract.useMutation");
    expect(source).toContain("quality.decideContract.useMutation");
  });

  it("retains task dispatch, polling, evidence, and plan-action controls", async () => {
    const source = await pageSource("TaskDetail.tsx");
    expect(source).toContain("dispatch.run.useMutation");
    expect(source).toContain("observatory.poll.useMutation");
    expect(source).toContain("plans.action.useMutation");
    expect(source).toContain("evidence.verify.useMutation");
    expect(source).toContain("Link evidence");
    expect(source).toContain("Quality Mesh");
    expect(source).toContain("quality.compilePrompt.useMutation");
    expect(source).toContain("quality.runVerification.useMutation");
    expect(source).toContain("quality.runRecovery.useMutation");
    expect(source).toContain("foundry.session.deck.useQuery");
    expect(source).toContain("foundry.session.command.useMutation");
    expect(source).toContain("Session Command Deck");
    expect(source).toContain("Foundry-only hold");
    expect(source).toContain('type: "reconcile"');
    expect(source).toContain('"set_local_hold"');
    expect(source).toContain("Recent command ledger");
  });
});
