import { Hono } from "hono";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { getMe, updateMe, getAddresses, createAddress, updateAddress, deleteAddress, completeOnboarding } from "./users.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";
import { completeOnboardingBody, updateMeBody, createAddressBody, updateAddressBody } from "./users.schema.js";

const users = new Hono();

users.use("*", requireAuth);

users.post("/complete-onboarding", zv("json", completeOnboardingBody), completeOnboarding);

users.get("/me", getMe);
users.patch("/me", zv("json", updateMeBody), updateMe);

users.get("/me/addresses", getAddresses);
users.post("/me/addresses", zv("json", createAddressBody), createAddress);
users.patch("/me/addresses/:id", zv("param", idParam), zv("json", updateAddressBody), updateAddress);
users.delete("/me/addresses/:id", zv("param", idParam), deleteAddress);

export default users;
