import type { Context, Next } from "hono";

// PayTR'nin resmi IP listesi
const PAYTR_IPS = [
  "193.192.58.140",
  "193.192.58.141",
  "193.192.58.142",
  "193.192.58.143",
  "193.192.58.144",
  "193.192.58.145",
  "193.192.58.146",
  "193.192.58.147",
  "193.192.58.148",
  "193.192.58.149",
  "193.192.58.150",
  "193.192.58.151",
];

export async function paytrIpWhitelist(c: Context, next: Next) {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    c.req.header("x-real-ip") ||
    "";

  if (!PAYTR_IPS.includes(ip)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
}