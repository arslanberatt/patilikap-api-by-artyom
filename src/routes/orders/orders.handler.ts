import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import { activityMessages } from "../../lib/activity.js";
import { sendEmail, buildOrderConfirmationEmail, buildOrderCancelledEmail, buildShelterDonationEmail } from "../../lib/email.js";
import crypto from "crypto";

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `DO-${timestamp}${random}`;
}

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function notifyShelterOwner(order: {
  orderNumber: string;
  paymentMethod: string;
  totalAmount: unknown;
  user?: { name?: string | null } | null;
  guestName?: string | null;
  items: { campaignId: string; productName: string; quantity: unknown; unitPrice: unknown }[];
}) {
  const firstCampaignId = order.items[0]?.campaignId;
  if (!firstCampaignId) return;

  const campaign = await prisma.campaign.findUnique({
    where: { id: firstCampaignId },
    include: { shelter: { include: { user: true } } },
  });

  const shelterOwnerEmail = campaign?.shelter?.user?.email;
  if (!shelterOwnerEmail) return;

  const donorName = order.user?.name || order.guestName || "Anonim";

  await sendEmail({
    to: shelterOwnerEmail,
    subject: `Yeni Bağış Alındı — ${order.orderNumber}`,
    html: buildShelterDonationEmail({
      shelterName: campaign.shelter.name,
      donorName,
      orderNumber: order.orderNumber,
      items: order.items.map((i) => ({
        productName: i.productName,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
      })),
      totalAmount: Number(order.totalAmount),
      paymentMethod: order.paymentMethod,
    }),
  });
}

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

export async function trackByToken(c: Context) {
  const { token } = c.req.param();

  const order = await prisma.order.findFirst({
    where: { trackingToken: token },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      paymentMethod: true,
      totalAmount: true,
      guestName: true,
      guestEmail: true,
      createdAt: true,
      items: {
        select: {
          productName: true,
          productImage: true,
          quantity: true,
          unitPrice: true,
        },
      },
    },
  });

  if (!order) return c.json(errors.NOT_FOUND, 404);
  return c.json(order);
}

export async function cancelByToken(c: Context) {
  const { token } = c.req.param();

  const order = await prisma.order.findFirst({
    where: { cancelToken: token },
    include: { user: true },
  });

  if (!order) return c.json(errors.NOT_FOUND, 404);

  if (order.cancelTokenExpiresAt && order.cancelTokenExpiresAt < new Date()) {
    return c.json({ error: "Cancel token expired" }, 400);
  }

  if (order.paymentStatus !== "WAITING_APPROVAL") {
    return c.json({ error: "Cannot cancel this order. Please contact admin." }, 400);
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: "CANCELLED" },
  });

  const email = order.user?.email || order.guestEmail || "";
  const name = order.user?.name || order.guestName || "Müşteri";
  if (email) {
    await sendEmail({
      to: email,
      subject: `Siparişiniz İptal Edildi — ${order.orderNumber}`,
      html: buildOrderCancelledEmail({ orderNumber: order.orderNumber, name }),
    });
  }

  await prisma.activityLog.create({
    data: {
      actorType: "SYSTEM",
      action: "ORDER_CANCELLED",
      targetType: "Order",
      targetId: order.id,
      targetName: order.orderNumber,
      message: activityMessages.ORDER_CANCELLED(order.orderNumber),
    },
  });

  return c.json(updated);
}

// ─── SİPARİŞ OLUŞTUR ──────────────────────────────────────────────────────────

export async function createOrder(c: Context) {
  const user = c.get("user") as { id: string; name: string; email: string } | null;

  const body = await c.req.json() as {
    items: { campaignId: string; productId: string; quantity: number }[];
    paymentMethod: "EFT" | "PAYTR";
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    userIp?: string;
    receiptUrl?: string;
    campaignCodeId?: string;
  };

  if (!body.items || body.items.length === 0) return c.json(errors.BAD_REQUEST, 400);

  // Guest kullanıcılar için iletişim bilgileri zorunlu
  if (!user && (!body.name || !body.email)) {
    return c.json({ error: "Guest users must provide name and email" }, 400);
  }

  const campaignProducts = await Promise.all(
    body.items.map(async (item) => {
      const cp = await prisma.campaignProduct.findFirst({
        where: { campaignId: item.campaignId, productId: item.productId },
        include: { product: true, campaign: true },
      });
      return { cp, quantity: item.quantity };
    })
  );

  for (const { cp } of campaignProducts) {
    if (!cp) return c.json(errors.NOT_FOUND, 404);
    if (cp.campaign.status !== "ACTIVE") {
      return c.json({ error: "Campaign is not active" }, 400);
    }
  }

  const totalAmount = campaignProducts.reduce((sum, { cp, quantity }) => {
    return sum + Number(cp!.product.price) * quantity;
  }, 0);

  const orderNumber = generateOrderNumber();
  const cancelToken = generateToken();
  const trackingToken = generateToken();
  const cancelTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expiresAt = body.paymentMethod === "EFT"
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null;

  const order = await prisma.order.create({
    data: {
      orderNumber,
      userId: user?.id || null,
      guestName: user ? null : (body.name || null),
      guestEmail: user ? null : (body.email || null),
      guestPhone: user ? null : (body.phone || null),
      guestAddress: body.address || null,
      guestCity: body.city || null,
      totalAmount,
      paymentMethod: body.paymentMethod,
      receiptUrl: body.receiptUrl,
      cancelToken,
      cancelTokenExpiresAt,
      trackingToken,
      expiresAt,
      campaignCodeId: body.campaignCodeId || null,
      items: {
        create: campaignProducts.map(({ cp, quantity }) => ({
          campaignId: cp!.campaignId,
          productId: cp!.productId,
          quantity,
          productName: cp!.product.name,
          productImage: cp!.product.imageUrl,
          unitPrice: cp!.product.price,
        })),
      },
    },
    include: { items: true },
  });

  await prisma.activityLog.create({
    data: {
      actorId: user?.id,
      actorName: user?.name || body.name,
      actorType: user ? "DONOR" : "SYSTEM",
      action: "ORDER_PLACED",
      targetType: "Order",
      targetId: order.id,
      targetName: order.orderNumber,
      message: activityMessages.ORDER_PLACED(order.orderNumber),
      metadata: { guestName: body.name, guestEmail: body.email, city: body.city },
    },
  });

  const recipientEmail = user?.email || body.email;

  // EFT → sipariş onay maili + admin bildirimi
  // PayTR → mail YOK, callback'te zaten oluştu sayılır, kullanıcı ödeme sayfasında
  if (body.paymentMethod === "EFT") {
    await notifyAdmins({
      type: "PAYMENT_RECEIVED",
      title: "Yeni EFT Siparişi",
      message: `${orderNumber} numaralı yeni bir EFT bağış siparişi var`,
      link: `/admin/orders/${order.id}`,
    });

    if (recipientEmail) await sendEmail({
      to: recipientEmail,
      subject: `Siparişiniz Alındı — ${orderNumber}`,
      html: buildOrderConfirmationEmail({
        orderNumber,
        name: body.name ?? '',
        items: campaignProducts.map(({ cp, quantity }) => ({
          productName: cp!.product.name,
          quantity,
          unitPrice: Number(cp!.product.price),
        })),
        totalAmount,
        paymentMethod: body.paymentMethod,
        trackingToken,
        cancelToken,
        frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
      }),
    });
  }

  if (body.paymentMethod === "PAYTR") {
    return c.json({
      order,
      paytr: {
        orderNumber,
        email: recipientEmail,
        amount: Math.round(totalAmount * 100),
        userName: body.name,
        userPhone: body.phone,
        userAddress: body.address,
        userCity: body.city,
        userIp: body.userIp,
        basketItems: campaignProducts.map(({ cp, quantity }) => [
          cp!.product.name,
          String(Number(cp!.product.price).toFixed(2)),
          quantity,
        ]),
      },
    }, 201);
  }

  return c.json({ order }, 201);
}

// ─── GİRİŞ YAPMIŞ KULLANICI ───────────────────────────────────────────────────

export async function getMyOrders(c: Context) {
  const user = c.get("user") as { id: string };
  const query = c.req.query();
  const page  = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip  = (page - 1) * limit;

  const where = { userId: user.id };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        paymentMethod: true,
        totalAmount: true,
        cancelRequest: true,
        createdAt: true,
        items: {
          select: {
            productName: true,
            productImage: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return c.json({
    orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getOrderById(c: Context) {
  const user = c.get("user") as { id: string; role: string };
  const { id } = c.req.param();

  const order = await prisma.order.findFirst({
    where: { id },
    include: {
      items: {
        include: {
          campaign: { select: { id: true, title: true, slug: true } },
        },
      },
    },
  });
  if (!order) return c.json(errors.NOT_FOUND, 404);

  if (order.userId !== user.id && user.role !== "ADMIN") {
    return c.json(errors.FORBIDDEN, 403);
  }

  return c.json(order);
}

export async function requestCancel(c: Context) {
  const user = c.get("user") as { id: string; email: string; name: string; phone?: string };
  const { id } = c.req.param();

  const order = await prisma.order.findFirst({ where: { id } });
  if (!order) return c.json(errors.NOT_FOUND, 404);

  if (order.userId !== user.id) return c.json(errors.FORBIDDEN, 403);

  // WAITING_APPROVAL → direkt iptal
  if (order.paymentStatus === "WAITING_APPROVAL") {
    const updated = await prisma.order.update({
      where: { id },
      data: { paymentStatus: "CANCELLED" },
    });

    await sendEmail({
      to: user.email,
      subject: `Siparişiniz İptal Edildi — ${order.orderNumber}`,
      html: buildOrderCancelledEmail({ orderNumber: order.orderNumber, name: user.name }),
    });

    await prisma.activityLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorType: "DONOR",
        action: "ORDER_CANCELLED",
        targetType: "Order",
        targetId: order.id,
        targetName: order.orderNumber,
        message: activityMessages.ORDER_CANCELLED(order.orderNumber),
      },
    });

    return c.json(updated);
  }

  // PAID → admin'e iptal talebi
  if (order.paymentStatus === "PAID") {
    const phone = order.guestPhone || user.phone || "";
    const email = order.guestEmail || user.email;

    await prisma.order.update({
      where: { id },
      data: {
        cancelRequest: true,
        cancelRequestedAt: new Date(),
        isAdminRead: false,
      },
    });

    await prisma.activityLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorType: "DONOR",
        action: "ORDER_CANCEL_REQUESTED",
        targetType: "Order",
        targetId: order.id,
        targetName: order.orderNumber,
        message: `${order.orderNumber} numaralı sipariş için iptal talebi oluşturuldu`,
        metadata: {
          phone,
          email,
          paymentMethod: order.paymentMethod,
          note: order.paymentMethod === "EFT"
            ? "EFT ödemesi yapıldı — müşteriyi arayın ve manuel iade edin"
            : "PayTR ödemesi — /api/paytr/refund ile iade başlatın",
        },
      },
    });

    await notifyAdmins({
      type: "SYSTEM",
      title: "İptal Talebi",
      message: `${order.orderNumber} numaralı bağış siparişi için iptal talebi geldi`,
      link: `/admin/orders/${order.id}`,
    });

    return c.json({ message: "Cancel request submitted" });
  }

  return c.json({ error: "Cannot cancel this order" }, 400);
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export async function getAllOrders(c: Context) {
  const query = c.req.query();
  const page   = Math.max(1, Number(query.page) || 1);
  const limit  = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip   = (page - 1) * limit;

  // Filtreler
  const paymentStatus  = query.paymentStatus as string | undefined;
  const paymentMethod  = query.paymentMethod as string | undefined;
  const cancelRequest  = query.cancelRequest === "true" ? true : query.cancelRequest === "false" ? false : undefined;
  const search         = query.search?.trim();
  const dateFrom       = query.dateFrom ? new Date(query.dateFrom) : undefined;
  const dateTo         = query.dateTo   ? new Date(query.dateTo)   : undefined;

  const where: any = {
    ...(paymentStatus  && { paymentStatus }),
    ...(paymentMethod  && { paymentMethod }),
    ...(cancelRequest  !== undefined && { cancelRequest }),
    ...(dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo   && { lte: dateTo }),
      },
    },
    ...(search && {
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { guestEmail:  { contains: search, mode: "insensitive" } },
        { guestName:   { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { name:  { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        paymentMethod: true,
        totalAmount: true,
        isAdminRead: true,
        cancelRequest: true,
        cancelRequestedAt: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        guestAddress: true,
        guestCity: true,
        receiptUrl: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            campaign: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return c.json({
    orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function updateOrderStatus(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const order = await prisma.order.findFirst({
    where: { id },
    include: { items: true, user: true },
  });
  if (!order) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as { paymentStatus: "PAID" | "CANCELLED" | "REFUNDED" };

  const updated = await prisma.order.update({
    where: { id },
    data: { paymentStatus: body.paymentStatus, isAdminRead: true },
  });

  // PAID → currentStock artar + kampanya progress kontrol + barınak mail
  if (body.paymentStatus === "PAID") {
    for (const item of order.items) {
      await prisma.campaignProduct.updateMany({
        where: {
          campaignId: (item as any).campaignId,
          productId: (item as any).productId,
        },
        data: { currentStock: { increment: Number((item as any).quantity) } },
      });
    }
    await checkCampaignProgress(order.id);
    await notifyShelterOwner(order);
  }

  // CANCELLED → müşteriye mail + bildirim
  if (body.paymentStatus === "CANCELLED") {
    const email = order.user?.email || order.guestEmail || "";
    const name = order.user?.name || order.guestName || "Müşteri";
    if (email) {
      await sendEmail({
        to: email,
        subject: `Siparişiniz İptal Edildi — ${order.orderNumber}`,
        html: buildOrderCancelledEmail({
          orderNumber: order.orderNumber,
          name,
          reason: "Siparişiniz admin tarafından iptal edildi.",
        }),
      });
    }
    if (order.userId) {
      await prisma.notification.create({
        data: {
          userId: order.userId,
          type: "ORDER_STATUS",
          title: "Siparişiniz İptal Edildi",
          message: `${order.orderNumber} numaralı siparişiniz iptal edildi`,
          link: `/orders/${order.id}`,
        },
      });
    }
  }

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: body.paymentStatus === "PAID" ? "ORDER_PAID" : "ORDER_CANCELLED",
      targetType: "Order",
      targetId: order.id,
      targetName: order.orderNumber,
      message: body.paymentStatus === "PAID"
        ? activityMessages.ORDER_PAID(order.orderNumber)
        : activityMessages.ORDER_CANCELLED(order.orderNumber),
    },
  });

  return c.json(updated);
}

export async function approveCancel(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const order = await prisma.order.findFirst({
    where: { id },
    include: { user: true },
  });
  if (!order) return c.json(errors.NOT_FOUND, 404);
  if (!order.cancelRequest) return c.json(errors.BAD_REQUEST, 400);

  const updated = await prisma.order.update({
    where: { id },
    data: { paymentStatus: "CANCELLED", cancelRequest: false },
  });

  const email = order.user?.email || order.guestEmail || "";
  const name = order.user?.name || order.guestName || "Müşteri";
  if (email) {
    await sendEmail({
      to: email,
      subject: `İptal Talebiniz Onaylandı — ${order.orderNumber}`,
      html: buildOrderCancelledEmail({ orderNumber: order.orderNumber, name }),
    });
  }

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "ORDER_CANCEL_APPROVED",
      targetType: "Order",
      targetId: order.id,
      targetName: order.orderNumber,
      message: `${order.orderNumber} numaralı sipariş iptal talebi onaylandı`,
    },
  });

  if (order.userId) {
    await prisma.notification.create({
      data: {
        userId: order.userId,
        type: "ORDER_STATUS",
        title: "İptal Talebiniz Onaylandı",
        message: `${order.orderNumber} numaralı siparişinizin iptal talebi onaylandı`,
        link: `/orders/${order.id}`,
      },
    });
  }

  return c.json(updated);
}

export async function adminDeleteOrder(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const order = await prisma.order.findFirst({ where: { id } });
  if (!order) return c.json(errors.NOT_FOUND, 404);

  await prisma.orderItem.deleteMany({ where: { orderId: id } });
  await prisma.order.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "ORDER_DELETED",
      targetType: "Order",
      targetId: id,
      targetName: order.orderNumber,
      message: activityMessages.ORDER_DELETED(order.orderNumber),
    },
  });

  return c.json({ success: true });
}

// ─── KAMPANYA PROGRESS KONTROLÜ ───────────────────────────────────────────────

async function checkCampaignProgress(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;

  const campaignIds = [...new Set(order.items.map((i: any) => i.campaignId))];

  for (const campaignId of campaignIds) {
    const products = await prisma.campaignProduct.findMany({ where: { campaignId } });

    const total = products.reduce((sum, p) => sum + p.targetStock, 0);
    const collected = products.reduce((sum, p) => sum + p.currentStock, 0);
    if (total === 0) continue;

    const percent = (collected / total) * 100;
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId } });
    const shelter = await prisma.shelter.findFirst({ where: { id: campaign?.shelterId } });
    if (!shelter || !campaign) continue;

    // %50 bildirimi
    if (percent >= 50 && percent < 51 && shelter.userId) {
      await prisma.notification.create({
        data: {
          userId: shelter.userId,
          type: "CAMPAIGN_HALF",
          title: "Kampanya %50 Doldu!",
          message: `${campaign.title} kampanyanız yarısına ulaştı!`,
          link: `/campaigns/${campaign.slug}`,
        },
      });
    }

    // %100 → kampanya tamamlandı
    if (percent >= 100) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "COMPLETED" },
      });

      if (shelter.userId) await prisma.notification.create({
        data: {
          userId: shelter.userId,
          type: "CAMPAIGN_FULL",
          title: "Kampanya Tamamlandı! 🎉",
          message: `${campaign.title} kampanyanız tamamlandı!`,
          link: `/campaigns/${campaign.slug}`,
        },
      });
    }
  }
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