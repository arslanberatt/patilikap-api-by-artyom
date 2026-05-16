import { rateLimiter } from "hono-rate-limiter";

// Genel API — 300 istek / dakika
// (admin paneli aynı anda 10+ liste/stat çağırıyor; SPA için 60 yetersiz)
export const generalLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: (c) => c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
  message: { error: "Too Many Requests" },
});

// Auth — 10 istek / dakika (brute force önlemi)
export const authLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (c) => c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
  message: { error: "Too Many Requests" },
});

// Upload — 20 istek / dakika
export const uploadLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (c) => c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
  message: { error: "Too Many Requests" },
});

// PayTR — 10 istek / dakika
export const paytrLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (c) => c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
  message: { error: "Too Many Requests" },
});