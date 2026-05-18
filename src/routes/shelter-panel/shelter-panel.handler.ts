import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";

type AuthUser = { id: string; role: string };

async function getShelterForUser(userId: string) {
  return prisma.shelter.findFirst({
    where: { userId },
    select: { id: true, name: true, status: true, code: true, slug: true, charterDocUrl: true, activityDocUrl: true },
  });
}

export async function getStats(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  // PENDING/REJECTED → sıfır stats + status bilgisi (404 değil)
  if (shelter.status !== "APPROVED") {
    return c.json({
      shelterStatus:   shelter.status,
      shelterCode:     shelter.code ?? null,
      shelterSlug:     shelter.slug ?? null,
      charterDocUrl:   shelter.charterDocUrl ?? null,
      activityDocUrl:  shelter.activityDocUrl ?? null,
      shelterId:       shelter.id,
      toplamBagis: 0,
      toplamHayirsever: 0,
      buAykiBagis: 0,
      aktifKampanya: 0,
      toplamUrun: 0,
    });
  }

  const campaignIdList = await prisma.campaign.findMany({
    where: { shelterId: shelter.id },
    select: { id: true },
  }).then(r => r.map(c => c.id));

  const [toplamBagis, toplamHayirsever, buAykiBagis, aktifKampanya, toplamUrun] = await Promise.all([
    prisma.order.aggregate({
      where: {
        paymentStatus: "PAID",
        items: { some: { campaignId: { in: campaignIdList } } },
      },
      _sum: { totalAmount: true },
    }),

    prisma.order.groupBy({
      by: ["userId"],
      where: {
        paymentStatus: "PAID",
        userId: { not: null },
        items: { some: { campaignId: { in: campaignIdList } } },
      },
    }).then(r => r.length),

    prisma.order.aggregate({
      where: {
        paymentStatus: "PAID",
        items: { some: { campaignId: { in: campaignIdList } } },
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { totalAmount: true },
    }),

    prisma.campaign.count({
      where: { shelterId: shelter.id, status: "ACTIVE" },
    }),

    prisma.orderItem.aggregate({
      where: {
        campaignId: { in: campaignIdList },
        order: { paymentStatus: "PAID" },
      },
      _sum: { quantity: true },
    }),
  ]);

  return c.json({
    shelterStatus:  "APPROVED",
    shelterCode:    shelter.code ?? null,
    shelterSlug:    shelter.slug ?? null,
    charterDocUrl:  shelter.charterDocUrl ?? null,
    activityDocUrl: shelter.activityDocUrl ?? null,
    shelterId:      shelter.id,
    toplamBagis:        Number(toplamBagis._sum.totalAmount ?? 0),
    toplamHayirsever,
    buAykiBagis:        Number(buAykiBagis._sum.totalAmount ?? 0),
    aktifKampanya,
    toplamUrun:         Number(toplamUrun._sum.quantity ?? 0),
  });
}

export async function getShelterCampaigns(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ campaigns: [] });

  const campaigns = await prisma.campaign.findMany({
    where: { shelterId: shelter.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      story: true,
      coverImageUrl: true,
      status: true,
      createdAt: true,
      products: {
        select: {
          targetStock: true,
          currentStock: true,
          product: { select: { id: true, name: true, imageUrl: true, price: true } },
        },
      },
    },
  });

  return c.json({ campaigns });
}

export async function getDonors(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);
  if (shelter.status !== "APPROVED") return c.json({ donors: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });

  const query  = c.req.query();
  const page   = Math.max(1, Number(query.page) || 1);
  const limit  = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const skip   = (page - 1) * limit;
  const search = query.arama?.trim();

  const campaignIds = await prisma.campaign.findMany({
    where: { shelterId: shelter.id },
    select: { id: true },
  }).then(r => r.map(c => c.id));

  const userIds = await prisma.order.findMany({
    where: {
      paymentStatus: "PAID",
      userId: { not: null },
      items: { some: { campaignId: { in: campaignIds } } },
    },
    select: { userId: true },
    distinct: ["userId"],
  }).then(r => r.map(o => o.userId as string));

  const where: any = {
    id: { in: userIds },
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);

  const enriched = await Promise.all(
    users.map(async u => {
      const agg = await prisma.order.aggregate({
        where: {
          userId: u.id,
          paymentStatus: "PAID",
          items: { some: { campaignId: { in: campaignIds } } },
        },
        _sum: { totalAmount: true },
        _max: { createdAt: true },
      });
      return {
        ...u,
        totalAmount:  Number(agg._sum.totalAmount ?? 0),
        lastDonation: agg._max.createdAt ?? null,
      };
    })
  );

  return c.json({
    donors: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getDonorHistory(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  const donorId = c.req.param("id");

  const campaignIds = await prisma.campaign.findMany({
    where: { shelterId: shelter.id },
    select: { id: true },
  }).then(r => r.map(c => c.id));

  const orders = await prisma.order.findMany({
    where: {
      userId: donorId,
      paymentStatus: "PAID",
      items: { some: { campaignId: { in: campaignIds } } },
    },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      deliveryStatus: true,
      deliveredAt: true,
      shelterConfirmedAt: true,
      createdAt: true,
      items: {
        where: { campaignId: { in: campaignIds } },
        select: {
          productName: true,
          quantity: true,
          unitPrice: true,
          campaign: { select: { id: true, title: true, shelterId: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ orders });
}

export async function getDuyurular(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  const announcements = await prisma.announcement.findMany({
    where: { shelterId: shelter.id },
    orderBy: { createdAt: "desc" },
  });
  return c.json(announcements);
}

export async function createDuyuru(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  const body = await c.req.json();
  const { title, content, isActive } = body;
  if (!title?.trim() || !content?.trim()) {
    return c.json({ error: "Başlık ve içerik zorunludur" }, 400);
  }

  const announcement = await prisma.announcement.create({
    data: {
      shelterId: shelter.id,
      title: title.trim(),
      content: content.trim(),
      isActive: isActive !== false,
    },
  });
  return c.json(announcement, 201);
}

export async function updateDuyuru(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  const id   = c.req.param("id");
  const body = await c.req.json();
  const { title, content, isActive } = body;

  const existing = await prisma.announcement.findFirst({
    where: { id, shelterId: shelter.id },
  });
  if (!existing) return c.json({ error: "Duyuru bulunamadı" }, 404);

  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(content !== undefined && { content: content.trim() }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  return c.json(updated);
}

export async function updateMyDocs(c: Context) {
  const user = c.get("user") as AuthUser;

  const shelter = await prisma.shelter.findFirst({ where: { userId: user.id } });
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  const body = await c.req.json() as { charterDocUrl?: string; activityDocUrl?: string };

  let documentUrls = shelter.documentUrls;
  if (body.charterDocUrl && shelter.charterDocUrl && body.charterDocUrl !== shelter.charterDocUrl) {
    documentUrls = [...documentUrls, shelter.charterDocUrl];
  }
  if (body.activityDocUrl && shelter.activityDocUrl && body.activityDocUrl !== shelter.activityDocUrl) {
    documentUrls = [...documentUrls, shelter.activityDocUrl];
  }

  const updated = await prisma.shelter.update({
    where: { id: shelter.id },
    data: { ...body, documentUrls },
  });

  return c.json(updated);
}

export async function getMyShelterStories(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  const stories = await prisma.shelterStory.findMany({
    where: { shelterId: shelter.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, mediaUrl: true, caption: true,
      status: true, viewCount: true, expiresAt: true, createdAt: true,
      campaign: { select: { id: true, title: true, slug: true } },
    },
  });
  return c.json(stories);
}

export async function deleteDuyuru(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  const id       = c.req.param("id");
  const existing = await prisma.announcement.findFirst({
    where: { id, shelterId: shelter.id },
  });
  if (!existing) return c.json({ error: "Duyuru bulunamadı" }, 404);

  await prisma.announcement.delete({ where: { id } });
  return c.json({ success: true });
}
