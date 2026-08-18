import { digestPayload } from "./vault";

export type SessionControlType = "refresh" | "approve_plan" | "send_message" | "request_delete" | "set_local_hold" | "release_local_hold" | "reconcile" | "export_dossier";

export function sessionControlKey(taskId: number, type: SessionControlType, payload: unknown) {
  return `control:${taskId}:${type}:${digestPayload(payload)}`;
}

export function controlAvailability(input: { julesState?: string | null; localHold?: number | null; hasSession: boolean }) {
  const state = input.julesState ?? "NOT_DISPATCHED";
  const terminal = state === "COMPLETED" || state === "FAILED";
  const active = input.hasSession && !terminal;
  return {
    state,
    primary: state === "AWAITING_PLAN_APPROVAL" ? "approve_plan" : state === "AWAITING_USER_FEEDBACK" ? "send_message" : terminal ? "export_dossier" : "refresh",
    canRefresh: active,
    canApprovePlan: state === "AWAITING_PLAN_APPROVAL",
    canSendMessage: active,
    canDelete: input.hasSession,
    canSetLocalHold: active && !Boolean(input.localHold),
    canReleaseLocalHold: Boolean(input.localHold),
    canReconcile: input.hasSession,
    canExportDossier: true,
  };
}

export function nextPollDelaySeconds(state?: string | null, errorStreak = 0) {
  if (state === "COMPLETED" || state === "FAILED") return null;
  const baseline = state === "IN_PROGRESS" || state === "PLANNING" || state === "AWAITING_PLAN_APPROVAL" || state === "AWAITING_USER_FEEDBACK" ? 30 : 120;
  return Math.min(baseline * 2 ** Math.min(errorStreak, 4), 900);
}

export function controlPreconditionSnapshot(input: { julesState?: string | null; localHold?: number | null; sessionName?: string | null; julesPlan?: string | null }) {
  return { julesState: input.julesState ?? null, localHold: Boolean(input.localHold), sessionName: input.sessionName ?? null, planDigest: input.julesPlan ? digestPayload(input.julesPlan) : null };
}
