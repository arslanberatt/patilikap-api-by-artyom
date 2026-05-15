import { Hono } from "hono";
import { requireAuth, requireRole, optionalAuth } from "../../middleware/auth.middleware.js";
import {
  trackByToken,
  cancelByToken,
  createOrder,
  getMyOrders,
  getOrderById,
  requestCancel,
  getAllOrders,
  updateOrderStatus,
  approveCancel,
  adminDeleteOrder,
  approveDonationEft,
  rejectDonationEft,
  uploadDonationReceipt,
} from "./orders.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";
import { createOrderBody, myOrdersQuery, adminOrdersQuery, updateOrderStatusBody } from "./orders.schema.js";

const orders = new Hono();

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
orders.get("/track/:token", trackByToken);
orders.post("/cancel/:token", cancelByToken);
orders.post("/:orderNumber/receipt", uploadDonationReceipt);

// ─── GİRİŞ YAPMIŞ ────────────────────────────────────────────────────────────
orders.post("/", optionalAuth, zv("json", createOrderBody), createOrder);
orders.get("/my", requireAuth, zv("query", myOrdersQuery), getMyOrders);
orders.get("/:id", requireAuth, zv("param", idParam), getOrderById);
orders.post("/:id/cancel-request", requireAuth, zv("param", idParam), requestCancel);

// ─── ADMIN ────────────────────────────────────────────────────────────────────
orders.get("/admin/all", requireAuth, requireRole("ADMIN"), zv("query", adminOrdersQuery), getAllOrders);
orders.patch("/:id/status", requireAuth, requireRole("ADMIN"), zv("param", idParam), zv("json", updateOrderStatusBody), updateOrderStatus);
orders.post("/:id/approve-cancel", requireAuth, requireRole("ADMIN"), zv("param", idParam), approveCancel);
orders.post("/:id/approve-eft", requireAuth, requireRole("ADMIN"), zv("param", idParam), approveDonationEft);
orders.post("/:id/reject-eft", requireAuth, requireRole("ADMIN"), zv("param", idParam), rejectDonationEft);
orders.delete("/admin/:id", requireAuth, requireRole("ADMIN"), zv("param", idParam), adminDeleteOrder);

export default orders;
