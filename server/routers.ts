import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { clearLocalSession, localRuntimeStatus } from "./local-runtime";
import { createLocalBackup, listLocalBackups, pruneLocalBackups, stageLocalRestore, verifyLocalBackup } from "./local-db";
import { getLocalDiagnostics } from "./local-diagnostics";
import { getLocalSettings, localSettingsSchema, updateLocalSettings } from "./local-settings";
import { foundryRouter } from "./routers/foundry";

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearLocalSession(ctx.res);
      return { success: true } as const;
    }),
  }),
  local: router({
    status: protectedProcedure.query(() => localRuntimeStatus()),
    diagnostics: protectedProcedure.query(() => getLocalDiagnostics()),
    settings: protectedProcedure.query(() => getLocalSettings()),
    updateSettings: protectedProcedure.input(localSettingsSchema.partial()).mutation(({ input }) => updateLocalSettings(input)),
    createBackup: protectedProcedure.mutation(() => createLocalBackup()),
    listBackups: protectedProcedure.query(() => listLocalBackups()),
    verifyBackup: protectedProcedure.input(z.object({ filename: z.string().min(1).max(255) })).mutation(({ input }) => verifyLocalBackup(input.filename)),
    stageRestore: protectedProcedure.input(z.object({ filename: z.string().min(1).max(255) })).mutation(({ input }) => stageLocalRestore(input.filename)),
    pruneBackups: protectedProcedure.input(z.object({ retain: z.number().int().min(1).max(365) })).mutation(({ input }) => pruneLocalBackups(input.retain)),
  }),
  foundry: foundryRouter,
});

export type AppRouter = typeof appRouter;
