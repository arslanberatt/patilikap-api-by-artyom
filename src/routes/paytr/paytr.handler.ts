import type { Context } from "hono";
import crypto from "crypto";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import { activityMessages } from "../../lib/activity.js";
import { sendEmail, buildShelterDonationEmail } from "../../lib/email.js";

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

function getPaytrEnv() {
  const required = ["PAYTR_MERCHANT_ID", "PAYTR_MERCHANT_KEY", "PAYTR_MERCHANT_SALT", "APP_URL", "FRONTEND_URL"];
  for (const k of required) {
    if (!process.env[k]) console.error(`[paytr] ENV eksik: ${k}`);
  }

  const merchantId = process.env.PAYTR_MERCHANT_ID!;
  const merchantKey = process.env.PAYTR_MERCHANT_KEY!;
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT!;
  const testMode = process.env.PAYTR_TEST_MODE === "true" ? "1" : "0";
  const appUrl = process.env.APP_URL!;
  const frontendUrl = process.env.FRONTEND_URL!;

  return { merchantId, merchantKey, merchantSalt, testMode, appUrl, frontendUrl };
}

// ─── TOKEN ────────────────────────────────────────────────────────────────────

export async function generatePaytrToken(params: {
  orderNumber: string;
  email: string;
  amount: number; // kuruş cinsinden (TL × 100)
  userName: string;
  userPhone: string;
  userAddress: string;
  userCity: string;
  userIp: string;
  basketItems: [string, string, number][];
}): Promise<{ token?: string; error?: string }> {
  const { merchantId, merchantKey, merchantSalt, testMode, appUrl, frontendUrl } = getPaytrEnv();

  const email      = params.email      || "misafir@patilikap.com";
  const userName   = params.userName   || "Müşteri";
  const userPhone  = params.userPhone  || "05000000000";
  const userIp     = params.userIp     || "127.0.0.1";
  const userAddress = params.userAddress || "Türkiye";

  const userBasket = Buffer.from(JSON.stringify(params.basketItems)).toString("base64");
  const hashStr =
    merchantId +
    userIp +
    params.orderNumber +
    email +
    String(params.amount) +
    userBasket +
    "0" +   // no_installment
    "12" +  // max_installment
    "TL" +  // currency
    testMode;

  const paytrToken = hashStr + merchantSalt;
  const token = crypto.createHmac("sha256", merchantKey).update(paytrToken).digest("base64");

  const formParams = new URLSearchParams({
    merchant_id:          merchantId,
    user_ip:              userIp,
    merchant_oid:         params.orderNumber,
    email,
    payment_amount:       String(params.amount),
    paytr_token:          token,
    user_basket:          userBasket,
    debug_on:             process.env.NODE_ENV === "production" ? "0" : "1",
    no_installment:       "0",
    max_installment:      "12",
    user_name:            userName,
    user_address:         userAddress,
    user_phone:           userPhone,
    merchant_ok_url:      `${frontendUrl}/odeme-basarili`,
    merchant_fail_url:    `${frontendUrl}/odeme-basarisiz`,
    merchant_notify_url:  `${appUrl}/api/paytr/callback`,
    timeout_limit:        "30",
    currency:             "TL",
    test_mode:            testMode,
    lang:                 "tr",
    iframe_v2:            "1",
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[paytr] get-token request:", {
      merchant_id:         merchantId,
      merchant_oid:        params.orderNumber,
      user_ip:             userIp,
      email,
      payment_amount:      params.amount,
      user_name:           userName,
      user_phone:          userPhone,
      user_address:        userAddress,
      merchant_ok_url:     `${frontendUrl}/odeme-basarili`,
      merchant_fail_url:   `${frontendUrl}/odeme-basarisiz`,
      merchant_notify_url: `${appUrl}/api/paytr/callback`,
      test_mode:           testMode,
      basket:              params.basketItems,
    });
  }

  const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formParams.toString(),
  });

  const data = await response.json() as { status: string; token?: string; reason?: string };

  if (data.status !== "success" || !data.token) {
    console.error("[paytr] get-token reddedildi:", data, "merchant_oid:", params.orderNumber);
    return { error: data.reason || "PayTR token alınamadı" };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[paytr] get-token başarılı, merchant_oid:", params.orderNumber);
  }

  return { token: data.token };
}

export async function getPaytrToken(c: Context) {
  const body = await c.req.json() as {
    orderNumber: string;
    email: string;
    amount: number;
    userName: string;
    userPhone: string;
    userAddress: string;
    userCity: string;
    userIp: string;
    basketItems: [string, string, number][];
  };

  const result = await generatePaytrToken(body);

  if (result.error || !result.token) {
    return c.json({ error: result.error || "PayTR token alınamadı" }, 500);
  }

  return c.json({ token: result.token });
}

// ─── CALLBACK ─────────────────────────────────────────────────────────────────

export async function paytrCallback(c: Context) {
  const { merchantKey, merchantSalt } = getPaytrEnv();

  // form-urlencoded body
  const body = await c.req.parseBody() as {
    merchant_oid: string;
    status: string;
    total_amount: string;
    hash: string;
  };

  const { merchant_oid, status, total_amount, hash } = body;

  // 1. Hash doğrula
  const hashStr = merchant_oid + merchantSalt + status + total_amount;
  const expectedHash = crypto.createHmac("sha256", merchantKey).update(hashStr).digest("base64");

  if (expectedHash !== hash) {
    return c.text("INVALID_HASH", 400);
  }

  // 2. Sipariş türünü bul — prefix'e göre
  // DO → bağış siparişi, SO → mağaza siparişi
  // (Hem eski "DO-..." hem yeni "DO..." formatını destekle — PayTR tire kabul etmiyor)
  const isDonation = merchant_oid.startsWith("DO");
  const isStore = merchant_oid.startsWith("SO");

  if (isDonation) {
    await handleDonationCallback(merchant_oid, status);
  } else if (isStore) {
    await handleStoreCallback(merchant_oid, status);
  }

  // PayTR düz metin "OK" bekler
  return c.text("OK");
}

async function handleDonationCallback(orderNumber: string, status: string) {
  const order = await prisma.order.findFirst({
    where: { orderNumber },
    include: { items: true, user: true },
  });

  if (!order) return;

  // Idempotency — zaten işlendiyse tekrar işleme
  if (order.paymentStatus !== "PENDING_PAYMENT" && order.paymentStatus !== "WAITING_APPROVAL") return;

  if (status === "success") {
    // PAID yap
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        paytxMerchantOid: orderNumber,
        isAdminRead: false,
      },
    });

    // currentStock artır
    for (const item of order.items) {
      await prisma.campaignProduct.updateMany({
        where: {
          campaignId: item.campaignId,
          productId: item.productId,
        },
        data: { currentStock: { increment: Number(item.quantity) } },
      });
    }

    await checkCampaignProgress(order.items);

    // Barınak sahibine bağış bildir
    const firstCampaignId = order.items[0]?.campaignId;
    if (firstCampaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: firstCampaignId },
        include: { shelter: { include: { user: true } } },
      });
      const shelterOwnerEmail = campaign?.shelter?.user?.email;
      if (shelterOwnerEmail) {
        await sendEmail({
          to: shelterOwnerEmail,
          subject: `Yeni Bağış Alındı — ${order.orderNumber}`,
          html: buildShelterDonationEmail({
            shelterName: campaign!.shelter.name,
            donorName: order.user?.name || order.guestName || "Anonim",
            orderNumber: order.orderNumber,
            items: order.items.map((i) => ({
              productName: i.productName,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
            })),
            totalAmount: Number(order.totalAmount),
            paymentMethod: "PAYTR",
          }),
        });
      }
    }

    // ActivityLog
    await prisma.activityLog.create({
      data: {
        actorType: "SYSTEM",
        action: "ORDER_PAID",
        targetType: "Order",
        targetId: order.id,
        targetName: order.orderNumber,
        message: activityMessages.ORDER_PAID(order.orderNumber),
        metadata: { paymentMethod: "PAYTR" },
      },
    });

  } else {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "CANCELLED" },
    });
  }
}

async function handleStoreCallback(orderNumber: string, status: string) {
  const order = await prisma.storeOrder.findFirst({
    where: { orderNumber },
    include: { items: true, user: true },
  });

  if (!order) return;

  // Idempotency
  if (order.paymentStatus !== "PENDING_PAYMENT" && order.paymentStatus !== "WAITING_APPROVAL") return;

  if (status === "success") {
    await prisma.storeOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        orderStatus: "CONFIRMED",
        paytxMerchantOid: orderNumber,
        isAdminRead: false,
      },
    });

    // Stok düş
    for (const item of order.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    // StatusLog
    await prisma.orderStatusLog.create({
      data: {
        orderId: order.id,
        fromStatus: "PENDING",
        toStatus: "CONFIRMED",
        note: "PayTR ödemesi alındı",
        changedBy: "SYSTEM",
      },
    });

    await prisma.activityLog.create({
      data: {
        actorType: "SYSTEM",
        action: "STORE_ORDER_PLACED",
        targetType: "StoreOrder",
        targetId: order.id,
        targetName: order.orderNumber,
        message: activityMessages.STORE_ORDER_PLACED(order.orderNumber),
        metadata: { paymentMethod: "PAYTR" },
      },
    });

  } else {
    await prisma.storeOrder.update({
      where: { id: order.id },
      data: { paymentStatus: "CANCELLED", orderStatus: "CANCELLED" },
    });

    await prisma.orderStatusLog.create({
      data: {
        orderId: order.id,
        fromStatus: "PENDING",
        toStatus: "CANCELLED",
        note: "PayTR ödemesi başarısız",
        changedBy: "SYSTEM",
      },
    });
  }
}

// ─── İADE ─────────────────────────────────────────────────────────────────────

/**
 * PayTR üzerinden iade başlatır
 * Sadece admin çağırabilir
 */
export async function paytrRefund(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { merchantId, merchantKey, merchantSalt } = getPaytrEnv();

  const body = await c.req.json() as { orderId: string; orderType: "donation" | "store" };

  // Siparişi bul
  let order: any = null;
  if (body.orderType === "donation") {
    order = await prisma.order.findFirst({ where: { id: body.orderId } });
  } else {
    order = await prisma.storeOrder.findFirst({ where: { id: body.orderId } });
  }

  if (!order) return c.json(errors.NOT_FOUND, 404);
  if (order.paymentStatus !== "PAID") return c.json(errors.BAD_REQUEST, 400);
  if (order.paymentMethod !== "PAYTR" && !order.paytxMerchantOid) {
    return c.json({ error: "Not a PayTR order" }, 400);
  }

  // İade tutarı — TL cinsinden ondalıklı string
  const returnAmount = Number(order.totalAmount).toFixed(2);

  // Hash hesapla
  const hashStr = merchantId + order.paytxMerchantOid + returnAmount + merchantSalt;
  const token = crypto.createHmac("sha256", merchantKey).update(hashStr).digest("base64");

  // PayTR'ye iade isteği
  const params = new URLSearchParams({
    merchant_id: merchantId,
    merchant_oid: order.paytxMerchantOid,
    return_amount: returnAmount,
    merchant_key: merchantKey,
    paytr_token: token,
  });

  const response = await fetch("https://www.paytr.com/odeme/iade", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json() as { status: string; err_no?: string; err_msg?: string };

  if (data.status !== "success") {
    return c.json({ error: data.err_msg || "İade başlatılamadı" }, 500);
  }

  // DB güncelle
  if (body.orderType === "donation") {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "REFUNDED" },
    });
  } else {
    await prisma.storeOrder.update({
      where: { id: order.id },
      data: { paymentStatus: "REFUNDED", orderStatus: "REFUNDED" },
    });

    await prisma.orderStatusLog.create({
      data: {
        orderId: order.id,
        fromStatus: "CONFIRMED",
        toStatus: "REFUNDED",
        note: `İade tutarı: ${returnAmount} TL`,
        changedBy: admin.id,
      },
    });
  }

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "ORDER_REFUNDED",
      targetType: body.orderType === "donation" ? "Order" : "StoreOrder",
      targetId: order.id,
      targetName: order.orderNumber,
      message: `${order.orderNumber} numaralı sipariş iade edildi (${returnAmount} TL)`,
    },
  });

  return c.json({ success: true });
}

// ─── DURUM SORGU ──────────────────────────────────────────────────────────────

export async function paytrStatusQuery(c: Context) {
  const admin = c.get("user") as { id: string };
  const { merchantId, merchantKey, merchantSalt } = getPaytrEnv();

  const body = await c.req.json() as { orderId: string; orderType: "donation" | "store" };

  let order: any = null;
  if (body.orderType === "donation") {
    order = await prisma.order.findFirst({ where: { id: body.orderId } });
  } else {
    order = await prisma.storeOrder.findFirst({ where: { id: body.orderId } });
  }

  if (!order) return c.json(errors.NOT_FOUND, 404);
  if (!order.paytxMerchantOid && order.paymentMethod !== "PAYTR") {
    return c.json({ error: "Bu sipariş PayTR ile ödenmedi" }, 400);
  }

  const merchantOid = order.paytxMerchantOid || order.orderNumber;
  const hashStr = merchantId + merchantOid + merchantSalt;
  const paytrToken = crypto.createHmac("sha256", merchantKey).update(hashStr).digest("base64");

  const params = new URLSearchParams({
    merchant_id:  merchantId,
    merchant_oid: merchantOid,
    paytr_token:  paytrToken,
    merchant_key: merchantKey,
  });

  const response = await fetch("https://www.paytr.com/odeme/durum-sorgu", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json() as {
    status: string;
    payment_status?: string;
    total_amount?: string;
    err_no?: string;
    err_msg?: string;
  };

  if (data.status !== "success") {
    // PENDING_PAYMENT için PayTR'da kayıt yok — bu beklenen durum
    if (order.paymentStatus === "PENDING_PAYMENT") {
      return c.json({ paymentStatus: "pending", totalAmount: null });
    }
    return c.json({ error: data.err_msg || "Durum sorgulanamadı" }, 500);
  }

  // PayTR success dönerse ve siparişimiz hâlâ ödeme bekliyorsa güncelle
  if (data.payment_status === "success" &&
      (order.paymentStatus === "PENDING_PAYMENT" || order.paymentStatus === "WAITING_APPROVAL")) {
    if (body.orderType === "donation") {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", paytxMerchantOid: merchantOid, isAdminRead: false },
      });
    } else {
      await prisma.storeOrder.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", orderStatus: "CONFIRMED", paytxMerchantOid: merchantOid, isAdminRead: false },
      });
    }
  }

  return c.json({ paymentStatus: data.payment_status, totalAmount: data.total_amount });
}

// ─── KAMPANYA PROGRESS KONTROLÜ ───────────────────────────────────────────────

async function checkCampaignProgress(items: { campaignId: string; productId: string; quantity: any }[]) {
  const campaignIds = [...new Set(items.map((i) => i.campaignId))];

  for (const campaignId of campaignIds) {
    const products = await prisma.campaignProduct.findMany({ where: { campaignId } });

    const total = products.reduce((sum, p) => sum + p.targetStock, 0);
    const collected = products.reduce((sum, p) => sum + p.currentStock, 0);

    if (total === 0) continue;

    const percent = (collected / total) * 100;
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId } });
    const shelter = await prisma.shelter.findFirst({ where: { id: campaign?.shelterId } });

    if (!shelter || !campaign) continue;

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