import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

/**
 * Süresi dolmuş PENDING_PAYMENT siparişleri CANCELLED'a çek.
 * - PayTR: 30 dakika (token timeout)
 * - EFT: 30 gün
 *
 * Listeleme endpoint'lerinin başında fire-and-forget olarak çağrılır;
 * cron yerine lazy cleanup deseni — hata atarsa listelemeyi bozmaz.
 */
export async function cleanupExpiredOrders(): Promise<void> {
  try {
    const now = new Date();
    const where = {
      paymentStatus: "PENDING_PAYMENT" as const,
      expiresAt: { not: null, lt: now },
    };

    const [storeRes, donationRes] = await Promise.all([
      prisma.storeOrder.updateMany({
        where,
        data: { paymentStatus: "CANCELLED", orderStatus: "CANCELLED" },
      }),
      prisma.order.updateMany({
        where,
        data: { paymentStatus: "CANCELLED" },
      }),
    ]);

    const total = storeRes.count + donationRes.count;
    if (total > 0) {
      logger.info(`[cleanup] expired PENDING_PAYMENT → CANCELLED: store=${storeRes.count} donation=${donationRes.count}`);
    }
  } catch (err) {
    logger.error(`[cleanup] hata: ${(err as Error).message}`);
  }
}
