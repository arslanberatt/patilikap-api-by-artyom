import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import { activityMessages } from "../../lib/activity.js";
import { deleteFile } from "../../lib/bunny.js";

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

export async function getStories(c: Context) {
  const now = new Date();

  const stories = await prisma.shelterStory.findMany({
    where: {
      status: "APPROVED",
      isActive: true,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      mediaUrl: true,
      caption: true,
      link: true,
      viewCount: true,
      expiresAt: true,
      createdAt: true,
      shelter: {
        select: {
          id: true,
          name: true,
          coverImageUrl: true,
          city: true,
        },
      },
      campaign: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
    },
  });

  return c.json(stories);
}

export async function viewStory(c: Context) {
  const { id } = c.req.param();
  const user = c.get("user") as { id: string } | null;

  const story = await prisma.shelterStory.findFirst({ where: { id } });
  if (!story) return c.json(errors.NOT_FOUND, 404);

  // viewerKey — üye ise userId, misafir ise IP
  const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  const viewerKey = user?.id || ip;

  // Daha önce izledi mi?
  const existing = await prisma.storyView.findFirst({
    where: { storyId: id, viewerKey },
  });

  if (!existing) {
    await prisma.storyView.create({
      data: { storyId: id, userId: user?.id, viewerKey },
    });

    await prisma.shelterStory.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  }

  return c.json({ success: true });
}

// ─── SHELTER ──────────────────────────────────────────────────────────────────

export async function createStory(c: Context) {
  const user = c.get("user") as { id: string; name: string };

  const shelter = await prisma.shelter.findFirst({
    where: { userId: user.id, status: "APPROVED" },
  });
  if (!shelter) return c.json(errors.FORBIDDEN, 403);

  const body = await c.req.json() as {
    type: "IMAGE" | "VIDEO";
    mediaUrl: string;
    caption?: string;
    link?: string;
    campaignId?: string;
  };

  // 1 hafta sonra expire olur
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const story = await prisma.shelterStory.create({
    data: {
      shelterId: shelter.id,
      type: body.type,
      mediaUrl: body.mediaUrl,
      caption: body.caption,
      link: body.link,
      campaignId: body.campaignId,
      expiresAt,
      status: "PENDING",
    },
  });

  await notifyAdmins({
    type: "SYSTEM",
    title: "Onay Bekleyen Hikaye",
    message: `${shelter.name} barınağı yeni bir hikaye paylaştı, onay bekliyor`,
    link: "/admin/stories?status=PENDING",
  });

  // Admin'e bildirim — panelde onay bekliyor
  await prisma.activityLog.create({
    data: {
      actorId: user.id,
      actorName: user.name,
      actorType: "SHELTER",
      action: "STORY_CREATED",
      targetType: "ShelterStory",
      targetId: story.id,
      targetName: shelter.name,
      message: activityMessages.STORY_CREATED(shelter.name),
      metadata: { mediaUrl: body.mediaUrl, type: body.type },
    },
  });

  return c.json(story, 201);
}

export async function deleteStory(c: Context) {
  const user = c.get("user") as { id: string; role: string; name: string };
  const { id } = c.req.param();

  const story = await prisma.shelterStory.findFirst({
    where: { id },
    include: { shelter: true },
  });
  if (!story) return c.json(errors.NOT_FOUND, 404);

  // Sahip veya admin silebilir
  if (story.shelter.userId !== user.id && user.role !== "ADMIN") {
    return c.json(errors.FORBIDDEN, 403);
  }

  // Bunny'den sil
  await deleteFile(story.mediaUrl);

  await prisma.shelterStory.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      actorId: user.id,
      actorName: user.name,
      actorType: user.role === "ADMIN" ? "ADMIN" : "SHELTER",
      action: "STORY_DELETED",
      targetType: "ShelterStory",
      targetId: story.id,
      targetName: story.shelter.name,
      message: activityMessages.STORY_DELETED(story.shelter.name),
    },
  });

  return c.json({ success: true });
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export async function getPendingStories(c: Context) {
  const stories = await prisma.shelterStory.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      mediaUrl: true,
      caption: true,
      link: true,
      createdAt: true,
      shelter: {
        select: { id: true, name: true, city: true, coverImageUrl: true },
      },
      campaign: {
        select: { id: true, title: true, slug: true },
      },
    },
  });

  return c.json(stories);
}

export async function approveStory(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const story = await prisma.shelterStory.findFirst({
    where: { id },
    include: { shelter: true },
  });
  if (!story) return c.json(errors.NOT_FOUND, 404);

  if (story.status === "APPROVED") {
    return c.json(errors.CONFLICT, 409);
  }

  const updated = await prisma.shelterStory.update({
    where: { id },
    data: { status: "APPROVED", isActive: true },
  });

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "STORY_APPROVED",
      targetType: "ShelterStory",
      targetId: story.id,
      targetName: story.shelter.name,
      message: `${story.shelter.name} barınağının hikayesi onaylandı`,
    },
  });

  // Shelter'a bildirim
  await prisma.notification.create({
    data: {
      userId: story.shelter.userId,
      type: "NEW_STORY",
      title: "Hikayeniz Yayında! 🎉",
      message: "Paylaştığınız hikaye admin tarafından onaylandı ve yayına girdi.",
      link: `/shelter/dashboard`,
    },
  });

  return c.json(updated);
}

export async function rejectStory(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const story = await prisma.shelterStory.findFirst({
    where: { id },
    include: { shelter: true },
  });
  if (!story) return c.json(errors.NOT_FOUND, 404);

  // Bunny'den sil — reddedilince medya da silinir
  await deleteFile(story.mediaUrl);

  await prisma.shelterStory.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "STORY_REJECTED",
      targetType: "ShelterStory",
      targetId: story.id,
      targetName: story.shelter.name,
      message: `${story.shelter.name} barınağının hikayesi reddedildi`,
    },
  });

  // Shelter'a bildirim
  await prisma.notification.create({
    data: {
      userId: story.shelter.userId,
      type: "SYSTEM",
      title: "Hikayeniz Reddedildi",
      message: "Paylaştığınız hikaye uygun bulunmadığı için yayına alınmadı.",
      link: `/shelter/dashboard`,
    },
  });

  return c.json({ success: true });
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

async function notifyAdmins(data: {
  type: string;
  title: string;
  message: string;
  link: string;
}) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      type: data.type as any,
      title: data.title,
      message: data.message,
      link: data.link,
    })),
  });
}