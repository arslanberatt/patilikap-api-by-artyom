import "dotenv/config";
import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "./lib/auth.js";
import { logger } from "./lib/logger.js";
import { startCronJobs } from "./lib/cron.js";
import { ApiError } from "./lib/errors.js";

// ─── ROUTE'LAR ────────────────────────────────────────────────────────────────
import users from "./routes/users/users.routes.js";
import orders from "./routes/orders/orders.routes.js";
import paytr from "./routes/paytr/paytr.routes.js";
import store from "./routes/store/store.routes.js";
import stories from "./routes/stories/stories.routes.js";
import shelters from "./routes/shelters/shelters.routes.js";
import campaigns from "./routes/campaigns/campaigns.routes.js";
import notifications from "./routes/notifications/notifications.routes.js";
import upload from "./routes/upload/upload.routes.js";
import admin from "./routes/admin/admin.routes.js";
import shelterPanel from "./routes/shelter-panel/shelter-panel.routes.js";
import contact from "./routes/contact/contact.routes.js";
import campaignCodes from "./routes/campaign-codes/campaign-codes.routes.js";
import { authLimiter, generalLimiter, paytrLimiter, uploadLimiter } from "./middleware/rateLimit.js";
import { secureHeaders } from "hono/secure-headers";
import { openApiDoc } from "./lib/openapi.js";


const isDev = process.env.NODE_ENV !== "production";
const app = new Hono();

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use("*", secureHeaders(), cors({
  origin: (origin) => {
    if (!origin) return origin;       // same-origin veya server-to-server
    if (isDev) return origin;         // dev'de tüm originlere izin ver
    return allowedOrigins.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  credentials: true,
  maxAge: 600, // preflight cache — 10 dakika
}));

// ─── REQUEST LOGGING ──────────────────────────────────────────────────────────

app.use("*", async (c, next) => {
  const start = Date.now();
  const { method } = c.req;
  const path = c.req.path;

  if (isDev) {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim()
      || c.req.header("x-real-ip")
      || "localhost";
    const ua = (c.req.header("user-agent") || "-").slice(0, 80);
    logger.info(`→ ${method} ${path} | IP: ${ip} | UA: ${ua}`);
  }

  await next();

  const ms = Date.now() - start;
  const status = c.res.status;

  if (status >= 500) logger.error(`← ${method} ${path} → ${status} (${ms}ms)`);
  else if (status >= 400) logger.warn(`← ${method} ${path} → ${status} (${ms}ms)`);
  else logger.info(`← ${method} ${path} → ${status} (${ms}ms)`);
});

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

app.use("/api/auth/*", authLimiter);
app.use("/api/upload/*", uploadLimiter);
app.use("/api/paytr/*", paytrLimiter);
app.use("/api/*", generalLimiter);


app.all("/api/auth/*", async (c) => {
  const method = c.req.method;
  const path   = c.req.path;
  const origin = c.req.header("origin") ?? "(no origin)";

  if (method === "POST") {
    try {
      const raw = await c.req.text();
      let body: unknown;
      try { body = JSON.parse(raw); } catch { body = raw; }
      if (body && typeof body === "object" && "password" in (body as object)) {
        body = { ...(body as object), password: "***" };
      }
      logger.info(`[AUTH] ${path} | origin=${origin} | body=${JSON.stringify(body)}`);
      const cloned = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
        body: raw,
      });
      const res = await auth.handler(cloned);
      if (res.status >= 400) {
        const txt = await res.clone().text();
        logger.warn(`[AUTH] ${res.status} ← ${path} | error=${txt}`);
      } else {
        logger.info(`[AUTH] ${res.status} ← ${path}`);
      }
      return res;
    } catch (e) {
      logger.error(`[AUTH] handler error: ${e}`);
      return auth.handler(c.req.raw);
    }
  }

  const res = await auth.handler(c.req.raw);
  logger.info(`[AUTH] ${res.status} ← ${method} ${path}`);
  return res;
});

// ─── BASE ENDPOINT'LER ────────────────────────────────────────────────────────

app.get("/", (c) => c.text("Patilikap API v1"));

app.get("/health", async (c) => {
  try {
    const { prisma } = await import("./lib/prisma.js");
    await prisma.$queryRaw`SELECT 1`;
    return c.json({
      status: "ok",
      db: "connected",
      env: process.env.NODE_ENV || "development",
      ts: new Date().toISOString(),
      uptime: process.uptime(), // sunucu kaç saniyedir ayakta
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
      }
    });
  } catch (err) {
    logger.error(`Health check DB hatası: ${err}`);
    return c.json({
      status: "degraded",
      db: "disconnected",
      env: process.env.NODE_ENV || "development",
      ts: new Date().toISOString(),
    }, 503);
  }
});


if (isDev) {
  app.get("/docs", swaggerUI({ url: "/docs/json" }));
  app.get("/docs/json", (c) => c.json(openApiDoc));
}


// ─── ROUTE'LAR ────────────────────────────────────────────────────────────────

app.route("/api/users", users);
app.route("/api/orders", orders);
app.route("/api/paytr", paytr);
app.route("/api/store", store);
app.route("/api/stories", stories);
app.route("/api/shelters", shelters);
app.route("/api/campaigns", campaigns);
app.route("/api/notifications", notifications);
app.route("/api/upload", upload);
app.route("/api/admin", admin);
app.route("/api/shelter", shelterPanel);
app.route("/api/contact", contact);
app.route("/api/campaign-codes", campaignCodes);

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────

app.onError((err, c) => {
  // 1) Zod validation error
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    }));
    logger.warn(`VALIDATION: [${c.req.method}] ${c.req.path} — ${issues.length} issue(s)`);
    return c.json({ error: "Validation failed", issues }, 400);
  }

  // 2) Hono HTTPException
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      logger.error(`HTTP ${err.status}: [${c.req.method}] ${c.req.path} — ${err.message}`);
    } else {
      logger.warn(`HTTP ${err.status}: [${c.req.method}] ${c.req.path} — ${err.message}`);
    }
    return c.json({ error: err.message || "Error" }, err.status);
  }

  // 3) Bizim ApiError
  if (err instanceof ApiError) {
    logger.warn(`API ${err.status}: [${c.req.method}] ${c.req.path} — ${err.message}`);
    return c.json({ error: err.message, code: err.code }, err.status);
  }

  // 4) Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta as any)?.target;
      logger.warn(`PRISMA P2002: [${c.req.method}] ${c.req.path} — unique on ${JSON.stringify(target)}`);
      return c.json({ error: "Conflict", field: target }, 409);
    }
    if (err.code === "P2025") {
      logger.warn(`PRISMA P2025: [${c.req.method}] ${c.req.path} — record not found`);
      return c.json({ error: "Not Found" }, 404);
    }
    logger.warn(`PRISMA ${err.code}: [${c.req.method}] ${c.req.path} — ${err.message}`);
    return c.json({ error: "Bad Request", code: err.code }, 400);
  }

  // 5) Bilinmeyen — 500
  logger.error(`UNHANDLED: [${c.req.method}] ${c.req.path} — ${err.message}`);
  if (isDev && err.stack) logger.error(err.stack);
  if (isDev) return c.json({ error: err.message, stack: err.stack }, 500);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.notFound((c) => {
  logger.warn(`404 — ${c.req.method} ${c.req.path}`);
  return c.json({ error: "Not found" }, 404);
});

// ─── SERVER ───────────────────────────────────────────────────────────────────

startCronJobs();

const port = Number(process.env.PORT) || 3001;

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.success(`Server çalışıyor → http://localhost:${info.port} [${process.env.NODE_ENV || "development"}]`);
  if (isDev) {
    logger.info(`CORS: ${allowedOrigins.join(" | ")}`);
    logger.info("Dev modu — verbose log, stack trace, tüm originlere CORS açık");
    logger.info("Rate limit: auth=10/dk | upload=20/dk | genel=120/dk");
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error(`Port ${port} kullanımda → kill $(lsof -ti:${port})`);
    process.exit(1);
  }
  throw err;
});

