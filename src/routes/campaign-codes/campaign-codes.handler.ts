import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

export async function validateCampaignCode(c: Context) {
  const body = await c.req.json() as { code?: string };
  const code = body.code?.trim().toUpperCase();

  if (!code) return c.json({ valid: false, error: "Kod boş olamaz" }, 400);

  const campaignCode = await prisma.campaignCode.findUnique({
    where: { code },
    include: {
      campaign: { select: { id: true, title: true, slug: true, status: true } },
    },
  });

  if (!campaignCode || !campaignCode.isActive) {
    return c.json({ valid: false, error: "Geçersiz veya pasif kampanya kodu" });
  }

  if (campaignCode.campaign.status !== "ACTIVE") {
    return c.json({ valid: false, error: "Bu kampanya aktif değil" });
  }

  return c.json({
    valid: true,
    campaignCodeId: campaignCode.id,
    campaignId: campaignCode.campaign.id,
    campaignTitle: campaignCode.campaign.title,
    campaignSlug: campaignCode.campaign.slug,
  });
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export async function listCampaignCodes(c: Context) {
  const campaignId = c.req.query("campaignId");
  const codes = await prisma.campaignCode.findMany({
    where: campaignId ? { campaignId } : undefined,
    include: { campaign: { select: { id: true, title: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
  return c.json(codes);
}

export async function createCampaignCode(c: Context) {
  const body = await c.req.json() as { code?: string; campaignId?: string };
  const code = body.code?.trim().toUpperCase();
  const { campaignId } = body;

  if (!code || !campaignId) return c.json(errors.BAD_REQUEST, 400);

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return c.json(errors.NOT_FOUND, 404);

  const existing = await prisma.campaignCode.findUnique({ where: { code } });
  if (existing) return c.json({ error: "Bu kod zaten kullanımda" }, 409);

  const created = await prisma.campaignCode.create({
    data: { code, campaignId, isActive: true },
  });
  return c.json(created, 201);
}

export async function toggleCampaignCode(c: Context) {
  const { id } = c.req.param();
  const body = await c.req.json() as { isActive?: boolean };

  const code = await prisma.campaignCode.findUnique({ where: { id } });
  if (!code) return c.json(errors.NOT_FOUND, 404);

  const updated = await prisma.campaignCode.update({
    where: { id },
    data: { isActive: body.isActive ?? !code.isActive },
  });
  return c.json(updated);
}

export async function deleteCampaignCode(c: Context) {
  const { id } = c.req.param();
  const code = await prisma.campaignCode.findUnique({ where: { id } });
  if (!code) return c.json(errors.NOT_FOUND, 404);

  await prisma.campaignCode.delete({ where: { id } });
  return c.json({ success: true });
}
