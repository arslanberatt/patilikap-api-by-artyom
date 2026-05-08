import { Hono } from "hono";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from "./notifications.handler.js";
import { zv } from "../../lib/zValidator.js";
import { idParam } from "../../lib/zSchemas.js";

const notifications = new Hono();

notifications.use("*", requireAuth);

notifications.get("/", getMyNotifications);
notifications.get("/unread-count", getUnreadCount);
notifications.patch("/:id/read", zv("param", idParam), markAsRead);
notifications.patch("/read-all", markAllAsRead);
notifications.delete("/:id", zv("param", idParam), deleteNotification);
notifications.delete("/", deleteAllNotifications);

export default notifications;
