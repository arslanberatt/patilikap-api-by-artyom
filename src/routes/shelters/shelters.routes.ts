import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getShelters,
  getShelterById,
  getAdminShelters,
  createShelter,
  updateShelter,
  deactivateShelter,
  approveShelter,
  rejectShelter,
  deleteShelter,
} from "./shelters.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";
import { sheltersListQuery, adminSheltersListQuery, createShelterBody, updateShelterBody } from "./shelters.schema.js";

const shelters = new Hono();

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
shelters.get("/", zv("query", sheltersListQuery), getShelters);
shelters.get("/:id", zv("param", idParam), getShelterById);

// ─── SHELTER ──────────────────────────────────────────────────────────────────
shelters.post("/", requireAuth, requireRole("SHELTER"), zv("json", createShelterBody), createShelter);
shelters.patch("/:id", requireAuth, requireRole("SHELTER"), zv("param", idParam), zv("json", updateShelterBody), updateShelter);
shelters.post("/:id/deactivate", requireAuth, requireRole("SHELTER"), zv("param", idParam), deactivateShelter);

// ─── ADMIN ────────────────────────────────────────────────────────────────────
shelters.get("/admin/all", requireAuth, requireRole("ADMIN"), zv("query", adminSheltersListQuery), getAdminShelters);
shelters.post("/:id/approve", requireAuth, requireRole("ADMIN"), zv("param", idParam), approveShelter);
shelters.post("/:id/reject", requireAuth, requireRole("ADMIN"), zv("param", idParam), rejectShelter);
shelters.delete("/:id", requireAuth, requireRole("ADMIN"), zv("param", idParam), deleteShelter);

export default shelters;
