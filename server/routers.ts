import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { clearLocalSession, localRuntimeStatus } from "./local-runtime";
import { createLocalBackup, verifyLocalBackup } from "./local-db";
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
    createBackup: protectedProcedure.mutation(() => createLocalBackup()),
    verifyBackup: protectedProcedure.input(z.object({ filename: z.string().min(1).max(255) })).mutation(({ input }) => verifyLocalBackup(input.filename)),
  }),
  foundry: foundryRouter,
});

export type AppRouter = typeof appRouter;
