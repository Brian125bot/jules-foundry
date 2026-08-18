import { describe, expect, it } from "vitest";
import { controlAvailability, controlPreconditionSnapshot, nextPollDelaySeconds, sessionControlKey } from "./services/session-control";

describe("granular session-control policy", () => {
  it("creates deterministic, action-scoped idempotency keys", () => {
    expect(sessionControlKey(8, "send_message", { message: "clarify scope" })).toBe(sessionControlKey(8, "send_message", { message: "clarify scope" }));
    expect(sessionControlKey(8, "send_message", { message: "clarify scope" })).not.toBe(sessionControlKey(8, "request_delete", { message: "clarify scope" }));
  });

  it("gates provider controls by Jules state while keeping local holds honest", () => {
    const planning = controlAvailability({ julesState: "PLANNING", localHold: 0, hasSession: true });
    expect(planning.canApprovePlan).toBe(false);
    expect(planning.canSetLocalHold).toBe(true);
    const approval = controlAvailability({ julesState: "AWAITING_PLAN_APPROVAL", localHold: 0, hasSession: true });
    expect(approval.primary).toBe("approve_plan");
    expect(approval.canApprovePlan).toBe(true);
    const terminal = controlAvailability({ julesState: "COMPLETED", localHold: 1, hasSession: true });
    expect(terminal.canSendMessage).toBe(false);
    expect(terminal.canReleaseLocalHold).toBe(true);
  });

  it("backs off monitoring without treating provider uncertainty as task failure", () => {
    expect(nextPollDelaySeconds("IN_PROGRESS", 0)).toBe(30);
    expect(nextPollDelaySeconds("QUEUED", 2)).toBe(480);
    expect(nextPollDelaySeconds("COMPLETED", 0)).toBeNull();
  });

  it("records a redacted precondition snapshot that binds a command to state and plan version", () => {
    const snapshot = controlPreconditionSnapshot({ julesState: "AWAITING_PLAN_APPROVAL", localHold: 0, sessionName: "sessions/99", julesPlan: "plan contents" });
    expect(snapshot).toMatchObject({ julesState: "AWAITING_PLAN_APPROVAL", localHold: false, sessionName: "sessions/99" });
    expect(snapshot.planDigest).not.toContain("plan contents");
  });
});
