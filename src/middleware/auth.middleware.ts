import type { Context, Next } from "hono";
import { auth } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

type Role = "ADMIN" | "SHELTER" | "DONOR";

export async function requireAuth(c: Context, next: Next) {
  const cookieHeader = c.req.header("cookie");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    logger.warn(
      `[AUTH-DEBUG] requireAuth 401 path=${c.req.path} cookieHeader=${
        cookieHeader ? cookieHeader.slice(0, 200) : "MISSING"
      } sessionResult=${session === null ? "null" : typeof session}`,
    );
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", session.user);
  await next();
}

export async function optionalAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (session) c.set("user", session.user);
  await next();
}

export function requireRole(...roles: Role[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as { role: Role };
    if (!roles.includes(user.role)) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}
