import { z } from "zod";
import { UserRoleEnum } from "../../lib/zSchemas.js";

export const completeOnboardingBody = z.object({
  role: UserRoleEnum.extract(["DONOR", "SHELTER"]),
});

export const updateMeBody = z.object({
  name:  z.string().min(1).max(100).optional(),
  phone: z.string().min(7).max(20).optional(),
  image: z.string().url().optional(),
});

const addressBase = z.object({
  title:    z.string().min(1).max(100),
  fullName: z.string().min(1).max(100),
  phone:    z.string().min(7).max(20),
  city:     z.string().min(1).max(60),
  district: z.string().min(1).max(60),
  address:  z.string().min(5).max(300),
  zipCode:  z.string().max(10).optional(),
  isDefault: z.boolean().optional(),
});

export const createAddressBody = addressBase;
export const updateAddressBody = addressBase.partial();
