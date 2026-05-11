import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";

type AuthUser = { id: string; role: string };

async function getShelterForUser(userId: string) {
  return prisma.shelter.findFirst({
    where: { userId, status: "APPROVED" },
    select: { id: true, name: true },
  });
}

export async function getStats(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

  const campaignIds = await prisma.campaign.findMany({
    where: { shelterId: shelter.id },
    select: { id: true },
  }).then(r => r.map(c => c.id));

  const [toplamBagis, toplamHayirsever, buAykiBagis, aktifKampanya] = await Promise.all([
    prisma.order.aggregate({
      where: {
        paymentStatus: "PAID",
        items: { some: { campaignId: { in: campaignIds } } },
      },
      _sum: { totalAmount: true },
    }),

    prisma.order.groupBy({
      by: ["userId"],
      where: {
        paymentStatus: "PAID",
        userId: { not: null },
        items: { some: { campaignId: { in: campaignIds } } },
      },
    }).then(r => r.length),

    prisma.order.aggregate({
      where: {
        paymentStatus: "PAID",
        items: { some: { campaignId: { in: campaignIds } } },
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { totalAmount: true },
    }),

    prisma.campaign.count({
      where: { shelterId: shelter.id, status: "ACTIVE" },
    }),
  ]);

  return c.json({
    toplamBagis:       Number(toplamBagis._sum.totalAmount ?? 0),
    toplamHayirsever,
    buAykiBagis:       Number(buAykiBagis._sum.totalAmount ?? 0),
    aktifKampanya,
  });
}

export async function getDonors(c: Context) {
  const user    = c.get("user") as AuthUser;
  const shelter = await getShelterForUser(user.id);
  if (!shelter) return c.json({ error: "Barınak bulunamadı" }, 404);

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
      createdAt: true,
      items: {
        where: { campaignId: { in: campaignIds } },
        select: {
          productName: true,
          quantity: true,
          unitPrice: true,
          campaign: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ orders });
}

// Duyurular — DB modeli henüz yok, stub endpoint
export async function getDuyurular(c: Context) {
  return c.json([]);
}

export async function createDuyuru(c: Context) {
  return c.json({ error: "Duyuru modeli henüz eklenmedi" }, 501);
}

export async function updateDuyuru(c: Context) {
  return c.json({ error: "Duyuru modeli henüz eklenmedi" }, 501);
}

export async function deleteDuyuru(c: Context) {
  return c.json({ error: "Duyuru modeli henüz eklenmedi" }, 501);
}
