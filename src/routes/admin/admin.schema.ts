import { z } from "zod";
import { paginationQuery, UserRoleEnum } from "../../lib/zSchemas.js";

export const updateUserRoleBody = z.object({
  role: UserRoleEnum,
});

export const usersListQuery = paginationQuery.extend({
  role: UserRoleEnum.optional(),
});

export const updateSystemConfigBody = z.object({
  bankName:                   z.string().max(100).optional(),
  accountHolder:              z.string().max(100).optional(),
  iban:                       z.string().max(40).optional(),
  minimumDonationLimit:       z.number().min(0).optional(),
  freeShippingThreshold:      z.number().min(0).optional(),
  freeShipping:               z.boolean().optional(),
  allowNewShelterRegistration: z.boolean().optional(),
  allowCampaignCreation:      z.boolean().optional(),
  showCategoryEmojis:         z.boolean().optional(),
  paytxSurchargePercent:      z.number().min(0).max(100).optional(),
});

export const createCargoRateBody = z.object({
  minKg:     z.number().min(0),
  maxKg:     z.number().min(0).optional(),
  price:     z.number().min(0),
  isActive:  z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateCargoRateBody = createCargoRateBody.partial();

export const createCashDiscountBody = z.object({
  threshold: z.number().min(0),
  amount:    z.number().min(0),
  isActive:  z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateCashDiscountBody = createCashDiscountBody.partial();

export const createCategoryBody = z.object({
  name:      z.string().min(1).max(100),
  slug:      z.string().max(100).optional(),
  imageUrl:  z.string().url().optional(),
  sortOrder: z.number().int().optional(),
  parentId:  z.string().optional(),
});
export const updateCategoryBody = createCategoryBody.partial();

export const createCouponBody = z.object({
  code:            z.string().min(1).max(50).toUpperCase(),
  description:     z.string().max(300).optional(),
  type:            z.enum(["FIXED", "PERCENTAGE"]),
  value:           z.number().min(0),
  minOrderAmount:  z.number().min(0).optional(),
  maxUses:         z.number().int().min(1).optional(),
  maxUsesPerUser:  z.number().int().min(1).optional(),
  isActive:        z.boolean().optional(),
  startsAt:        z.string().optional(),
  expiresAt:       z.string().optional(),
});
export const updateCouponBody = z.object({
  description: z.string().max(300).optional(),
  isActive:    z.boolean().optional(),
  maxUses:     z.number().int().min(1).optional(),
  startsAt:    z.string().optional(),
  expiresAt:   z.string().optional(),
});

export const createHeroSlideBody = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  buttonText:  z.string().max(50).optional(),
  buttonLink:  z.string().max(200).optional(),
  imageUrl:    z.string().url(),
  sortOrder:   z.number().int().optional(),
  isActive:    z.boolean().optional(),
});
export const updateHeroSlideBody = createHeroSlideBody.partial();

export const createStoreBrandBody = z.object({
  name:      z.string().min(1).max(100),
  imageUrl:  z.string().url().optional(),
  color:     z.string().max(20).optional(),
  isActive:  z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateStoreBrandBody = createStoreBrandBody.partial();

export const activityLogsQuery = paginationQuery.extend({
  actorType:  z.string().optional(),
  targetType: z.string().optional(),
  action:     z.string().optional(),
});

export const adminReviewsQuery = paginationQuery.extend({
  isApproved: z.enum(["true", "false"]).optional(),
  productId:  z.string().optional(),
});
