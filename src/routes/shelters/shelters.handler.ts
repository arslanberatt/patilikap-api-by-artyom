import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import { activityMessages } from "../../lib/activity.js";
import { deleteFile } from "../../lib/bunny.js";
import { generateUniqueSlug } from "../../lib/slug.js";


// ─── PUBLIC: Barınak kodu doğrulama (doğrudan barınağa gönderim için) ──────────
export async function validateShelterCode(c: Context) {
  const body = await c.req.json() as { code?: string };
  const code = body.code?.trim().toUpperCase();

  if (!code) return c.json({ valid: false, error: "Kod boş olamaz" }, 400);

  const shelter = await prisma.shelter.findUnique({
    where: { code },
    select: { id: true, name: true, city: true, district: true, status: true },
  });

  if (!shelter) {
    return c.json({ valid: false, error: "Geçersiz kod" });
  }
  if (shelter.status !== "APPROVED") {
    return c.json({ valid: false, error: "Bu kod şu anda kullanılamıyor" });
  }

  return c.json({
    valid: true,
    shelterId: shelter.id,
    name: shelter.name,
    city: shelter.city,
    district: shelter.district,
  });
}

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
        address: true,
        phone: true,
        description: true,
        authorizedPerson: true,
        facebookUrl: true,
        instagramUrl: true,
        websiteUrl: true,
        locationLink: true,
        status: true,
        code: true,
        slug: true,
        charterDocUrl: true,
        activityDocUrl: true,
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
    where: { OR: [{ id }, { slug: id }] },
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


function generateShelterCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KAP-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createShelter(c: Context) {
  const user = c.get("user") as { id: string; role: string };

  const body = await c.req.json() as {
    name: string;
    city: string;
    district?: string;
    phone?: string;
    description?: string;
    address?: string;
    authorizedPerson?: string;
    facebookUrl?: string;
    instagramUrl?: string;
    websiteUrl?: string;
    locationLink?: string;
    documentUrls?: string[];
    charterDocUrl?: string;
    activityDocUrl?: string;
  };

  const existing = await prisma.shelter.findFirst({
    where: { userId: user.id, name: body.name },
  });
  if (existing) return c.json(errors.CONFLICT, 409);

  // Generate a unique shelter code, retry once on collision
  let code = generateShelterCode();
  const codeConflict = await prisma.shelter.findUnique({ where: { code } });
  if (codeConflict) code = generateShelterCode();

  const slug = generateUniqueSlug(body.name);

  const shelter = await prisma.shelter.create({
    data: {
      userId:           user.id,
      status:           "PENDING",
      code,
      slug,
      name:             body.name,
      city:             body.city,
      district:         body.district,
      phone:            body.phone,
      description:      body.description,
      address:          body.address,
      authorizedPerson: body.authorizedPerson,
      facebookUrl:      body.facebookUrl || null,
      instagramUrl:     body.instagramUrl || null,
      websiteUrl:       body.websiteUrl   || null,
      locationLink:     body.locationLink,
      documentUrls:     body.documentUrls,
      charterDocUrl:    body.charterDocUrl || null,
      activityDocUrl:   body.activityDocUrl || null,
    },
  });

  // Kullanıcıyı SHELTER rolüne yükselt (DONOR ise)
  if (user.role !== "SHELTER" && user.role !== "ADMIN") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "SHELTER" } });
  }

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
    charterDocUrl?: string;
    activityDocUrl?: string;
  };

  // Kapak resmi değiştiyse eskisini Bunny'den sil
  if (body.coverImageUrl && shelter.coverImageUrl) {
    await deleteFile(shelter.coverImageUrl);
  }

  // Belge geçmişi: yeni belge yüklenince eskisini documentUrls arşivine taşı (silme)
  let documentUrls = body.documentUrls ?? shelter.documentUrls;
  if (body.charterDocUrl && shelter.charterDocUrl && body.charterDocUrl !== shelter.charterDocUrl) {
    documentUrls = [...documentUrls, shelter.charterDocUrl];
  }
  if (body.activityDocUrl && shelter.activityDocUrl && body.activityDocUrl !== shelter.activityDocUrl) {
    documentUrls = [...documentUrls, shelter.activityDocUrl];
  }

  const { documentUrls: _ignored, ...rest } = body;

  const updated = await prisma.shelter.update({
    where: { id },
    data: { ...rest, documentUrls },
  });

  return c.json(updated);
}

// Admin: barınak kodunu güncelle (manuel) ya da yeniden üret (body boş)
export async function updateShelterCode(c: Context) {
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({})) as { code?: string };

  const shelter = await prisma.shelter.findUnique({ where: { id } });
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  let newCode: string;
  if (body.code && body.code.trim()) {
    newCode = body.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,20}$/.test(newCode)) {
      return c.json({ error: "Kod formatı geçersiz (4-20 karakter; A-Z 0-9 ve - serbest)" }, 400);
    }
    const conflict = await prisma.shelter.findUnique({ where: { code: newCode } });
    if (conflict && conflict.id !== id) {
      return c.json({ error: "Bu kod başka bir barınakta kullanılıyor" }, 409);
    }
  } else {
    // Otomatik yeniden üret — çakışma olursa birkaç kez tekrar dene
    let attempts = 0;
    do {
      newCode = generateShelterCode();
      const conflict = await prisma.shelter.findUnique({ where: { code: newCode } });
      if (!conflict || conflict.id === id) break;
      attempts++;
    } while (attempts < 5);
    if (attempts >= 5) return c.json({ error: "Benzersiz kod üretilemedi" }, 500);
  }

  const updated = await prisma.shelter.update({
    where: { id },
    data: { code: newCode },
    select: { id: true, code: true, name: true },
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

  if (shelter.userId) {
    await prisma.user.update({ where: { id: shelter.userId }, data: { role: "SHELTER" } });
  }

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