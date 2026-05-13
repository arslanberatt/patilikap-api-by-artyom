import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import { activityMessages } from "../../lib/activity.js";
import { deleteFile } from "../../lib/bunny.js";


export async function getShelters(c: Context) {
  const query = c.req.query();
  const page  = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
  const skip  = (page - 1) * limit;
  const city  = query.city?.trim();

  const where: any = {
    status: "APPROVED",
    ...(city && { city: { contains: city, mode: "insensitive" } }),
  };

  const [shelters, total] = await Promise.all([
    prisma.shelter.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        city: true,
        district: true,
        coverImageUrl: true,
        description: true,
        facebookUrl: true,
        instagramUrl: true,
        twitterUrl: true,
        websiteUrl: true,
        locationLink: true,
      },
    }),
    prisma.shelter.count({ where }),
  ]);

  return c.json({
    shelters,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getAdminShelters(c: Context) {
  const query = c.req.query();
  const page   = Math.max(1, Number(query.page) || 1);
  const limit  = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip   = (page - 1) * limit;
  const status = query.status as string | undefined;
  const search = query.search?.trim();

  const where: any = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { name:  { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const [shelters, total] = await Promise.all([
    prisma.shelter.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        city: true,
        district: true,
        phone: true,
        status: true,
        coverImageUrl: true,
        documentUrls: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { campaigns: true } },
      },
    }),
    prisma.shelter.count({ where }),
  ]);

  return c.json({
    shelters,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getShelterById(c: Context) {
  const { id } = c.req.param();

  const shelter = await prisma.shelter.findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      city: true,
      district: true,
      address: true,
      phone: true,
      coverImageUrl: true,
      description: true,
      facebookUrl: true,
      instagramUrl: true,
      twitterUrl: true,
      websiteUrl: true,
      locationLink: true,
      createdAt: true,
    },
  });

  if (!shelter) return c.json(errors.NOT_FOUND, 404);
  return c.json(shelter);
}


export async function createShelter(c: Context) {
  const user = c.get("user") as { id: string; role: string };

  if (user.role !== "SHELTER") {
    return c.json(errors.FORBIDDEN, 403);
  }

  const body = await c.req.json() as {
    name: string;
    city: string;
    district: string;
    phone: string;
    description: string;
    documentUrls?: string[];
  };

  const existing = await prisma.shelter.findFirst({
    where: { userId: user.id, name: body.name },
  });
  if (existing) return c.json(errors.CONFLICT, 409);

  const shelter = await prisma.shelter.create({
    data: { userId: user.id, status: "PENDING", ...body },
  });

  await notifyAdmins({
    type: "SYSTEM",
    title: "Yeni Barınak Başvurusu",
    message: `${body.name} adlı barınak onay bekliyor`,
    link: "/admin/shelters?status=PENDING",
  });

  return c.json(shelter, 201);
}

export async function updateShelter(c: Context) {
  const user = c.get("user") as { id: string };
  const { id } = c.req.param();

  const shelter = await prisma.shelter.findFirst({ where: { id } });
  if (!shelter) return c.json(errors.NOT_FOUND, 404);

  if (shelter.userId !== user.id) {
    return c.json(errors.FORBIDDEN, 403);
  }

  const body = await c.req.json() as {
    name?: string;
    city?: string;
    district?: string;
    address?: string;
    phone?: string;
    description?: string;
    coverImageUrl?: string;
    authorizedPerson?: string;
    facebookUrl?: string;
    instagramUrl?: string;
    twitterUrl?: string;
    websiteUrl?: string;
    locationLink?: string;
    documentUrls?: string[];
  };

  // Kapak resmi değiştiyse eskisini Bunny'den sil
  if (body.coverImageUrl && shelter.coverImageUrl) {
    await deleteFile(shelter.coverImageUrl);
  }

  // Belgelerden çıkarılanları Bunny'den sil
  if (body.documentUrls && shelter.documentUrls.length > 0) {
    const removed = shelter.documentUrls.filter(
      (url) => !body.documentUrls!.includes(url)
    );
    if (removed.length > 0) {
      await Promise.all(removed.map(deleteFile));
    }
  }

  const updated = await prisma.shelter.update({
    where: { id },
    data: { ...body },
  });

  return c.json(updated);
}

export async function deactivateShelter(c: Context) {
  const user = c.get("user") as { id: string };
  const { id } = c.req.param();

  const shelter = await prisma.shelter.findFirst({ where: { id } });
  if (!shelter) return c.json(errors.NOT_FOUND, 404);

  if (shelter.userId !== user.id) {
    return c.json(errors.FORBIDDEN, 403);
  }

  if (shelter.status === "INACTIVE") {
    return c.json(errors.BAD_REQUEST, 400);
  }

  const updated = await prisma.shelter.update({
    where: { id },
    data: { status: "INACTIVE" },
  });

  await prisma.activityLog.create({
    data: {
      actorId: user.id,
      actorType: "SHELTER",
      action: "SHELTER_DEACTIVATED",
      targetType: "Shelter",
      targetId: shelter.id,
      targetName: shelter.name,
      message: activityMessages.SHELTER_DEACTIVATED(shelter.name),
    },
  });

  return c.json(updated);
}


export async function approveShelter(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const shelter = await prisma.shelter.findFirst({ where: { id } });
  if (!shelter) return c.json(errors.NOT_FOUND, 404);

  if (shelter.status === "APPROVED") {
    return c.json(errors.CONFLICT, 409);
  }

  const updated = await prisma.shelter.update({
    where: { id },
    data: { status: "APPROVED" },
  });

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "SHELTER_APPROVED",
      targetType: "Shelter",
      targetId: shelter.id,
      targetName: shelter.name,
      message: activityMessages.SHELTER_APPROVED(shelter.name),
    },
  });

  if (shelter.userId) await prisma.notification.create({
    data: {
      userId: shelter.userId,
      type: "SHELTER_APPROVED",
      title: "Barınağınız Onaylandı! 🎉",
      message: `${shelter.name} barınağınız onaylandı. Artık kampanya oluşturabilirsiniz.`,
      link: "/shelter/dashboard",
    },
  });

  return c.json(updated);
}

export async function rejectShelter(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const shelter = await prisma.shelter.findFirst({ where: { id } });
  if (!shelter) return c.json(errors.NOT_FOUND, 404);

  if (shelter.status === "REJECTED") {
    return c.json(errors.CONFLICT, 409);
  }

  const updated = await prisma.shelter.update({
    where: { id },
    data: { status: "REJECTED" },
  });

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "SHELTER_REJECTED",
      targetType: "Shelter",
      targetId: shelter.id,
      targetName: shelter.name,
      message: activityMessages.SHELTER_REJECTED(shelter.name),
    },
  });

  if (shelter.userId) await prisma.notification.create({
    data: {
      userId: shelter.userId,
      type: "SHELTER_REJECTED",
      title: "Barınak Başvurunuz Reddedildi",
      message: `${shelter.name} barınak başvurunuz reddedildi. Detaylar için admin ile iletişime geçin.`,
      link: "/shelter/dashboard",
    },
  });

  return c.json(updated);
}

export async function deleteShelter(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const shelter = await prisma.shelter.findFirst({ where: { id } });
  if (!shelter) return c.json(errors.NOT_FOUND, 404);

  // Cascade manual: Campaign → Shelter ilişkisi RESTRICT varsayılan
  // Önce kampanyalara ait alt kayıtları, sonra kampanyaları, sonra barınağı sil
  const campaigns = await prisma.campaign.findMany({
    where: { shelterId: id },
    select: { id: true },
  });
  const campaignIds = campaigns.map(c => c.id);

  if (campaignIds.length > 0) {
    await prisma.shelterStory.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.orderItem.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.campaignProduct.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  }
  await prisma.shelterStory.deleteMany({ where: { shelterId: id } });
  await prisma.shelter.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "SHELTER_DELETED",
      targetType: "Shelter",
      targetId: id,
      targetName: shelter.name,
      message: activityMessages.SHELTER_DELETED(shelter.name),
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