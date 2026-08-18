import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; headers: Array<{ name: string; value: string }> } {
  const headers: Array<{ name: string; value: string }> = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "local-operator",
    email: null,
    name: "Local operator",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    ctx: {
      user,
      req: { headers: {} } as TrpcContext["req"],
      res: { setHeader: (name: string, value: string) => headers.push({ name, value }) } as TrpcContext["res"],
    },
    headers,
  };
}

describe("auth.logout", () => {
  it("expires the local session cookie and reports success", async () => {
    const { ctx, headers } = createAuthContext();
    const result = await appRouter.createCaller(ctx).auth.logout();
    expect(result).toEqual({ success: true });
    expect(headers).toEqual([{ name: "Set-Cookie", value: expect.stringContaining(`${COOKIE_NAME}=;`) }]);
    expect(headers[0]?.value).toContain("HttpOnly");
    expect(headers[0]?.value).toContain("SameSite=Strict");
    expect(headers[0]?.value).toContain("Max-Age=0");
  });
});
