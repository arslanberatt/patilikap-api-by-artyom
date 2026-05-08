// src/lib/cron.ts
import cron from "node-cron";
import { prisma } from "./prisma.js";
import { deleteFile } from "./bunny.js";
import { sendEmail, buildOrderCancelledEmail } from "./email.js";
import { logger } from "./logger.js";

// ─── EFT SİPARİŞ EXPIRE ───────────────────────────────────────────────────────

async function expireEftOrders() {
  const now = new Date();

  // Bağış siparişleri
  const expiredOrders = await prisma.order.findMany({
    where: {
      paymentMethod: "EFT",
      paymentStatus: "WAITING_APPROVAL",
      expiresAt: { lt: now },
    },
    include: { user: true },
  });

  for (const order of expiredOrders) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "CANCELLED" },
    });

    const email = order.user?.email || order.guestEmail || "";
    const name = order.user?.name || order.guestName || "Müşteri";

    if (email) {
      await sendEmail({
        to: email,
        subject: `Siparişiniz İptal Edildi — ${order.orderNumber}`,
        html: buildOrderCancelledEmail({
          orderNumber: order.orderNumber,
          name,
          reason: "EFT ödemesi 30 gün içinde onaylanmadığı için siparişiniz otomatik iptal edildi.",
        }),
      });
    }

    await prisma.activityLog.create({
      data: {
        actorType: "SYSTEM",
        action: "ORDER_CANCELLED",
        targetType: "Order",
        targetId: order.id,
        targetName: order.orderNumber,
        message: `${order.orderNumber} numaralı EFT siparişi 30 gün içinde onaylanmadı, otomatik iptal edildi`,
      },
    });

    logger.info(`EFT sipariş expire edildi: ${order.orderNumber}`);
  }

  // Mağaza siparişleri
  const expiredStoreOrders = await prisma.storeOrder.findMany({
    where: {
      paymentMethod: "EFT",
      paymentStatus: "WAITING_APPROVAL",
      expiresAt: { lt: now },
    },
    include: { user: true },
  });

  for (const order of expiredStoreOrders) {
    await prisma.storeOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: "CANCELLED",
        orderStatus: "CANCELLED",
      },
    });

    await prisma.orderStatusLog.create({
      data: {
        orderId: order.id,
        fromStatus: "PENDING",
        toStatus: "CANCELLED",
        note: "EFT ödemesi 30 gün içinde onaylanmadı — otomatik iptal",
        changedBy: "SYSTEM",
      },
    });

    const email = order.user?.email || order.guestEmail || "";
    const name = order.user?.name || order.guestName || "Müşteri";

    if (email) {
      await sendEmail({
        to: email,
        subject: `Siparişiniz İptal Edildi — ${order.orderNumber}`,
        html: buildOrderCancelledEmail({
          orderNumber: order.orderNumber,
          name,
          reason: "EFT ödemesi 30 gün içinde onaylanmadığı için siparişiniz otomatik iptal edildi.",
        }),
      });
    }

    logger.info(`EFT mağaza siparişi expire edildi: ${order.orderNumber}`);
  }

  if (expiredOrders.length + expiredStoreOrders.length > 0) {
    logger.info(`Toplam ${expiredOrders.length + expiredStoreOrders.length} EFT siparişi iptal edildi`);
  }
}

// ─── HİKAYE TEMİZLEME ────────────────────────────────────────────────────────

async function expireStories() {
  const now = new Date();

  const expiredStories = await prisma.shelterStory.findMany({
    where: {
      status: "APPROVED",
      expiresAt: { lt: now },
    },
  });

  for (const story of expiredStories) {
    // Bunny'den sil
    await deleteFile(story.mediaUrl);

    // DB'den sil
    await prisma.shelterStory.delete({ where: { id: story.id } });

    logger.info(`Hikaye expire edildi ve silindi: ${story.id}`);
  }

  if (expiredStories.length > 0) {
    logger.info(`Toplam ${expiredStories.length} hikaye silindi`);
  }
}

// ─── CRON JOB BAŞLAT ──────────────────────────────────────────────────────────

export function startCronJobs() {
  // Her gün gece 02:00'de çalışır
  cron.schedule("0 2 * * *", async () => {
    logger.info("Cron job başladı");

    try {
      await expireEftOrders();
    } catch (error) {
      logger.error(`EFT expire hatası: ${error}`);
    }

    try {
      await expireStories();
    } catch (error) {
      logger.error(`Hikaye expire hatası: ${error}`);
    }

    logger.info("Cron job tamamlandı");
  });

  logger.info("Cron job'lar başlatıldı — her gün 02:00'de çalışır");
}