import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getStoreCategories,
  getStoreAttributeOptions,
  getProducts,
  getProductBySlug,
  addStockAlert,
  getProductReviews,
  addReview,
  deleteMyReview,
  createStoreOrder,
  getMyStoreOrders,
  getStoreOrderById,
  trackStoreByToken,
  cancelStoreByToken,
  requestStoreCancel,
  getAllStoreOrders,
  updateStoreOrderStatus,
  addShipment,
  approveStoreCancel,
  adminListShipments,
  adminUpdateShipment,
  adminGetAllProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminDeleteStoreOrder,
} from "./store.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";
import {
  productsListQuery,
  reviewsListQuery,
  createStoreOrderBody,
  myStoreOrdersQuery,
  adminStoreOrdersQuery,
  updateStoreOrderStatusBody,
  addShipmentBody,
  adminShipmentsQuery,
  updateShipmentBody,
  addReviewBody,
  stockAlertBody,
  adminCreateProductBody,
  adminUpdateProductBody,
} from "./store.schema.js";

const store = new Hono();

// ─── PUBLIC — KATEGORİLER ─────────────────────────────────────────────────────
store.get("/categories", getStoreCategories);
store.get("/attribute-options", getStoreAttributeOptions);

// ─── PUBLIC — ÜRÜNLER ─────────────────────────────────────────────────────────
store.get("/products", zv("query", productsListQuery), getProducts);
store.get("/products/:slug", getProductBySlug);
store.post("/products/:id/stock-alert", zv("param", idParam), zv("json", stockAlertBody), addStockAlert);
store.get("/products/:id/reviews", zv("param", idParam), zv("query", reviewsListQuery), getProductReviews);

// ─── YORUMLAR — GİRİŞ YAPMIŞ ─────────────────────────────────────────────────
store.post("/products/:id/reviews", requireAuth, zv("param", idParam), zv("json", addReviewBody), addReview);
store.delete("/reviews/:id", requireAuth, zv("param", idParam), deleteMyReview);

// ─── SİPARİŞ — PUBLIC ────────────────────────────────────────────────────────
store.post("/orders", zv("json", createStoreOrderBody), createStoreOrder);
store.get("/orders/track/:token", trackStoreByToken);
store.post("/orders/cancel/:token", cancelStoreByToken);

// ─── SİPARİŞ — GİRİŞ YAPMIŞ ─────────────────────────────────────────────────
store.get("/orders/my", requireAuth, zv("query", myStoreOrdersQuery), getMyStoreOrders);
store.get("/orders/:id", requireAuth, zv("param", idParam), getStoreOrderById);
store.post("/orders/:id/cancel-request", requireAuth, zv("param", idParam), requestStoreCancel);

// ─── ADMIN — SİPARİŞ ─────────────────────────────────────────────────────────
store.get("/admin/orders", requireAuth, requireRole("ADMIN"), zv("query", adminStoreOrdersQuery), getAllStoreOrders);
store.patch("/admin/orders/:id/status", requireAuth, requireRole("ADMIN"), zv("param", idParam), zv("json", updateStoreOrderStatusBody), updateStoreOrderStatus);
store.post("/admin/orders/:id/ship", requireAuth, requireRole("ADMIN"), zv("param", idParam), zv("json", addShipmentBody), addShipment);
store.post("/admin/orders/:id/approve-cancel", requireAuth, requireRole("ADMIN"), zv("param", idParam), approveStoreCancel);
store.delete("/admin/orders/:id", requireAuth, requireRole("ADMIN"), zv("param", idParam), adminDeleteStoreOrder);

// ─── ADMIN — KARGO ───────────────────────────────────────────────────────────
store.get("/admin/shipments", requireAuth, requireRole("ADMIN"), zv("query", adminShipmentsQuery), adminListShipments);
store.patch("/admin/shipments/:id", requireAuth, requireRole("ADMIN"), zv("param", idParam), zv("json", updateShipmentBody), adminUpdateShipment);

// ─── ADMIN — ÜRÜN ────────────────────────────────────────────────────────────
store.get("/admin/products", requireAuth, requireRole("ADMIN"), adminGetAllProducts);
store.post("/admin/products", requireAuth, requireRole("ADMIN"), zv("json", adminCreateProductBody), adminCreateProduct);
store.patch("/admin/products/:id", requireAuth, requireRole("ADMIN"), zv("param", idParam), zv("json", adminUpdateProductBody), adminUpdateProduct);
store.delete("/admin/products/:id", requireAuth, requireRole("ADMIN"), zv("param", idParam), adminDeleteProduct);

export default store;
