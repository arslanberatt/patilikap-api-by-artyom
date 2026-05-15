import { z } from "zod";

export const createStoryBody = z.object({
  type:       z.enum(["IMAGE", "VIDEO"]),
  mediaUrl:   z.string().url(),
  caption:    z.string().max(500).optional(),
  campaignId: z.string().min(1),
});
