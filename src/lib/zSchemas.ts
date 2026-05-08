import { z } from "zod";

export const idParam = z.object({
  id: z.string().min(1),
});

export const paginationQuery = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const UserRoleEnum = z.enum(["ADMIN", "SHELTER", "DONOR"]);
export const PaymentMethodEnum = z.enum(["EFT", "PAYTR"]);
export const PaymentStatusEnum = z.enum(["PAID", "CANCELLED", "REFUNDED"]);
