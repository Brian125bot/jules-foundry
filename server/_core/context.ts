import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId } from "../db";
import { hasLocalSession, LOCAL_OPERATOR } from "../local-runtime";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  if (!hasLocalSession(opts.req)) return { req: opts.req, res: opts.res, user: null };
  const user = await getUserByOpenId(LOCAL_OPERATOR.openId);
  return { req: opts.req, res: opts.res, user: user ?? null };
}
