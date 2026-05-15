import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getPaytrToken, paytrCallback, paytrRefund, paytrStatusQuery } from "./paytr.handler.js";
import { paytrIpWhitelist } from "../../middleware/paytrWhitelist.js";
import { zv } from "../../lib/zValidator.js";
import { getPaytrTokenBody, paytrRefundBody } from "./paytr.schema.js";

const paytr = new Hono();

paytr.post("/token", zv("json", getPaytrTokenBody), getPaytrToken);
// callback form-urlencoded — hash doğrulama handler'da yapılıyor, zod eklemiyoruz
paytr.post("/callback", paytrIpWhitelist, paytrCallback);
paytr.post("/refund", requireAuth, requireRole("ADMIN"), zv("json", paytrRefundBody), paytrRefund);
paytr.post("/status-query", requireAuth, requireRole("ADMIN"), paytrStatusQuery);

export default paytr;
