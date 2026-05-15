import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getStats,
  getShelterCampaigns,
  getDonors,
  getDonorHistory,
  getDuyurular,
  createDuyuru,
  updateDuyuru,
  deleteDuyuru,
  updateMyDocs,
  getMyShelterStories,
} from "./shelter-panel.handler.js";

const shelterPanel = new Hono();

shelterPanel.use("/*", requireAuth, requireRole("SHELTER", "ADMIN"));

shelterPanel.get("/stats",                getStats);
shelterPanel.get("/campaigns",            getShelterCampaigns);
shelterPanel.get("/donors",               getDonors);
shelterPanel.get("/donors/:id/history",   getDonorHistory);
shelterPanel.get("/announcements",        getDuyurular);
shelterPanel.post("/announcements",       createDuyuru);
shelterPanel.put("/announcements/:id",    updateDuyuru);
shelterPanel.delete("/announcements/:id", deleteDuyuru);
shelterPanel.patch("/docs",               updateMyDocs);
shelterPanel.get("/stories",              getMyShelterStories);

export default shelterPanel;
