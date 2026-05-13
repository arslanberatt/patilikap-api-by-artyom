import { z } from "zod";
import { paginationQuery, PaymentMethodEnum } from "../../lib/zSchemas.js";

// ─── ÜRÜN LİSTE QUERY ────────────────────────────────────────────────────────
export const productsListQuery = paginationQuery.extend({
  category:   z.string().optional(),
  categories: z.string().optional(),
  attrs:      z.string().optional(),
  brand:      z.string().optional(),
  minPrice:   z.coerce.number().min(0).optional(),
  maxPrice:   z.coerce.number().min(0).optional(),
  tag:        z.string().optional(),
  search:     z.string().max(100).optional(),
  sortBy:     z.enum(["sortOrder", "price_asc", "price_desc", "a_z", "z_a", "newest", "most_reviewed"]).optional(),
});

export const reviewsListQuery = paginationQuery;

// ─── SİPARİŞ ─────────────────────────────────────────────────────────────────
export const createStoreOrderBody = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity:  z.number().int().min(1),
  })).min(1),
  paymentMethod: PaymentMethodEnum,
  name:       z.string().min(1).max(100),
  email:      z.string().email(),
  phone:      z.string().min(7).max(20),
  address:    z.string().min(5).max(300),
  city:       z.string().min(1).max(60),
  userIp:     z.string().min(1),
  couponCode: z.string().max(50).optional(),
  receiptUrl: z.string().url().optional(),
});

export const myStoreOrdersQuery = paginationQuery;

export const adminStoreOrdersQuery = paginationQuery.extend({
  orderStatus:   z.string().optional(),
  paymentStatus: z.string().optional(),
  paymentMethod: z.string().optional(),
  cancelRequest: z.enum(["true", "false"]).optional(),
  search:        z.string().max(100).optional(),
  dateFrom:      z.string().optional(),
  dateTo:        z.string().optional(),
});

export const updateStoreOrderStatusBody = z.object({
  orderStatus: z.enum(["CONFIRMED", "PREPARING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]),
  note: z.string().max(500).optional(),
});

export const addShipmentBody = z.object({
  provider:       z.string().min(1).max(100),
  trackingNumber: z.string().min(1).max(100),
  trackingUrl:    z.string().url().optional(),
  estimatedAt:    z.string().optional(),
});

// ─── ADMIN — KARGO LİSTESİ ────────────────────────────────────────────────────
export const adminShipmentsQuery = paginationQuery.extend({
  status: z.enum(["PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED"]).optional(),
  search: z.string().max(100).optional(),
});

export const updateShipmentBody = z.object({
  provider:       z.string().min(1).max(100).optional(),
  trackingNumber: z.string().min(1).max(100).optional(),
  trackingUrl:    z.string().url().optional().nullable(),
  status:         z.enum(["PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED"]).optional(),
  estimatedAt:    z.string().optional().nullable(),
});

// ─── YORUM ───────────────────────────────────────────────────────────────────
export const addReviewBody = z.object({
  rating:  z.number().int().min(1).max(5),
  title:   z.string().max(200).optional(),
  comment: z.string().max(2000).optional(),
});

// ─── STOK UYARISI ─────────────────────────────────────────────────────────────
export const stockAlertBody = z.object({
  email: z.string().email(),
});

// ─── ÜRÜN CRUD ────────────────────────────────────────────────────────────────
const productBase = z.object({
  name:              z.string().min(1).max(200),
  slug:              z.string().min(1).max(200),
  description:       z.string().max(5000).optional(),
  imageUrl:          z.string().url().optional(),
  galleryImageUrls:  z.array(z.string().url()).optional(),
  price:             z.number().min(0),
  comparePrice:      z.number().min(0).optional(),
  stock:             z.number().int().min(0).optional(),
  trackStock:        z.boolean().optional(),
  showInStore:       z.boolean().optional(),
  showInDonation:    z.boolean().optional(),
  isActive:          z.boolean().optional(),
  isFeatured:        z.boolean().optional(),
  sortOrder:         z.number().int().optional(),
  productionDate:    z.string().optional(),
  expiryDate:        z.string().optional(),
  nutritionValues:   z.record(z.string(), z.unknown()).optional(),
  weightKg:          z.number().min(0).optional(),
  brand:             z.string().max(100).optional(),
  tags:              z.array(z.string()).optional(),
  sizes:             z.array(z.string()).optional(),
  colors:            z.array(z.string()).optional(),
  materials:         z.array(z.string()).optional(),
  categoryId:        z.string().optional(),
});

export const adminCreateProductBody = productBase.required({ name: true, slug: true, price: true });
export const adminUpdateProductBody = productBase.partial();
