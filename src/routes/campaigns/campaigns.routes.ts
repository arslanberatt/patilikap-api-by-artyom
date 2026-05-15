import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
    getCampaigns,
    getCampaignBySlug,
    shareCampaign,
    getCampaignProducts,
    createCampaign,
    updateCampaign,
    addCampaignProduct,
    updateCampaignProduct,
    removeCampaignProduct,
    deactivateCampaign,
    activateCampaign,
    featureCampaign,
    deleteCampaign,
    adminListCampaigns,
    approveCampaign,
    rejectCampaign,
} from "./campaigns.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";
import {
    campaignsListQuery,
    createCampaignBody,
    updateCampaignBody,
    addCampaignProductBody,
    updateCampaignProductBody,
    campaignProductParam,
} from "./campaigns.schema.js";

const campaigns = new Hono();

campaigns.get("/", zv("query", campaignsListQuery), getCampaigns);
campaigns.get("/:slug", getCampaignBySlug);

campaigns.post("/:id/share", zv("param", idParam), shareCampaign);
campaigns.get("/:id/products", zv("param", idParam), getCampaignProducts);

campaigns.post("/", requireAuth, requireRole("SHELTER"), zv("json", createCampaignBody), createCampaign);
campaigns.patch("/:id", requireAuth, requireRole("SHELTER"), zv("param", idParam), zv("json", updateCampaignBody), updateCampaign);
campaigns.post("/:id/products", requireAuth, requireRole("SHELTER"), zv("param", idParam), zv("json", addCampaignProductBody), addCampaignProduct);
campaigns.patch("/:id/products/:productId", requireAuth, requireRole("SHELTER"), zv("param", campaignProductParam), zv("json", updateCampaignProductBody), updateCampaignProduct);
campaigns.delete("/:id/products/:productId", requireAuth, requireRole("SHELTER"), zv("param", campaignProductParam), removeCampaignProduct);

campaigns.post("/:id/activate", requireAuth, requireRole("SHELTER", "ADMIN"), zv("param", idParam), activateCampaign);
campaigns.post("/:id/deactivate", requireAuth, requireRole("SHELTER", "ADMIN"), zv("param", idParam), deactivateCampaign);

campaigns.get("/admin/all", requireAuth, requireRole("ADMIN"), adminListCampaigns);
campaigns.post("/:id/approve", requireAuth, requireRole("ADMIN"), zv("param", idParam), approveCampaign);
campaigns.post("/:id/reject",  requireAuth, requireRole("ADMIN"), zv("param", idParam), rejectCampaign);
campaigns.post("/:id/feature", requireAuth, requireRole("ADMIN"), zv("param", idParam), featureCampaign);
campaigns.delete("/:id", requireAuth, requireRole("ADMIN"), zv("param", idParam), deleteCampaign);

export default campaigns;
