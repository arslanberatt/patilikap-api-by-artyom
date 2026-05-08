import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";

export async function getMe(c: Context) {
  const user = c.get("user") as { id: string };
  const data = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, image: true, phone: true, role: true, createdAt: true },
  });
  return c.json(data);
}

export async function completeOnboarding(c: Context) {
  const user = c.get("user") as { id: string };

  const body = await c.req.json() as { role: "DONOR" | "SHELTER" };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      role: body.role,
      onboardingCompleted: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      onboardingCompleted: true,
    },
  });

  return c.json(updated);
}

export async function updateMe(c: Context) {
  const user = c.get("user") as { id: string };
  const body = await c.req.json() as { name?: string; phone?: string; image?: string };

  const data = await prisma.user.update({
    where: { id: user.id },
    data: { name: body.name, phone: body.phone, image: body.image },
    select: { id: true, email: true, name: true, image: true, phone: true, role: true },
  });
  return c.json(data);
}

export async function getAddresses(c: Context) {
  const user = c.get("user") as { id: string };
  const addresses = await prisma.userAddress.findMany({ where: { userId: user.id } });
  return c.json(addresses);
}

export async function createAddress(c: Context) {
  const user = c.get("user") as { id: string };
  const body = await c.req.json() as {
    title: string; fullName: string; phone: string;
    city: string; district: string; address: string; zipCode?: string; isDefault?: boolean;
  };

  if (body.isDefault) {
    await prisma.userAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const address = await prisma.userAddress.create({ data: { userId: user.id, ...body } });
  return c.json(address, 201);
}

export async function updateAddress(c: Context) {
  const user = c.get("user") as { id: string };
  const id = c.req.param("id");
  const body = await c.req.json() as Partial<{ title: string; fullName: string; phone: string; city: string; district: string; address: string; zipCode: string; isDefault: boolean }>;

  const existing = await prisma.userAddress.findFirst({ where: { id, userId: user.id } });
  if (!existing) return c.json(errors.NOT_FOUND, 404);

  if (body.isDefault) {
    await prisma.userAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const address = await prisma.userAddress.update({ where: { id }, data: body });
  return c.json(address);
}

export async function deleteAddress(c: Context) {
  const user = c.get("user") as { id: string };
  const id = c.req.param("id");

  const existing = await prisma.userAddress.findFirst({ where: { id, userId: user.id } });
  if (!existing) return c.json(errors.NOT_FOUND, 404);

  await prisma.userAddress.delete({ where: { id } });
  return c.json({ success: true });
}
