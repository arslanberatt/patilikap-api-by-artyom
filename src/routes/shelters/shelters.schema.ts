import { z } from "zod";
import { paginationQuery } from "../../lib/zSchemas.js";

export const sheltersListQuery = paginationQuery.extend({
  city: z.string().max(60).optional(),
});

export const adminSheltersListQuery = paginationQuery.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "INACTIVE"]).optional(),
  search: z.string().max(100).optional(),
});

const shelterBase = z.object({
  name:        z.string().min(2).max(100),
  city:        z.string().min(1).max(60),
  district:    z.string().min(1).max(60),
  phone:       z.string().min(7).max(20),
  description: z.string().min(10).max(2000),
  documentUrls: z.array(z.string().url()).optional(),
});

export const createShelterBody = shelterBase;

export const updateShelterBody = shelterBase.partial().extend({
  address:         z.string().max(300).optional(),
  coverImageUrl:   z.string().url().optional(),
  authorizedPerson: z.string().max(100).optional(),
  facebookUrl:     z.string().url().optional(),
  instagramUrl:    z.string().url().optional(),
  twitterUrl:      z.string().url().optional(),
  websiteUrl:      z.string().url().optional(),
  locationLink:    z.string().url().optional(),
});
