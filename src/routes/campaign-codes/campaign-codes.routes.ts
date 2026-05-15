import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  validateCampaignCode,
  listCampaignCodes,
  createCampaignCode,
  toggleCampaignCode,
  deleteCampaignCode,
} from "./campaign-codes.handler.js";

const campaignCodes = new Hono();

// Public — validate
campaignCodes.post("/validate", validateCampaignCode);

// Admin — manage
campaignCodes.use("/admin/*", requireAuth, requireRole("ADMIN"));
campaignCodes.get("/admin", listCampaignCodes);
campaignCodes.post("/admin", createCampaignCode);
campaignCodes.patch("/admin/:id", toggleCampaignCode);
campaignCodes.delete("/admin/:id", deleteCampaignCode);

export default campaignCodes;
