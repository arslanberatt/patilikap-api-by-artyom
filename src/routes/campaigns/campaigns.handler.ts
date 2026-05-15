import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { generateUniqueSlug } from "../../lib/slug.js";
import { errors } from "../../lib/errors.js";
import { activityMessages } from "../../lib/activity.js";

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

export async function getCampaigns(c: Context) {
  const query = c.req.query();
  const page  = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
  const skip  = (page - 1) * limit;

  const shelterId = query.shelterId?.trim() || undefined;

  // Öne çıkanları önce göster, sonra yeniler
  const where = {
    status: "ACTIVE" as const,
    ...(shelterId && { shelterId }),
  };

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        coverImageUrl: true,
        isFeatured: true,
        viewCount: true,
        shareCount: true,
        shelter: {
          select: { id: true, name: true, city: true, coverImageUrl: true },
        },
        products: {
          select: {
            targetStock: true,
            currentStock: true,
            product: { select: { name: true, imageUrl: true } },
          },
        },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return c.json({
    campaigns,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getCampaignBySlug(c: Context) {
  const { slug } = c.req.param();

  const campaign = await prisma.campaign.findFirst({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      story: true,
      coverImageUrl: true,
      isFeatured: true,
      featuredUntil: true,
      viewCount: true,
      shareCount: true,
      status: true,
      autoRestartWhenFull: true,
      createdAt: true,
      shelter: {
        select: {
          id: true,
          name: true,
          city: true,
          district: true,
          coverImageUrl: true,
          facebookUrl: true,
          instagramUrl: true,
          twitterUrl: true,
          websiteUrl: true,
        },
      },
      products: {
        select: {
          id: true,
          targetStock: true,
          currentStock: true,
          product: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              galleryImageUrls: true,
              price: true,
              description: true,
            },
          },
        },
      },
    },
  });

  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  // viewCount artır
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { viewCount: { increment: 1 } },
  });

  return c.json(campaign);
}

// ─── SHELTER ──────────────────────────────────────────────────────────────────

export async function createCampaign(c: Context) {
  const user = c.get("user") as { id: string; role: string };

  if (user.role !== "SHELTER") {
    return c.json(errors.FORBIDDEN, 403);
  }

  const shelter = await prisma.shelter.findFirst({
    where: { userId: user.id, status: "APPROVED" },
  });
  if (!shelter) return c.json(errors.FORBIDDEN, 403);

  const body = await c.req.json() as {
    title: string;
    story?: string;
    coverImageUrl?: string;
    autoRestartWhenFull?: boolean;
  };

  const existing = await prisma.campaign.findFirst({
    where: { shelterId: shelter.id, title: body.title },
  });
  if (existing) return c.json(errors.CONFLICT, 409);

  const slug = generateUniqueSlug(body.title);

  const campaign = await prisma.campaign.create({
    data: { shelterId: shelter.id, slug, ...body },
  });

  return c.json(campaign, 201);
}

export async function updateCampaign(c: Context) {
  const user = c.get("user") as { id: string; role: string };
  const { id } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  const shelter = await prisma.shelter.findFirst({
    where: { userId: user.id },
  });
  if (!shelter) return c.json(errors.FORBIDDEN, 403);

  if (campaign.shelterId !== shelter.id) {
    return c.json(errors.FORBIDDEN, 403);
  }

  const body = await c.req.json() as {
    title?: string;
    story?: string;
    coverImageUrl?: string;
    autoRestartWhenFull?: boolean;
  };

  const slug = body.title ? generateUniqueSlug(body.title) : undefined;

  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      ...body,
      ...(slug && { slug }),
    },
  });

  return c.json(updated);
}

export async function shareCampaign(c: Context) {
  const { id } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  await prisma.campaign.update({
    where: { id },
    data: { shareCount: { increment: 1 } },
  });

  return c.json({ success: true });
}

export async function deactivateCampaign(c: Context) {
  const user = c.get("user") as { id: string; role: string; name: string };
  const { id } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  const shelter = await prisma.shelter.findFirst({ where: { userId: user.id } });

  if (campaign.shelterId !== shelter?.id && user.role !== "ADMIN") {
    return c.json(errors.FORBIDDEN, 403);
  }

  if (campaign.status === "INACTIVE") {
    return c.json(errors.BAD_REQUEST, 400);
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { status: "INACTIVE" },
  });

  await prisma.activityLog.create({
    data: {
      actorId: user.id,
      actorName: user.name,
      actorType: user.role === "ADMIN" ? "ADMIN" : "SHELTER",
      action: "CAMPAIGN_DEACTIVATED",
      targetType: "Campaign",
      targetId: campaign.id,
      targetName: campaign.title ?? "",
      message: activityMessages.CAMPAIGN_DEACTIVATED(campaign.title ?? ""),
    },
  });

  return c.json(updated);
}

export async function activateCampaign(c: Context) {
  const user = c.get("user") as { id: string; role: string; name: string };
  const { id } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  const shelter = await prisma.shelter.findFirst({ where: { userId: user.id } });

  if (campaign.shelterId !== shelter?.id && user.role !== "ADMIN") {
    return c.json(errors.FORBIDDEN, 403);
  }

  if (campaign.status === "ACTIVE") {
    return c.json(errors.BAD_REQUEST, 400);
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { status: "ACTIVE" },
  });

  await prisma.activityLog.create({
    data: {
      actorId: user.id,
      actorName: user.name,
      actorType: user.role === "ADMIN" ? "ADMIN" : "SHELTER",
      action: "CAMPAIGN_ACTIVATED",
      targetType: "Campaign",
      targetId: campaign.id,
      targetName: campaign.title ?? "",
      message: activityMessages.CAMPAIGN_ACTIVATED(campaign.title ?? ""),
    },
  });

  return c.json(updated);
}

export async function featureCampaign(c: Context) {
  const user = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  const isFeatured = !campaign.isFeatured;
  const featuredUntil = isFeatured
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    : null;

  const updated = await prisma.campaign.update({
    where: { id },
    data: { isFeatured, featuredUntil },
  });

  await prisma.activityLog.create({
    data: {
      actorId: user.id,
      actorName: user.name,
      actorType: "ADMIN",
      action: isFeatured ? "CAMPAIGN_FEATURED" : "CAMPAIGN_UNFEATURED",
      targetType: "Campaign",
      targetId: campaign.id,
      targetName: campaign.title ?? "",
      message: isFeatured
        ? activityMessages.CAMPAIGN_FEATURED(campaign.title ?? "")
        : activityMessages.CAMPAIGN_UNFEATURED(campaign.title ?? ""),
    },
  });

  return c.json(updated);
}

export async function deleteCampaign(c: Context) {
  const user = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  await prisma.campaign.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      actorId: user.id,
      actorName: user.name,
      actorType: "ADMIN",
      action: "CAMPAIGN_DELETED",
      targetType: "Campaign",
      targetId: campaign.id,
      targetName: campaign.title ?? "",
      message: activityMessages.CAMPAIGN_DELETED(campaign.title ?? ""),
    },
  });

  return c.json({ success: true });
}

// ─── KAMPANYA ÜRÜNLERİ ────────────────────────────────────────────────────────

export async function getCampaignProducts(c: Context) {
  const { id } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  const products = await prisma.campaignProduct.findMany({
    where: { campaignId: id },
    select: {
      id: true,
      targetStock: true,
      currentStock: true,
      product: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          price: true,
          description: true,
          categoryId: true,
        },
      },
    },
  });

  return c.json(products);
}

export async function addCampaignProduct(c: Context) {
  const user = c.get("user") as { id: string; role: string };
  const { id } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  // Yetki kontrolü — barınağın sahibi mi?
  const shelter = await prisma.shelter.findFirst({
    where: { id: campaign.shelterId, userId: user.id },
  });
  if (!shelter && user.role !== "ADMIN") {
    return c.json(errors.FORBIDDEN, 403);
  }

  const body = await c.req.json() as { productId: string; targetStock: number };

  // Ürün bağış kataloğunda var mı?
  const product = await prisma.product.findFirst({
    where: { id: body.productId, showInDonation: true },
  });
  if (!product) return c.json(errors.NOT_FOUND, 404);

  // Zaten eklenmiş mi?
  const existing = await prisma.campaignProduct.findFirst({
    where: { campaignId: id, productId: body.productId },
  });
  if (existing) return c.json(errors.CONFLICT, 409);

  const campaignProduct = await prisma.campaignProduct.create({
    data: {
      campaignId: id,
      productId: body.productId,
      targetStock: body.targetStock,
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          price: true,
        },
      },
    },
  });

  return c.json(campaignProduct, 201);
}

export async function updateCampaignProduct(c: Context) {
  const user = c.get("user") as { id: string; role: string };
  const { id, productId } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  // Yetki kontrolü
  const shelter = await prisma.shelter.findFirst({
    where: { id: campaign.shelterId, userId: user.id },
  });
  if (!shelter && user.role !== "ADMIN") {
    return c.json(errors.FORBIDDEN, 403);
  }

  const campaignProduct = await prisma.campaignProduct.findFirst({
    where: { campaignId: id, productId },
  });
  if (!campaignProduct) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as { targetStock: number };

  const updated = await prisma.campaignProduct.update({
    where: { id: campaignProduct.id },
    data: { targetStock: body.targetStock },
  });

  return c.json(updated);
}

export async function removeCampaignProduct(c: Context) {
  const user = c.get("user") as { id: string; role: string };
  const { id, productId } = c.req.param();

  const campaign = await prisma.campaign.findFirst({ where: { id } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  const shelter = await prisma.shelter.findFirst({
    where: { id: campaign.shelterId, userId: user.id },
  });
  if (!shelter && user.role !== "ADMIN") {
    return c.json(errors.FORBIDDEN, 403);
  }

  const campaignProduct = await prisma.campaignProduct.findFirst({
    where: { campaignId: id, productId },
  });
  if (!campaignProduct) return c.json(errors.NOT_FOUND, 404);

  await prisma.campaignProduct.delete({ where: { id: campaignProduct.id } });

  return c.json({ success: true });
}

// ─── ADMIN — TÜM KAMPANYALAR ──────────────────────────────────────────────────

export async function adminListCampaigns(c: Context) {
  const query = c.req.query();
  const page  = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip  = (page - 1) * limit;
  const search     = query.search?.trim();
  const isFeatured = query.isFeatured === "true" ? true : query.isFeatured === "false" ? false : undefined;

  const where: any = {
    ...(isFeatured !== undefined && { isFeatured }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { shelter: { name: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        isFeatured: true,
        createdAt: true,
        shelter: { select: { id: true, name: true, city: true } },
        _count: { select: { items: true } },
        products: {
          select: {
            targetStock: true,
            currentStock: true,
            product: { select: { price: true } },
          },
        },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return c.json({
    campaigns,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}