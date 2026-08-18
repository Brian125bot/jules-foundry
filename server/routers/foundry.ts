import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { credentialProfiles, initiatives, qualityContracts, qualityPrompts, qualityRecoveries, qualityVerifications, taskApprovals, taskAttempts, taskEvidence, taskEvents, tasks } from "../../drizzle/schema";
import { getCredentialById, getCredentialProfiles, getCredentialSecret, getDb, getInitiativeForUser, getTaskForUser, getTaskTimeline, requireDb } from "../db";
import { digestPayload, decryptSecret, encryptSecret, maskSecret } from "../services/vault";
import { analyzeQualityRecovery, approveJulesPlan, compileWithGemini, createJulesSession, findJulesSource, generateQualityContract, messageJulesSession, pollJulesSession, requiresScopeReview, runAdversarialQualityReview, testCredential, validateGitHubBranch } from "../services/providers";
import { buildDeterministicProofMap, buildProofCarryingPrompt, canDispatchWithQualityContract, classifyRecovery, deriveInitiativeQualityVerdict, deriveQualityVerdict, isQualityVerificationEligible } from "../services/quality";
import { protectedProcedure, router } from "../_core/trpc";

const credentialInput = z.object({ provider: z.enum(["jules", "gemini", "github"]), label: z.string().trim().min(2).max(120), secret: z.string().trim().min(8).max(4000) });
const healthLabels = ["healthy", "stale", "attention", "terminal"] as const;
const terminalJulesStates = new Set(["COMPLETED", "FAILED"]);
const activeInitiativeStates = new Set(["dispatched", "plan_gate", "executing"]);

export const dispatchAttemptKey = (taskId: number, taskKey: string) => `dispatch:${taskId}:${taskKey}`;
export const pollAttemptKey = (taskId: number, bucket: number) => `poll:${taskId}:${bucket}`;
/** Conservative planning estimate only; never a substitute for provider-issued billing. */
export const ESTIMATED_CENTS_PER_PROVIDER_CALL = 1;

export function resolveCredentialWriteTarget(selectedCredentialId: number | undefined, matchingCredentialId: number | undefined) {
  if (matchingCredentialId && matchingCredentialId !== selectedCredentialId) return { targetId: matchingCredentialId, redundantId: selectedCredentialId ?? null };
  return { targetId: selectedCredentialId ?? matchingCredentialId ?? null, redundantId: null };
}

export function summarizeInitiativeDeletion(tasksForInitiative: Array<{ id: number; title: string; state: string; julesSessionName?: string | null }>) {
  const activeSessions = tasksForInitiative.filter(task => Boolean(task.julesSessionName) && activeInitiativeStates.has(task.state));
  return { taskCount: tasksForInitiative.length, activeSessions, canDelete: activeSessions.length === 0 };
}

function userId(ctx: { user: { id: number } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return ctx.user.id;
}

function parseList(value: string) {
  try { return JSON.parse(value); } catch { return []; }
}

export function validateCompiledDag(items: Array<{ title: string; dependencies: string[] }>) {
  const titles = new Set(items.map(item => item.title.trim().toLowerCase()));
  if (titles.size !== items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "The task graph contains duplicate task titles." });
  const edges = new Map(items.map(item => [item.title.trim().toLowerCase(), item.dependencies.map(dependency => dependency.trim().toLowerCase())]));
  for (const [title, dependencies] of Array.from(edges.entries())) {
    for (const dependency of dependencies) {
      if (dependency === title) throw new TRPCError({ code: "BAD_REQUEST", message: `Task '${title}' cannot depend on itself.` });
      if (!titles.has(dependency)) throw new TRPCError({ code: "BAD_REQUEST", message: `Task '${title}' refers to a dependency that does not exist: '${dependency}'.` });
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (title: string): void => {
    if (visiting.has(title)) throw new TRPCError({ code: "BAD_REQUEST", message: "The compiled task graph contains a dependency cycle." });
    if (visited.has(title)) return;
    visiting.add(title); (edges.get(title) ?? []).forEach(visit); visiting.delete(title); visited.add(title);
  };
  Array.from(edges.keys()).forEach(visit);
}

function mapJulesState(state?: string | null) {
  if (!state) return "dispatched" as const;
  if (state === "AWAITING_PLAN_APPROVAL") return "plan_gate" as const;
  if (state === "IN_PROGRESS") return "executing" as const;
  if (state === "COMPLETED") return "review_ready" as const;
  if (state === "FAILED" || state === "AWAITING_USER_FEEDBACK" || state === "PAUSED") return "blocked" as const;
  return "dispatched" as const;
}

export function deriveHealth(julesState?: string | null, lastActivity?: Date | null) {
  if (julesState && terminalJulesStates.has(julesState)) return "terminal" as const;
  if (julesState === "AWAITING_PLAN_APPROVAL" || julesState === "AWAITING_USER_FEEDBACK" || julesState === "PAUSED") return "attention" as const;
  if (lastActivity && Date.now() - lastActivity.getTime() > 20 * 60 * 1000) return "stale" as const;
  return "healthy" as const;
}

export function buildDossierMarkdown(input: { task: { title: string; taskKey: string; julesSessionUrl?: string | null; julesSessionName?: string | null; prUrl?: string | null }; initiative: { repository: string; branch: string }; criteria: Array<{ id: string; text: string }>; evidence: Array<{ criterionId: string; status: string; label: string; reference?: string | null }>; events: Array<{ createdAt: Date; source: string; eventType: string; summary: string }> }) {
  const lines = ["# Jules Foundry Evidence Dossier", "", `## ${input.task.title}`, "", `- **Repository:** ${input.initiative.repository}`, `- **Branch:** ${input.initiative.branch}`, `- **Task key:** ${input.task.taskKey}`, `- **Jules session:** ${input.task.julesSessionUrl ?? input.task.julesSessionName ?? "Not dispatched"}`, `- **PR:** ${input.task.prUrl ?? "Not available"}`, `- **Generated:** ${new Date().toISOString()}`, "", "## Acceptance criteria", ""];
  for (const criterion of input.criteria) {
    const linked = input.evidence.filter(item => item.criterionId === criterion.id);
    lines.push(`### ${criterion.id}: ${criterion.text}`, linked.length ? linked.map(item => `- **${item.status}** — ${item.label}${item.reference ? ` (${item.reference})` : ""}`).join("\n") : "- **unproven** — No linked evidence yet.", "");
  }
  lines.push("## Mission events", "", ...input.events.slice().reverse().map(event => `- ${event.createdAt.toISOString()} · **${event.source}/${event.eventType}** · ${event.summary}`));
  return lines.join("\n");
}

async function requireReadySecret(user: number, provider: "jules" | "gemini" | "github") {
  const credential = await getCredentialSecret(user, provider);
  if (!credential) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Add a ${provider} credential in the vault before continuing.` });
  return decryptSecret(credential.encryptedSecret);
}

async function recordEvent(taskId: number, source: "local" | "jules" | "github" | "gemini", eventType: string, summary: string, metadata?: unknown, transition?: { previous?: string | null; next?: string | null }) {
  const db = requireDb(await getDb());
  await db.insert(taskEvents).values({
    eventId: nanoid(24), taskId, source, eventType, summary,
    previousState: transition?.previous ?? null, nextState: transition?.next ?? null,
    payloadDigest: metadata ? digestPayload(metadata) : null, metadata: metadata ? JSON.stringify(metadata) : null, correlationId: nanoid(12),
  });
}

async function createAttempt(taskId: number, type: "dispatch" | "poll" | "approval" | "message" | "verification", key: string) {
  const db = requireDb(await getDb());
  const existing = (await db.select().from(taskAttempts).where(eq(taskAttempts.idempotencyKey, key)).limit(1))[0];
  if (existing) { await recordEvent(taskId, "local", `${type}_attempt_reused`, `Idempotency key reused for ${type} attempt.`, { key, outcome: existing.outcome }); return { attempt: existing, reused: true }; }
  const result = await db.insert(taskAttempts).values({ taskId, attemptType: type, idempotencyKey: key, outcome: "pending", apiCallCount: 0 });
  await recordEvent(taskId, "local", `${type}_attempt_started`, `Started ${type} attempt.`, { key });
  return { attempt: { id: Number(result[0].insertId), taskId, idempotencyKey: key }, reused: false };
}

async function finishAttempt(attemptId: number, outcome: "success" | "failure" | "reused", started: number, details?: unknown, backoffReason?: string) {
  const db = requireDb(await getDb());
  // This is a deterministic planning estimate, not a provider billing record: one cent per recorded external call.
  await db.update(taskAttempts).set({ outcome, apiCallCount: 1, estimatedSpendCents: ESTIMATED_CENTS_PER_PROVIDER_CALL, elapsedMs: Date.now() - started, details: details ? JSON.stringify(details) : null, backoffReason: backoffReason ?? null, completedAt: new Date() }).where(eq(taskAttempts.id, attemptId));
}

async function pollOne(user: number, taskId: number, bucket = Math.floor(Date.now() / 30000)) {
  const record = await getTaskForUser(user, taskId);
  if (!record?.task.julesSessionName) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This task has not been dispatched to Jules." });
  const key = pollAttemptKey(record.task.id, bucket);
  const stored = await createAttempt(record.task.id, "poll", key);
  if (stored.reused) return { reused: true, taskId: record.task.id };
  const started = Date.now();
  try {
    const secret = await requireReadySecret(user, "jules");
    const response = await pollJulesSession(secret, record.task.julesSessionName);
    const previous = record.task.julesState;
    const sessionState = response.session?.state ?? previous;
    const activity = response.activities.at(-1);
    const activityTime = activity?.createTime ? new Date(activity.createTime) : new Date();
    const health = deriveHealth(sessionState, activityTime);
    const nextState = mapJulesState(sessionState);
    const outputs = response.session?.outputs ?? [];
    const prUrl = outputs.find((item: any) => item.pullRequest?.url)?.pullRequest?.url ?? record.task.prUrl;
    const plan = response.activities.find((item: any) => item.planGenerated?.plan)?.planGenerated?.plan;
    const db = requireDb(await getDb());
    await db.update(tasks).set({ julesState: sessionState, state: nextState, health, lastPolledAt: new Date(), lastActivityAt: activityTime, prUrl, julesPlan: plan ? JSON.stringify(plan) : record.task.julesPlan, lastError: null }).where(eq(tasks.id, record.task.id));
    await recordEvent(record.task.id, "jules", "session_polled", `Jules reports ${sessionState}.`, { sessionState, activityCount: response.activities.length, prUrl }, { previous, next: sessionState });
    for (const item of response.activities.slice(-8)) {
      const type = item.planGenerated ? "plan_generated" : item.progressUpdated ? "progress_updated" : item.agentMessaged ? "agent_messaged" : item.sessionCompleted ? "session_completed" : item.sessionFailed ? "session_failed" : "activity";
      await recordEvent(record.task.id, "jules", type, item.description || type.replaceAll("_", " "), { activityId: item.id, type, artifacts: item.artifacts?.length ?? 0 });
      for (const [artifactIndex, artifact] of (item.artifacts ?? []).entries()) {
        const artifactType = artifact.changeSet ? "change_set" : artifact.bashOutput ? "bash_output" : artifact.media ? "media" : "artifact";
        const artifactSummary = artifact.bashOutput?.command ? `Captured bash output for ${artifact.bashOutput.command}.` : artifact.changeSet?.gitPatch?.suggestedCommitMessage ? `Captured change set: ${artifact.changeSet.gitPatch.suggestedCommitMessage}` : `Captured ${artifactType} artifact.`;
        await recordEvent(record.task.id, "jules", `artifact_${artifactType}`, artifactSummary, { activityId: item.id, artifactIndex, artifactType });
      }
    }
    await finishAttempt(stored.attempt.id, "success", started, { sessionState, activityCount: response.activities.length });
    return { reused: false, taskId: record.task.id, health };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Polling failed";
    const db = requireDb(await getDb());
    await db.update(tasks).set({ health: "attention", lastError: message.slice(0, 500), lastPolledAt: new Date() }).where(eq(tasks.id, record.task.id));
    await recordEvent(record.task.id, "local", "poll_failed", message, { message });
    await finishAttempt(stored.attempt.id, "failure", started, { message }, "provider request failed");
    throw error;
  }
}

export const foundryRouter = router({
  credentials: router({
    list: protectedProcedure.query(({ ctx }) => getCredentialProfiles(userId(ctx))),
    save: protectedProcedure.input(credentialInput.extend({ credentialId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const user = userId(ctx);
      const nextValues = { provider: input.provider, label: input.label, encryptedSecret: encryptSecret(input.secret), maskedSecret: maskSecret(input.secret), status: "unverified" as const, lastError: null };
      const matchingProfile = (await db.select().from(credentialProfiles).where(and(eq(credentialProfiles.userId, user), eq(credentialProfiles.provider, input.provider), eq(credentialProfiles.label, input.label))).limit(1))[0];
      const target = resolveCredentialWriteTarget(input.credentialId, matchingProfile?.id);
      if (target.targetId && target.targetId !== input.credentialId) {
        const winner = await getCredentialById(user, target.targetId);
        if (!winner) throw new TRPCError({ code: "NOT_FOUND" });
        await db.update(credentialProfiles).set({ ...nextValues, version: winner.version + 1 }).where(eq(credentialProfiles.id, winner.id));
        if (target.redundantId) await db.delete(credentialProfiles).where(and(eq(credentialProfiles.id, target.redundantId), eq(credentialProfiles.userId, user)));
        return { id: winner.id, updated: true, consolidated: Boolean(target.redundantId) };
      }
      if (input.credentialId) {
        const existing = await getCredentialById(user, input.credentialId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        await db.update(credentialProfiles).set({ ...nextValues, version: existing.version + 1 }).where(eq(credentialProfiles.id, existing.id));
        return { id: existing.id, updated: true };
      }
      const result = await db.insert(credentialProfiles).values({ userId: user, ...nextValues });
      return { id: Number(result[0].insertId), updated: false };
    }),
    test: protectedProcedure.input(z.object({ credentialId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const profile = await getCredentialById(userId(ctx), input.credentialId);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await testCredential(profile.provider, decryptSecret(profile.encryptedSecret));
      await db.update(credentialProfiles).set({ status: result.ok ? "ready" : "error", lastTestedAt: new Date(), lastError: result.ok ? null : result.message }).where(eq(credentialProfiles.id, profile.id));
      return result;
    }),
    delete: protectedProcedure.input(z.object({ credentialId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const profile = await getCredentialById(userId(ctx), input.credentialId);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(credentialProfiles).where(eq(credentialProfiles.id, profile.id));
      return { success: true };
    }),
  }),
  initiatives: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      const user = userId(ctx);
      const items = await db.select().from(initiatives).where(eq(initiatives.userId, user)).orderBy(desc(initiatives.updatedAt));
      const ids = items.map(item => item.id);
      const groupedTasks = ids.length ? await db.select().from(tasks).where(inArray(tasks.initiativeId, ids)) : [];
      const evidenceRows = groupedTasks.length ? await db.select().from(taskEvidence).where(inArray(taskEvidence.taskId, groupedTasks.map(task => task.id))) : [];
      return items.map(item => ({ ...item, tasks: groupedTasks.filter(task => task.initiativeId === item.id).map(task => {
        const criteria = parseList(task.acceptanceCriteria) as Array<{ id: string; text: string }>;
        const taskEvidenceRows = evidenceRows.filter(evidence => evidence.taskId === task.id);
        const evidenceDebt = criteria.filter(criterion => !taskEvidenceRows.some(evidence => evidence.criterionId === criterion.id && evidence.status === "proven")).length;
        return { ...task, allowedPaths: parseList(task.allowedPaths), nonGoals: parseList(task.nonGoals), acceptanceCriteria: criteria, dependencies: parseList(task.dependencies), evidenceDebt };
      }) }));
    }),
    create: protectedProcedure.input(z.object({ title: z.string().min(3).max(180), prompt: z.string().min(20).max(12000), repository: z.string().regex(/^[^/]+\/[^/]+$/), branch: z.string().min(1).max(255), baseSha: z.string().max(80).optional(), budgetCents: z.number().int().min(10).max(500000).default(500) })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const result = await db.insert(initiatives).values({ ...input, userId: userId(ctx) });
      return { id: Number(result[0].insertId) };
    }),
    deletePreview: protectedProcedure.input(z.object({ initiativeId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const initiative = await getInitiativeForUser(userId(ctx), input.initiativeId);
      if (!initiative) throw new TRPCError({ code: "NOT_FOUND" });
      const initiativeTasks = await db.select({ id: tasks.id, title: tasks.title, state: tasks.state, julesSessionName: tasks.julesSessionName }).from(tasks).where(eq(tasks.initiativeId, initiative.id));
      return { initiative: { id: initiative.id, title: initiative.title, repository: initiative.repository, branch: initiative.branch }, ...summarizeInitiativeDeletion(initiativeTasks) };
    }),
    remove: protectedProcedure.input(z.object({ initiativeId: z.number().int().positive(), confirmation: z.string().min(1).max(180) })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const user = userId(ctx);
      const initiative = await getInitiativeForUser(user, input.initiativeId);
      if (!initiative) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.confirmation !== initiative.title) throw new TRPCError({ code: "BAD_REQUEST", message: "Type the initiative title exactly to confirm deletion." });
      const initiativeTasks = await db.select({ id: tasks.id, title: tasks.title, state: tasks.state, julesSessionName: tasks.julesSessionName }).from(tasks).where(eq(tasks.initiativeId, initiative.id));
      const summary = summarizeInitiativeDeletion(initiativeTasks);
      if (!summary.canDelete) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Cannot delete while ${summary.activeSessions.length} Jules session${summary.activeSessions.length === 1 ? " is" : "s are"} active. Wait for completion or resolve the session first.` });
      const taskIds = initiativeTasks.map(task => task.id);
      await db.transaction(async tx => {
        if (taskIds.length) {
          await tx.delete(taskApprovals).where(inArray(taskApprovals.taskId, taskIds));
          await tx.delete(taskAttempts).where(inArray(taskAttempts.taskId, taskIds));
          await tx.delete(taskEvents).where(inArray(taskEvents.taskId, taskIds));
          await tx.delete(taskEvidence).where(inArray(taskEvidence.taskId, taskIds));
          await tx.delete(tasks).where(inArray(tasks.id, taskIds));
        }
        await tx.delete(initiatives).where(and(eq(initiatives.id, initiative.id), eq(initiatives.userId, user)));
      });
      return { success: true, deletedTaskCount: taskIds.length };
    }),
    compile: protectedProcedure.input(z.object({ initiativeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const user = userId(ctx);
      const initiative = await getInitiativeForUser(user, input.initiativeId);
      if (!initiative) throw new TRPCError({ code: "NOT_FOUND" });
      const existingTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.initiativeId, initiative.id)).limit(1);
      if (existingTasks.length) throw new TRPCError({ code: "CONFLICT", message: "This initiative already has a compiled task graph." });
      const secret = await requireReadySecret(user, "gemini");
      const compiled = await compileWithGemini(secret, initiative);
      validateCompiledDag(compiled.tasks);
      const insertTasks = compiled.tasks.map((task, index) => ({
        initiativeId: initiative.id, taskKey: nanoid(12), title: task.title, description: task.description, riskTier: task.riskTier,
        allowedPaths: JSON.stringify(task.allowedPaths), nonGoals: JSON.stringify(task.nonGoals), acceptanceCriteria: JSON.stringify(task.acceptanceCriteria), dependencies: JSON.stringify(task.dependencies), dispatchOrder: index + 1, idempotencyKey: `compile:${initiative.id}:${index}:${nanoid(8)}`,
      }));
      const taskResults = [] as Array<{ id: number; index: number }>;
      for (const [index, task] of Array.from(insertTasks.entries())) {
        const inserted = await db.insert(tasks).values(task);
        const taskId = Number(inserted[0].insertId);
        taskResults.push({ id: taskId, index });
        await recordEvent(taskId, "gemini", "task_compiled", "Gemini structured output passed deterministic dependency-DAG validation.", { dependencyCount: compiled.tasks[index].dependencies.length, riskTier: compiled.tasks[index].riskTier });
        for (const criterion of compiled.tasks[index].acceptanceCriteria) {
          await db.insert(taskEvidence).values({ taskId, criterionId: criterion.id, criterionText: criterion.text, status: "unproven", evidenceType: "verification", label: "No linked evidence yet", detail: "Criterion was created during task compilation and awaits evidence." });
        }
      }
      await db.update(initiatives).set({ status: "compiled" }).where(eq(initiatives.id, initiative.id));
      return { taskCount: taskResults.length };
    }),
  }),
  observatory: router({
    fleet: protectedProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      const user = userId(ctx);
      const rows = await db.select({ task: tasks, initiative: initiatives }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(eq(initiatives.userId, user)).orderBy(desc(tasks.updatedAt));
      return rows.map(row => ({ ...row.task, initiativeTitle: row.initiative.title, repository: row.initiative.repository, branch: row.initiative.branch, allowedPaths: parseList(row.task.allowedPaths), nonGoals: parseList(row.task.nonGoals), acceptanceCriteria: parseList(row.task.acceptanceCriteria), dependencies: parseList(row.task.dependencies) }));
    }),
    taskDetail: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const record = await getTaskForUser(userId(ctx), input.taskId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      const timeline = await getTaskTimeline(record.task.id);
      return { ...record.task, repository: record.initiative.repository, branch: record.initiative.branch, budgetCents: record.initiative.budgetCents, allowedPaths: parseList(record.task.allowedPaths), nonGoals: parseList(record.task.nonGoals), acceptanceCriteria: parseList(record.task.acceptanceCriteria), dependencies: parseList(record.task.dependencies), julesPlan: record.task.julesPlan ? parseList(record.task.julesPlan) : null, ...timeline };
    }),
    reconcile: protectedProcedure.mutation(async ({ ctx }) => {
      const db = requireDb(await getDb());
      const user = userId(ctx);
      const active = await db.select({ id: tasks.id }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(and(eq(initiatives.userId, user), inArray(tasks.state, ["dispatched", "plan_gate", "executing", "blocked"])));
      const outcomes = await Promise.allSettled(active.map(item => pollOne(user, item.id)));
      return { checked: active.length, updated: outcomes.filter(item => item.status === "fulfilled").length, errors: outcomes.filter(item => item.status === "rejected").length };
    }),
    poll: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(({ ctx, input }) => pollOne(userId(ctx), input.taskId)),
  }),
  dispatch: router({
    run: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), requirePlanApproval: z.boolean(), autoCreatePr: z.boolean() })).mutation(async ({ ctx, input }) => {
      const user = userId(ctx);
      const record = await getTaskForUser(user, input.taskId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.task.julesSessionName) return { reused: true, sessionName: record.task.julesSessionName };
      const db = requireDb(await getDb());
      const key = dispatchAttemptKey(record.task.id, record.task.idempotencyKey);
      const attempt = await createAttempt(record.task.id, "dispatch", key);
      if (attempt.reused) return { reused: true, sessionName: record.task.julesSessionName };
      const started = Date.now();
      let reservationGranted = false;
      let sessionCreated = false;
      try {
        const activeSiblings = await db.select().from(tasks).where(and(eq(tasks.initiativeId, record.task.initiativeId), inArray(tasks.state, ["reserved", "dispatched", "plan_gate", "executing"]))).orderBy(desc(tasks.updatedAt));
        const allowedPaths = parseList(record.task.allowedPaths) as string[];
        if (requiresScopeReview(allowedPaths)) {
          const message = "Task scope requires review because Gemini did not provide concrete allowed paths. Recompile the initiative with specific repository paths before dispatching.";
          await db.update(tasks).set({ state: "blocked", health: "attention", blockedReason: message }).where(eq(tasks.id, record.task.id));
          await recordEvent(record.task.id, "gemini", "scope_review_required", message, { allowedPaths });
          throw new Error(message);
        }
        const conflictingTask = activeSiblings.find(sibling => sibling.id !== record.task.id && (parseList(sibling.allowedPaths) as string[]).some(path => allowedPaths.includes(path)));
        if (conflictingTask) {
          const message = `Reservation conflict with active task '${conflictingTask.title}' on shared allowed paths.`;
          await db.update(tasks).set({ state: "blocked", health: "attention", reservationConflict: message, blockedReason: message }).where(eq(tasks.id, record.task.id));
          await recordEvent(record.task.id, "local", "reservation_conflict", message, { conflictingTaskId: conflictingTask.id, sharedPaths: (parseList(conflictingTask.allowedPaths) as string[]).filter(path => allowedPaths.includes(path)) });
          throw new Error(message);
        }
        await db.update(tasks).set({ state: "reserved", health: "healthy", reservationConflict: null, blockedReason: null }).where(eq(tasks.id, record.task.id));
        reservationGranted = true;
        await recordEvent(record.task.id, "local", "reservation_granted", "Path reservation granted before Jules dispatch.", { allowedPaths });
        const [julesSecret, githubSecret] = await Promise.all([requireReadySecret(user, "jules"), requireReadySecret(user, "github")]);
        const branchCheck = await validateGitHubBranch(githubSecret, record.initiative.repository, record.initiative.branch);
        if (!branchCheck.ok) throw new Error(branchCheck.message);
        const source = await findJulesSource(julesSecret, record.initiative.repository, record.initiative.branch);
        if (!source.ok) throw new Error(source.message);
        const contract = (await db.select().from(qualityContracts).where(eq(qualityContracts.initiativeId, record.initiative.id)).orderBy(desc(qualityContracts.createdAt)).limit(1))[0];
        if (!canDispatchWithQualityContract(contract?.decision)) throw new Error(`Quality contract v${contract!.version} requires an operator decision before dispatch.`);
        const criteria = parseList(record.task.acceptanceCriteria) as Array<{ id: string; text: string }>;
        const draftPacket = buildProofCarryingPrompt({ title: record.task.title, description: record.task.description, allowedPaths, nonGoals: parseList(record.task.nonGoals), acceptanceCriteria: criteria });
        const twin = { taskKey: record.task.taskKey, contractId: contract?.id ?? null, contractDecision: contract?.decision ?? "absent", allowedPaths, nonGoals: parseList(record.task.nonGoals), criteria, createdForOperatorConfirmedDispatch: true };
        const promptDigest = digestPayload({ promptText: draftPacket, twin });
        const existingPrompt = (await db.select().from(qualityPrompts).where(eq(qualityPrompts.promptDigest, promptDigest)).limit(1))[0];
        const prompt = existingPrompt ?? (() => null)();
        const packet = prompt?.promptText ?? draftPacket;
        if (!prompt) await db.insert(qualityPrompts).values({ taskId: record.task.id, contractId: contract?.id ?? null, templateVersion: "proof-prompt-v1", promptDigest, promptText: packet, twinJson: JSON.stringify(twin) });
        await recordEvent(record.task.id, "local", "quality_prompt_bound", "Bound a versioned proof-carrying prompt to the operator-confirmed dispatch.", { promptDigest, contractId: contract?.id ?? null, reused: Boolean(prompt) });
        const session = await createJulesSession(julesSecret, { prompt: packet, title: record.task.title, sourceName: source.sourceName, branch: record.initiative.branch, requirePlanApproval: input.requirePlanApproval, autoCreatePr: input.autoCreatePr });
        sessionCreated = true;
        await db.update(tasks).set({ state: "dispatched", health: "healthy", requirePlanApproval: input.requirePlanApproval ? 1 : 0, autoCreatePr: input.autoCreatePr ? 1 : 0, julesSessionName: session.name, julesSessionId: session.id, julesSessionUrl: session.url, julesState: session.state ?? "QUEUED", lastPolledAt: new Date() }).where(eq(tasks.id, record.task.id));
        await recordEvent(record.task.id, "local", "dispatched", "Validated source and branch, then created a Jules session.", { source: source.sourceName, sessionName: session.name, autoCreatePr: input.autoCreatePr });
        await finishAttempt(attempt.attempt.id, "success", started, { sessionName: session.name });
        return { reused: false, sessionName: session.name, sessionUrl: session.url };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Dispatch failed";
        const releaseReservation = reservationGranted && !sessionCreated;
        await db.update(tasks).set({ health: "attention", lastError: message.slice(0, 500), ...(releaseReservation ? { state: "ready" as const, reservationConflict: null, blockedReason: null } : {}) }).where(eq(tasks.id, record.task.id));
        if (releaseReservation) await recordEvent(record.task.id, "local", "reservation_released", "Released path reservation because dispatch failed before a Jules session was created.", { message });
        await recordEvent(record.task.id, "local", "dispatch_failed", message, { message });
        await finishAttempt(attempt.attempt.id, "failure", started, { message }, "validation or provider request failed");
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),
  }),
  plans: router({
    action: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), action: z.enum(["approved", "rejected", "corrective_message"]), message: z.string().max(3000).optional() })).mutation(async ({ ctx, input }) => {
      const user = userId(ctx);
      const record = await getTaskForUser(user, input.taskId);
      if (!record?.task.julesSessionName) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Dispatch the task before reviewing a plan." });
      const db = requireDb(await getDb());
      const key = `${input.action}:${record.task.id}:${digestPayload(input.message ?? "")}`;
      const attempt = await createAttempt(record.task.id, input.action === "approved" ? "approval" : "message", key);
      if (!attempt.reused) {
        const started = Date.now();
        const secret = await requireReadySecret(user, "jules");
        if (input.action === "approved") await approveJulesPlan(secret, record.task.julesSessionName);
        if (input.action === "corrective_message") await messageJulesSession(secret, record.task.julesSessionName, input.message || "Please clarify your plan before continuing.");
        if (input.action === "rejected") await messageJulesSession(secret, record.task.julesSessionName, `Plan rejected by reviewer.${input.message ? ` Feedback: ${input.message}` : ""} Do not proceed until clarified.`);
        await finishAttempt(attempt.attempt.id, "success", started, { action: input.action });
      }
      await db.insert(taskApprovals).values({ taskId: record.task.id, userId: user, action: input.action, message: input.message ?? null });
      await db.update(tasks).set({ health: input.action === "rejected" ? "attention" : "healthy", state: input.action === "approved" ? "executing" : "plan_gate" }).where(eq(tasks.id, record.task.id));
      await recordEvent(record.task.id, "local", `plan_${input.action}`, input.action === "approved" ? "Plan approved and execution released." : input.action === "rejected" ? "Plan rejection and reviewer feedback sent to Jules." : "Corrective message sent to Jules.", { message: input.message ?? null });
      return { success: true };
    }),
  }),
  quality: router({
    generateContract: protectedProcedure.input(z.object({ initiativeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb()); const user = userId(ctx);
      const initiative = await getInitiativeForUser(user, input.initiativeId);
      if (!initiative) throw new TRPCError({ code: "NOT_FOUND" });
      const secret = await requireReadySecret(user, "gemini");
      const { contract, critic } = await generateQualityContract(secret, initiative);
      const prior = (await db.select().from(qualityContracts).where(eq(qualityContracts.initiativeId, initiative.id)).orderBy(desc(qualityContracts.createdAt)).limit(1))[0];
      const decision = critic.recommendation === "human_review_required" ? "human_review" as const : critic.recommendation === "revise_before_dispatch" ? "revise" as const : "draft" as const;
      const result = await db.insert(qualityContracts).values({ initiativeId: initiative.id, version: (prior?.version ?? 0) + 1, outcome: contract.outcome, contractJson: JSON.stringify(contract), criticJson: JSON.stringify(critic), ambiguityScore: critic.ambiguityScore, decision });
      const contractId = Number(result[0].insertId);
      const initiativeTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.initiativeId, initiative.id));
      await Promise.all(initiativeTasks.map(task => recordEvent(task.id, "gemini", "quality_contract_generated", "Generated a bounded delivery contract and independent critique for operator review.", { contractId, version: (prior?.version ?? 0) + 1, ambiguityScore: critic.ambiguityScore, recommendation: critic.recommendation })));
      return { id: contractId, version: (prior?.version ?? 0) + 1, decision, contract, critic };
    }),
    decideContract: protectedProcedure.input(z.object({ initiativeId: z.number().int().positive(), contractId: z.number().int().positive(), decision: z.enum(["approved", "revise", "human_review"]) })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb()); const initiative = await getInitiativeForUser(userId(ctx), input.initiativeId);
      if (!initiative) throw new TRPCError({ code: "NOT_FOUND" });
      const contract = (await db.select().from(qualityContracts).where(and(eq(qualityContracts.id, input.contractId), eq(qualityContracts.initiativeId, initiative.id))).limit(1))[0];
      if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Quality contract not found for this initiative." });
      await db.update(qualityContracts).set({ decision: input.decision }).where(eq(qualityContracts.id, contract.id));
      const initiativeTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.initiativeId, initiative.id));
      await Promise.all(initiativeTasks.map(task => recordEvent(task.id, "local", "quality_contract_decision", `Operator marked quality contract v${contract.version} as ${input.decision}.`, { contractId: contract.id, decision: input.decision })));
      return { success: true };
    }),
    compilePrompt: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb()); const record = await getTaskForUser(userId(ctx), input.taskId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      const contract = (await db.select().from(qualityContracts).where(eq(qualityContracts.initiativeId, record.initiative.id)).orderBy(desc(qualityContracts.createdAt)).limit(1))[0];
      const criteria = parseList(record.task.acceptanceCriteria) as Array<{ id: string; text: string }>;
      const promptText = buildProofCarryingPrompt({ title: record.task.title, description: record.task.description, allowedPaths: parseList(record.task.allowedPaths), nonGoals: parseList(record.task.nonGoals), acceptanceCriteria: criteria });
      const twin = { taskKey: record.task.taskKey, contractId: contract?.id ?? null, contractDecision: contract?.decision ?? "absent", allowedPaths: parseList(record.task.allowedPaths), nonGoals: parseList(record.task.nonGoals), criteria, createdForOperatorConfirmedDispatch: true };
      const promptDigest = digestPayload({ promptText, twin });
      const existing = (await db.select().from(qualityPrompts).where(eq(qualityPrompts.promptDigest, promptDigest)).limit(1))[0];
      if (existing) return { ...existing, reused: true };
      const result = await db.insert(qualityPrompts).values({ taskId: record.task.id, contractId: contract?.id ?? null, templateVersion: "proof-prompt-v1", promptDigest, promptText, twinJson: JSON.stringify(twin) });
      const prompt = { id: Number(result[0].insertId), taskId: record.task.id, promptDigest, promptText, templateVersion: "proof-prompt-v1", contractId: contract?.id ?? null, twinJson: JSON.stringify(twin), reused: false };
      await recordEvent(record.task.id, "local", "quality_prompt_compiled", "Compiled a versioned proof-carrying prompt for operator-confirmed dispatch.", { promptDigest, contractId: contract?.id ?? null });
      return prompt;
    }),
    runVerification: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb()); const user = userId(ctx); const record = await getTaskForUser(user, input.taskId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (!isQualityVerificationEligible({ julesState: record.task.julesState, taskState: record.task.state })) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Quality verification is available only after a terminal Jules session." });
      const timeline = await getTaskTimeline(record.task.id); const criteria = parseList(record.task.acceptanceCriteria) as Array<{ id: string; text: string }>;
      const proofMap = buildDeterministicProofMap({ criteria, evidence: timeline.evidence });
      const deterministicPassed = !proofMap.some(item => item.status === "contradicted");
      const verificationKey = `quality-verification:${record.task.id}:${digestPayload({ proofMap, session: record.task.julesState })}`;
      const attempt = await createAttempt(record.task.id, "verification", verificationKey);
      if (attempt.reused) { const prior = (await db.select().from(qualityVerifications).where(eq(qualityVerifications.taskId, record.task.id)).orderBy(desc(qualityVerifications.createdAt)).limit(1))[0]; if (prior) return { ...prior, reused: true }; }
      const started = Date.now(); let adversarial: unknown = null; let providerFailed = false;
      try { const secret = await requireReadySecret(user, "gemini"); adversarial = await runAdversarialQualityReview(secret, { taskTitle: record.task.title, taskDescription: record.task.description, criteria: proofMap.map(item => ({ id: item.id, text: item.text, deterministicStatus: item.status })), evidence: timeline.evidence.map(item => ({ criterionId: item.criterionId, status: item.status, label: item.label, reference: item.reference, detail: item.detail })) }); }
      catch (error) { providerFailed = true; adversarial = { materialFinding: false, summary: error instanceof Error ? error.message.slice(0, 500) : "Gemini review unavailable", criterionFindings: [], operatorQuestions: ["Re-run the bounded adversarial review after the Gemini credential or service is available."] }; }
      const adversarialMaterialFinding = Boolean((adversarial as { materialFinding?: boolean }).materialFinding);
      const verdict = deriveQualityVerdict({ providerFailed, deterministicPassed, criteria: proofMap, adversarialMaterialFinding });
      const summary = providerFailed ? "Deterministic proof map completed; bounded Gemini review was unavailable." : `Deterministic proof map completed with ${verdict.replaceAll("_", " ")} verdict.`;
      const result = await db.insert(qualityVerifications).values({ taskId: record.task.id, verdict, deterministicJson: JSON.stringify({ deterministicPassed, proofMap }), evidenceJson: JSON.stringify(timeline.evidence), adversarialJson: JSON.stringify(adversarial), summary });
      await recordEvent(record.task.id, "local", "quality_verification_completed", summary, { verificationId: Number(result[0].insertId), verdict, deterministicPassed, providerFailed });
      await finishAttempt(attempt.attempt.id, providerFailed ? "failure" : "success", started, { verdict, deterministicPassed, providerFailed }, providerFailed ? "bounded Gemini review unavailable" : undefined);
      return { id: Number(result[0].insertId), verdict, deterministic: { deterministicPassed, proofMap }, adversarial, reused: false };
    }),
    runRecovery: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb()); const user = userId(ctx); const record = await getTaskForUser(user, input.taskId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      const verification = (await db.select().from(qualityVerifications).where(eq(qualityVerifications.taskId, record.task.id)).orderBy(desc(qualityVerifications.createdAt)).limit(1))[0];
      const contract = (await db.select().from(qualityContracts).where(eq(qualityContracts.initiativeId, record.initiative.id)).orderBy(desc(qualityContracts.createdAt)).limit(1))[0];
      const deterministic = verification ? parseList(verification.deterministicJson) as { deterministicPassed?: boolean } : {};
      const recovery = classifyRecovery({ providerFailed: verification?.verdict === "provider_failed", deterministicPassed: deterministic.deterministicPassed ?? false, outOfScope: requiresScopeReview(parseList(record.task.allowedPaths)), ambiguityScore: contract?.ambiguityScore, failureText: record.task.lastError ?? verification?.summary ?? "" });
      let advisor: unknown = null;
      try { const secret = await requireReadySecret(user, "gemini"); advisor = await analyzeQualityRecovery(secret, { taskTitle: record.task.title, failureDomain: recovery.domain, deterministicRecommendation: recovery.recommendation, failureText: record.task.lastError ?? verification?.summary, deterministicFacts: { verdict: verification?.verdict ?? null, deterministic, ambiguityScore: contract?.ambiguityScore ?? 0, allowedPaths: parseList(record.task.allowedPaths) } }); }
      catch (error) { advisor = { unavailable: true, message: error instanceof Error ? error.message.slice(0, 300) : "Bounded recovery adviser unavailable" }; }
      const advisorText = (advisor as { failureNarrative?: string }).failureNarrative;
      const recommendation = advisorText ? `${recovery.recommendation}\n\nBounded adviser note: ${advisorText}` : recovery.recommendation;
      const result = await db.insert(qualityRecoveries).values({ taskId: record.task.id, domain: recovery.domain, recommendation, autoRetryEligible: recovery.autoRetryEligible });
      await recordEvent(record.task.id, "local", "quality_recovery_classified", "Classified a recovery recommendation; no redispatch was created.", { recoveryId: Number(result[0].insertId), ...recovery, advisor });
      return { id: Number(result[0].insertId), ...recovery, recommendation, advisor };
    }),
    getTaskQuality: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = requireDb(await getDb()); const record = await getTaskForUser(userId(ctx), input.taskId); if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      const [contract, prompt, verification, recovery] = await Promise.all([
        db.select().from(qualityContracts).where(eq(qualityContracts.initiativeId, record.initiative.id)).orderBy(desc(qualityContracts.createdAt)).limit(1),
        db.select().from(qualityPrompts).where(eq(qualityPrompts.taskId, record.task.id)).orderBy(desc(qualityPrompts.createdAt)).limit(1),
        db.select().from(qualityVerifications).where(eq(qualityVerifications.taskId, record.task.id)).orderBy(desc(qualityVerifications.createdAt)).limit(1),
        db.select().from(qualityRecoveries).where(eq(qualityRecoveries.taskId, record.task.id)).orderBy(desc(qualityRecoveries.createdAt)).limit(1),
      ]);
      return { contract: contract[0] ?? null, prompt: prompt[0] ?? null, verification: verification[0] ?? null, recovery: recovery[0] ?? null };
    }),
    getInitiativeQuality: protectedProcedure.input(z.object({ initiativeId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = requireDb(await getDb()); const initiative = await getInitiativeForUser(userId(ctx), input.initiativeId); if (!initiative) throw new TRPCError({ code: "NOT_FOUND" });
      const initiativeTasks = await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.initiativeId, initiative.id));
      const verifications = initiativeTasks.length ? await db.select().from(qualityVerifications).where(inArray(qualityVerifications.taskId, initiativeTasks.map(task => task.id))).orderBy(desc(qualityVerifications.createdAt)) : [];
      const contract = (await db.select().from(qualityContracts).where(eq(qualityContracts.initiativeId, initiative.id)).orderBy(desc(qualityContracts.createdAt)).limit(1))[0] ?? null;
      const latest = new Map<number, typeof verifications[number]>(); for (const verification of verifications) if (!latest.has(verification.taskId)) latest.set(verification.taskId, verification);
      const taskVerdicts = initiativeTasks.map(task => ({ ...task, verification: latest.get(task.id) ?? null }));
      const values = taskVerdicts.map(task => task.verification?.verdict);
      const verdict = deriveInitiativeQualityVerdict({ taskCount: taskVerdicts.length, verdicts: values });
      return { initiative: { id: initiative.id, title: initiative.title }, verdict, contract, taskVerdicts, unverifiedTaskCount: taskVerdicts.filter(task => !task.verification).length };
    }),
  }),
  evidence: router({
    add: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), criterionId: z.string().min(1), criterionText: z.string().min(5), status: z.enum(["proven", "partial", "unproven", "contradicted"]), evidenceType: z.enum(["artifact", "bash_output", "diff", "pr", "activity", "verification"]), label: z.string().min(2), reference: z.string().max(500).optional(), detail: z.string().max(5000).optional() })).mutation(async ({ ctx, input }) => {
      const record = await getTaskForUser(userId(ctx), input.taskId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      const db = requireDb(await getDb());
      const result = await db.insert(taskEvidence).values({ ...input, reference: input.reference ?? null, detail: input.detail ?? null, digest: digestPayload({ ...input, taskId: record.task.id }) });
      await recordEvent(record.task.id, "local", "evidence_added", `Evidence added for ${input.criterionId}.`, { criterionId: input.criterionId, status: input.status });
      return { id: Number(result[0].insertId) };
    }),
    verify: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const record = await getTaskForUser(userId(ctx), input.taskId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      const db = requireDb(await getDb());
      const timeline = await getTaskTimeline(record.task.id);
      const criteria = parseList(record.task.acceptanceCriteria) as Array<{ id: string; text: string }>;
      const summary = criteria.map(criterion => {
        const linked = timeline.evidence.filter(item => item.criterionId === criterion.id);
        const states = linked.map(item => item.status);
        const status = states.includes("contradicted") ? "contradicted" : states.includes("proven") ? "proven" : states.includes("partial") ? "partial" : "unproven";
        return { ...criterion, status };
      });
      const verdict = summary.some(item => item.status === "contradicted") ? "contradicted" : summary.every(item => item.status === "proven") ? "proven" : summary.some(item => item.status === "partial") ? "partial" : "unproven";
      await db.insert(taskEvidence).values({ taskId: record.task.id, criterionId: "verification-summary", criterionText: "Deterministic evidence completeness summary", status: verdict, evidenceType: "verification", label: `Verification summary: ${verdict}`, detail: JSON.stringify(summary), digest: digestPayload(summary) });
      await recordEvent(record.task.id, "local", "verification_completed", `Verification completed with ${verdict} evidence status.`, { verdict, criteria: summary });
      return { verdict, criteria: summary };
    }),
    dossier: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const record = await getTaskForUser(userId(ctx), input.taskId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      const timeline = await getTaskTimeline(record.task.id);
      const criteria = parseList(record.task.acceptanceCriteria) as Array<{ id: string; text: string }>;
      return { filename: `jules-foundry-task-${record.task.taskKey}-dossier.md`, content: buildDossierMarkdown({ task: record.task, initiative: record.initiative, criteria, evidence: timeline.evidence, events: timeline.events }) };
    }),
  }),
});
