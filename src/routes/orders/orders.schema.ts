import { z } from "zod";
import { paginationQuery, PaymentMethodEnum } from "../../lib/zSchemas.js";

export const createOrderBody = z.object({
  items: z.array(z.object({
    campaignId: z.string().min(1),
    productId:  z.string().min(1),
    quantity:   z.number().int().min(1),
  })).min(1),
  paymentMethod: PaymentMethodEnum,
  name:    z.string().min(1).max(100),
  email:   z.string().email(),
  phone:   z.string().min(7).max(20),
  address: z.string().min(5).max(300),
  city:    z.string().min(1).max(60),
  userIp:  z.string().min(1),
  receiptUrl: z.string().url().optional(),
});

export const myOrdersQuery = paginationQuery;

export const adminOrdersQuery = paginationQuery.extend({
  paymentStatus: z.string().optional(),
  paymentMethod: z.string().optional(),
  cancelRequest: z.enum(["true", "false"]).optional(),
  search:        z.string().max(100).optional(),
  dateFrom:      z.string().optional(),
  dateTo:        z.string().optional(),
});

export const updateOrderStatusBody = z.object({
  paymentStatus: z.enum(["PAID", "CANCELLED", "REFUNDED"]),
});
