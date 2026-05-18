import { Hono } from "hono";
import { requireAuth, requireRole, optionalAuth } from "../../middleware/auth.middleware.js";
import {
  trackByToken,
  trackDonationByLookup,
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
  updateOrderDelivery,
  shelterConfirmDelivery,
} from "./orders.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";
import { createOrderBody, myOrdersQuery, adminOrdersQuery, updateOrderStatusBody, updateDeliveryBody, trackLookupBody } from "./orders.schema.js";

const orders = new Hono();

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
orders.get("/track/:token", trackByToken);
orders.post("/track-by-lookup", zv("json", trackLookupBody), trackDonationByLookup);
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
orders.patch("/:id/delivery", requireAuth, requireRole("ADMIN"), zv("param", idParam), zv("json", updateDeliveryBody), updateOrderDelivery);
orders.post("/:id/approve-cancel", requireAuth, requireRole("ADMIN"), zv("param", idParam), approveCancel);
orders.post("/:id/approve-eft", requireAuth, requireRole("ADMIN"), zv("param", idParam), approveDonationEft);
orders.post("/:id/reject-eft", requireAuth, requireRole("ADMIN"), zv("param", idParam), rejectDonationEft);
orders.delete("/admin/:id", requireAuth, requireRole("ADMIN"), zv("param", idParam), adminDeleteOrder);

// ─── BARINAK ───────────────────────────────────────────────────────────────────
orders.post("/:id/shelter-confirm", requireAuth, requireRole("SHELTER"), zv("param", idParam), shelterConfirmDelivery);

export default orders;
