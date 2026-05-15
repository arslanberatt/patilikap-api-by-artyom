import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getStories,
  viewStory,
  createStory,
  deleteStory,
  getPendingStories,
  approveStory,
  rejectStory,
  getApprovedStories,
  updateStoryCaption,
  toggleStoryActive,
} from "./stories.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";
import { createStoryBody } from "./stories.schema.js";

const stories = new Hono();

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
stories.get("/", getStories);
stories.post("/:id/view", zv("param", idParam), viewStory);

// ─── SHELTER ──────────────────────────────────────────────────────────────────
stories.post("/", requireAuth, requireRole("SHELTER"), zv("json", createStoryBody), createStory);
stories.delete("/:id", requireAuth, zv("param", idParam), deleteStory);

// ─── ADMIN ────────────────────────────────────────────────────────────────────
stories.get("/pending", requireAuth, requireRole("ADMIN"), getPendingStories);
stories.get("/approved", requireAuth, requireRole("ADMIN"), getApprovedStories);
stories.post("/:id/approve", requireAuth, requireRole("ADMIN"), zv("param", idParam), approveStory);
stories.post("/:id/reject", requireAuth, requireRole("ADMIN"), zv("param", idParam), rejectStory);
stories.patch("/:id/caption", requireAuth, requireRole("ADMIN"), zv("param", idParam), updateStoryCaption);
stories.post("/:id/toggle", requireAuth, requireRole("ADMIN"), zv("param", idParam), toggleStoryActive);

export default stories;
