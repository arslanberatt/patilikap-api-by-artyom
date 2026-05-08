import { z } from "zod";
import { paginationQuery } from "../../lib/zSchemas.js";

export const campaignsListQuery = paginationQuery;

export const createCampaignBody = z.object({
  title:               z.string().min(3).max(200),
  story:               z.string().max(5000).optional(),
  coverImageUrl:       z.string().url().optional(),
  autoRestartWhenFull: z.boolean().optional(),
});

export const updateCampaignBody = createCampaignBody.partial();

export const addCampaignProductBody = z.object({
  productId:   z.string().min(1),
  targetStock: z.number().int().min(1),
});

export const updateCampaignProductBody = z.object({
  targetStock: z.number().int().min(1),
});

export const campaignProductParam = z.object({
  id:        z.string().min(1),
  productId: z.string().min(1),
});
