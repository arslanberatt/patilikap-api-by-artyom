import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  // Kullanıcı
  getUsers,
  getUserById,
  updateUserRole,
  // Sistem ayarları
  getSystemConfig,
  updateSystemConfig,
  // Kargo
  getCargoRates,
  createCargoRate,
  updateCargoRate,
  deleteCargoRate,
  // Nakit indirim
  getCashDiscounts,
  createCashDiscount,
  updateCashDiscount,
  deleteCashDiscount,
  // Kategori
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // Kupon
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  // Hero
  getHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  // Marka
  getStoreBrands,
  createStoreBrand,
  updateStoreBrand,
  deleteStoreBrand,
  // Log & Dashboard
  getActivityLogs,
  getDashboardStats,
  // Yorumlar
  adminGetReviews,
  adminApproveReview,
  adminDeleteReview,
} from "./admin.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";
import {
  usersListQuery,
  updateUserRoleBody,
  updateSystemConfigBody,
  createCargoRateBody,
  updateCargoRateBody,
  createCashDiscountBody,
  updateCashDiscountBody,
  createCategoryBody,
  updateCategoryBody,
  createCouponBody,
  updateCouponBody,
  createHeroSlideBody,
  updateHeroSlideBody,
  createStoreBrandBody,
  updateStoreBrandBody,
  activityLogsQuery,
  adminReviewsQuery,
} from "./admin.schema.js";

const admin = new Hono();

admin.use("*", requireAuth, requireRole("ADMIN"));

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
admin.get("/dashboard", getDashboardStats);

// ─── KULLANICI ────────────────────────────────────────────────────────────────
admin.get("/users", zv("query", usersListQuery), getUsers);
admin.get("/users/:id", zv("param", idParam), getUserById);
admin.patch("/users/:id/role", zv("param", idParam), zv("json", updateUserRoleBody), updateUserRole);

// ─── SİSTEM AYARLARI ──────────────────────────────────────────────────────────
admin.get("/config", getSystemConfig);
admin.patch("/config", zv("json", updateSystemConfigBody), updateSystemConfig);

// ─── KARGO FİYATLARI ──────────────────────────────────────────────────────────
admin.get("/cargo-rates", getCargoRates);
admin.post("/cargo-rates", zv("json", createCargoRateBody), createCargoRate);
admin.patch("/cargo-rates/:id", zv("param", idParam), zv("json", updateCargoRateBody), updateCargoRate);
admin.delete("/cargo-rates/:id", zv("param", idParam), deleteCargoRate);

// ─── NAKİT İNDİRİMİ ──────────────────────────────────────────────────────────
admin.get("/cash-discounts", getCashDiscounts);
admin.post("/cash-discounts", zv("json", createCashDiscountBody), createCashDiscount);
admin.patch("/cash-discounts/:id", zv("param", idParam), zv("json", updateCashDiscountBody), updateCashDiscount);
admin.delete("/cash-discounts/:id", zv("param", idParam), deleteCashDiscount);

// ─── KATEGORİLER ──────────────────────────────────────────────────────────────
admin.get("/categories", getCategories);
admin.post("/categories", zv("json", createCategoryBody), createCategory);
admin.patch("/categories/:id", zv("param", idParam), zv("json", updateCategoryBody), updateCategory);
admin.delete("/categories/:id", zv("param", idParam), deleteCategory);

// ─── KUPONLAR ─────────────────────────────────────────────────────────────────
admin.get("/coupons", getCoupons);
admin.post("/coupons", zv("json", createCouponBody), createCoupon);
admin.patch("/coupons/:id", zv("param", idParam), zv("json", updateCouponBody), updateCoupon);
admin.delete("/coupons/:id", zv("param", idParam), deleteCoupon);

// ─── HERO SLİDES ──────────────────────────────────────────────────────────────
admin.get("/hero-slides", getHeroSlides);
admin.post("/hero-slides", zv("json", createHeroSlideBody), createHeroSlide);
admin.patch("/hero-slides/:id", zv("param", idParam), zv("json", updateHeroSlideBody), updateHeroSlide);
admin.delete("/hero-slides/:id", zv("param", idParam), deleteHeroSlide);

// ─── MARKALAR ─────────────────────────────────────────────────────────────────
admin.get("/brands", getStoreBrands);
admin.post("/brands", zv("json", createStoreBrandBody), createStoreBrand);
admin.patch("/brands/:id", zv("param", idParam), zv("json", updateStoreBrandBody), updateStoreBrand);
admin.delete("/brands/:id", zv("param", idParam), deleteStoreBrand);

// ─── AKTİVİTE LOGU ───────────────────────────────────────────────────────────
admin.get("/logs", zv("query", activityLogsQuery), getActivityLogs);

// ─── ÜRÜN YORUMLARI ───────────────────────────────────────────────────────────
admin.get("/reviews", zv("query", adminReviewsQuery), adminGetReviews);
admin.patch("/reviews/:id/approve", zv("param", idParam), adminApproveReview);
admin.delete("/reviews/:id", zv("param", idParam), adminDeleteReview);

export default admin;
