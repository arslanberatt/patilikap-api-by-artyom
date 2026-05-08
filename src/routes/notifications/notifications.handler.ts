import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";

// ─── GİRİŞ YAPMIŞ KULLANICI ───────────────────────────────────────────────────

export async function getMyNotifications(c: Context) {
  const user = c.get("user") as { id: string };

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50, // son 50 bildirim
  });

  return c.json(notifications);
}

export async function getUnreadCount(c: Context) {
  const user = c.get("user") as { id: string };

  const count = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });

  return c.json({ count });
}

export async function markAsRead(c: Context) {
  const user = c.get("user") as { id: string };
  const { id } = c.req.param();

  const notification = await prisma.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!notification) return c.json(errors.NOT_FOUND, 404);

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });

  return c.json(updated);
}

export async function markAllAsRead(c: Context) {
  const user = c.get("user") as { id: string };

  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return c.json({ success: true });
}

export async function deleteNotification(c: Context) {
  const user = c.get("user") as { id: string };
  const { id } = c.req.param();

  const notification = await prisma.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!notification) return c.json(errors.NOT_FOUND, 404);

  await prisma.notification.delete({ where: { id } });

  return c.json({ success: true });
}

export async function deleteAllNotifications(c: Context) {
  const user = c.get("user") as { id: string };

  await prisma.notification.deleteMany({
    where: { userId: user.id },
  });

  return c.json({ success: true });
}