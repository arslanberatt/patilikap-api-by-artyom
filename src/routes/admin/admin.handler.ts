import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import { activityMessages } from "../../lib/activity.js";
import { generateUniqueSlug } from "../../lib/slug.js";

// ─── KULLANICI YÖNETİMİ ───────────────────────────────────────────────────────

export async function getUsers(c: Context) {
  const query = c.req.query();
  const role = query.role;
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const where = role ? { role: role as any } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        emailVerified: true,
        onboardingCompleted: true,
        createdAt: true,
        shelters: { select: { id: true, name: true, status: true } },
        _count: { select: { orders: true, storeOrders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return c.json({ users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}

export async function getUserById(c: Context) {
  const { id } = c.req.param();

  const user = await prisma.user.findFirst({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      emailVerified: true,
      onboardingCompleted: true,
      createdAt: true,
      shelters: {
        select: {
          id: true, name: true, status: true, city: true, district: true,
          phone: true, description: true, address: true, authorizedPerson: true,
          charterDocUrl: true, activityDocUrl: true, documentUrls: true, createdAt: true,
          code: true, slug: true,
          campaigns: {
            orderBy: { createdAt: "desc" as const },
            take: 10,
            select: { id: true, title: true, slug: true, status: true, createdAt: true },
          },
        },
      },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true, orderNumber: true, paymentStatus: true, totalAmount: true, createdAt: true,
          items: {
            select: {
              id: true, productName: true, quantity: true, unitPrice: true,
              campaign: { select: { id: true, title: true } },
            },
          },
        },
      },
      storeOrders: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, orderNumber: true, orderStatus: true, totalAmount: true, createdAt: true },
      },
    },
  });

  if (!user) return c.json(errors.NOT_FOUND, 404);
  return c.json(user);
}

export async function updateUserRole(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as { role: "ADMIN" | "SHELTER" | "DONOR" };

  const updated = await prisma.user.update({
    where: { id },
    data: { role: body.role },
    select: { id: true, email: true, name: true, role: true },
  });

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "USER_ROLE_CHANGED",
      targetType: "User",
      targetId: user.id,
      targetName: user.name ?? user.email,
      message: activityMessages.USER_ROLE_CHANGED(user.name ?? user.email, body.role),
    },
  });

  return c.json(updated);
}

export async function deleteUser(c: Context) {
  const admin = c.get("user") as { id: string; name: string };
  const { id } = c.req.param();

  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) return c.json(errors.NOT_FOUND, 404);
  if (user.role === "ADMIN") return c.json({ error: "Admin kullanıcı silinemez" }, 403);
  if (user.id === admin.id) return c.json({ error: "Kendi hesabınızı silemezsiniz" }, 403);

  const displayName = user.name ?? user.email;

  await prisma.$transaction(async tx => {
    // Bağışlar (Order) anonimleştirme
    await tx.order.updateMany({
      where: { userId: id },
      data: {
        userId: null,
        guestName: user.name,
        guestEmail: user.email,
        guestPhone: user.phone,
      },
    });

    // Mağaza siparişleri (StoreOrder) anonimleştirme
    await tx.storeOrder.updateMany({
      where: { userId: id },
      data: {
        userId: null,
        guestName: user.name,
        guestEmail: user.email,
        guestPhone: user.phone,
      },
    });

    // CouponUsage anonimleştirme
    await tx.couponUsage.updateMany({
      where: { userId: id },
      data: { userId: null },
    });

    // ProductReview — bu kullanıcının yorumlarını sil (User ilişkisi NOT NULL)
    await tx.productReview.deleteMany({ where: { userId: id } });

    // User'ı sil. Shelter.userId → SetNull (migration sayesinde),
    // UserAddress, Notification, Session, Account → Cascade.
    await tx.user.delete({ where: { id } });
  });

  await prisma.activityLog.create({
    data: {
      actorId: admin.id,
      actorName: admin.name,
      actorType: "ADMIN",
      action: "USER_DELETED",
      targetType: "User",
      targetId: id,
      targetName: displayName,
      message: activityMessages.USER_DELETED(displayName),
      metadata: { deletedUser: { id, email: user.email, role: user.role } },
    },
  });

  return c.json({ success: true });
}

// ─── SİSTEM AYARLARI ──────────────────────────────────────────────────────────

export async function getSystemConfig(c: Context) {
  const config = await prisma.systemConfig.findFirst({
    where: { isDefault: true },
  });

  // Yoksa varsayılan oluştur
  if (!config) {
    const newConfig = await prisma.systemConfig.create({
      data: { isDefault: true },
    });
    return c.json(newConfig);
  }

  return c.json(config);
}

export async function updateSystemConfig(c: Context) {
  const body = await c.req.json() as {
    bankName?: string;
    accountHolder?: string;
    iban?: string;
    minimumDonationLimit?: number;
    freeShippingThreshold?: number;
    freeShipping?: boolean;
    allowNewShelterRegistration?: boolean;
    allowCampaignCreation?: boolean;
    showCategoryEmojis?: boolean;
    paytxSurchargePercent?: number;
  };

  let config = await prisma.systemConfig.findFirst({ where: { isDefault: true } });

  if (!config) {
    config = await prisma.systemConfig.create({ data: { isDefault: true, ...body } });
  } else {
    config = await prisma.systemConfig.update({ where: { id: config.id }, data: body });
  }

  return c.json(config);
}

// ─── KARGO FİYATLARI ──────────────────────────────────────────────────────────

export async function getCargoRates(c: Context) {
  const rates = await prisma.cargoRate.findMany({
    orderBy: { minKg: "asc" },
  });
  return c.json(rates);
}

export async function createCargoRate(c: Context) {
  const body = await c.req.json() as {
    minKg: number;
    maxKg?: number;
    price: number;
    isActive?: boolean;
    sortOrder?: number;
  };

  const rate = await prisma.cargoRate.create({ data: body });
  return c.json(rate, 201);
}

export async function updateCargoRate(c: Context) {
  const { id } = c.req.param();

  const rate = await prisma.cargoRate.findFirst({ where: { id } });
  if (!rate) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as Partial<{
    minKg: number;
    maxKg: number;
    price: number;
    isActive: boolean;
    sortOrder: number;
  }>;

  const updated = await prisma.cargoRate.update({ where: { id }, data: body });
  return c.json(updated);
}

export async function deleteCargoRate(c: Context) {
  const { id } = c.req.param();

  const rate = await prisma.cargoRate.findFirst({ where: { id } });
  if (!rate) return c.json(errors.NOT_FOUND, 404);

  await prisma.cargoRate.delete({ where: { id } });
  return c.json({ success: true });
}

// ─── NAKİT İNDİRİMİ ──────────────────────────────────────────────────────────

export async function getCashDiscounts(c: Context) {
  const discounts = await prisma.cashDiscount.findMany({
    orderBy: { threshold: "asc" },
  });
  return c.json(discounts);
}

export async function createCashDiscount(c: Context) {
  const body = await c.req.json() as {
    threshold: number;
    amount: number;
    isActive?: boolean;
    sortOrder?: number;
  };

  const discount = await prisma.cashDiscount.create({ data: body });
  return c.json(discount, 201);
}

export async function updateCashDiscount(c: Context) {
  const { id } = c.req.param();

  const discount = await prisma.cashDiscount.findFirst({ where: { id } });
  if (!discount) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as Partial<{
    threshold: number;
    amount: number;
    isActive: boolean;
    sortOrder: number;
  }>;

  const updated = await prisma.cashDiscount.update({ where: { id }, data: body });
  return c.json(updated);
}

export async function deleteCashDiscount(c: Context) {
  const { id } = c.req.param();

  const discount = await prisma.cashDiscount.findFirst({ where: { id } });
  if (!discount) return c.json(errors.NOT_FOUND, 404);

  await prisma.cashDiscount.delete({ where: { id } });
  return c.json({ success: true });
}

// ─── KATEGORİLER ──────────────────────────────────────────────────────────────

export async function getCategories(c: Context) {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      children: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { products: true } } },
      },
      _count: { select: { products: true } },
    },
    where: { parentId: null }, // sadece ana kategoriler
  });
  return c.json(categories);
}

export async function createCategory(c: Context) {
  const body = await c.req.json() as {
    name: string;
    slug?: string;
    imageUrl?: string;
    sortOrder?: number;
    parentId?: string;
  };

  const slug = body.slug || generateUniqueSlug(body.name);

  const existing = await prisma.category.findFirst({ where: { name: body.name } });
  if (existing) return c.json(errors.CONFLICT, 409);

  const category = await prisma.category.create({
    data: { ...body, slug },
  });

  return c.json(category, 201);
}

export async function updateCategory(c: Context) {
  const { id } = c.req.param();

  const category = await prisma.category.findFirst({ where: { id } });
  if (!category) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as Partial<{
    name: string;
    slug: string;
    imageUrl: string;
    sortOrder: number;
    parentId: string;
  }>;

  const updated = await prisma.category.update({ where: { id }, data: body });
  return c.json(updated);
}

export async function deleteCategory(c: Context) {
  const { id } = c.req.param();

  const category = await prisma.category.findFirst({
    where: { id },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!category) return c.json(errors.NOT_FOUND, 404);

  // Alt kategorisi veya ürünü varsa silme
  if (category._count.children > 0) {
    return c.json({ error: "Bu kategorinin alt kategorileri var, önce onları silin" }, 400);
  }
  if (category._count.products > 0) {
    return c.json({ error: "Bu kategoride ürünler var, önce ürünleri taşıyın" }, 400);
  }

  await prisma.category.delete({ where: { id } });
  return c.json({ success: true });
}

// ─── KUPONLAR ─────────────────────────────────────────────────────────────────

export async function getCoupons(c: Context) {
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { usages: true } } },
  });
  return c.json(coupons);
}

export async function createCoupon(c: Context) {
  const body = await c.req.json() as {
    code: string;
    description?: string;
    type: "FIXED" | "PERCENTAGE";
    value: number;
    minOrderAmount?: number;
    maxUses?: number;
    maxUsesPerUser?: number;
    isActive?: boolean;
    startsAt?: string;
    expiresAt?: string;
  };

  const existing = await prisma.coupon.findFirst({ where: { code: body.code } });
  if (existing) return c.json(errors.CONFLICT, 409);

  const coupon = await prisma.coupon.create({
    data: {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  return c.json(coupon, 201);
}

export async function updateCoupon(c: Context) {
  const { id } = c.req.param();

  const coupon = await prisma.coupon.findFirst({ where: { id } });
  if (!coupon) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as Partial<{
    description: string;
    isActive: boolean;
    maxUses: number;
    startsAt: string;
    expiresAt: string;
  }>;

  const updated = await prisma.coupon.update({
    where: { id },
    data: {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    },
  });

  return c.json(updated);
}

export async function deleteCoupon(c: Context) {
  const { id } = c.req.param();

  const coupon = await prisma.coupon.findFirst({ where: { id } });
  if (!coupon) return c.json(errors.NOT_FOUND, 404);

  await prisma.coupon.delete({ where: { id } });
  return c.json({ success: true });
}

// ─── HERO SLİDES ──────────────────────────────────────────────────────────────

export async function getHeroSlides(c: Context) {
  const slides = await prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" } });
  return c.json(slides);
}

export async function createHeroSlide(c: Context) {
  const body = await c.req.json() as {
    title: string;
    description?: string;
    buttonText?: string;
    buttonLink?: string;
    imageUrl: string;
    sortOrder?: number;
    isActive?: boolean;
  };

  const slide = await prisma.heroSlide.create({ data: body });
  return c.json(slide, 201);
}

export async function updateHeroSlide(c: Context) {
  const { id } = c.req.param();

  const slide = await prisma.heroSlide.findFirst({ where: { id } });
  if (!slide) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as Partial<{
    title: string;
    description: string;
    buttonText: string;
    buttonLink: string;
    imageUrl: string;
    sortOrder: number;
    isActive: boolean;
  }>;

  const updated = await prisma.heroSlide.update({ where: { id }, data: body });
  return c.json(updated);
}

export async function deleteHeroSlide(c: Context) {
  const { id } = c.req.param();

  const slide = await prisma.heroSlide.findFirst({ where: { id } });
  if (!slide) return c.json(errors.NOT_FOUND, 404);

  await prisma.heroSlide.delete({ where: { id } });
  return c.json({ success: true });
}

// ─── MARKA ────────────────────────────────────────────────────────────────────

export async function getStoreBrands(c: Context) {
  const brands = await prisma.storeBrand.findMany({ orderBy: { sortOrder: "asc" } });
  return c.json(brands);
}

export async function createStoreBrand(c: Context) {
  const body = await c.req.json() as {
    name: string;
    imageUrl?: string;
    color?: string;
    isActive?: boolean;
    sortOrder?: number;
  };

  const brand = await prisma.storeBrand.create({ data: body });
  return c.json(brand, 201);
}

export async function updateStoreBrand(c: Context) {
  const { id } = c.req.param();

  const brand = await prisma.storeBrand.findFirst({ where: { id } });
  if (!brand) return c.json(errors.NOT_FOUND, 404);

  const body = await c.req.json() as Partial<{
    name: string;
    imageUrl: string;
    color: string;
    isActive: boolean;
    sortOrder: number;
  }>;

  const updated = await prisma.storeBrand.update({ where: { id }, data: body });
  return c.json(updated);
}

export async function deleteStoreBrand(c: Context) {
  const { id } = c.req.param();

  const brand = await prisma.storeBrand.findFirst({ where: { id } });
  if (!brand) return c.json(errors.NOT_FOUND, 404);

  await prisma.storeBrand.delete({ where: { id } });
  return c.json({ success: true });
}

// ─── ÜRÜN YORUMLARI ───────────────────────────────────────────────────────────

export async function adminGetReviews(c: Context) {
  const query = c.req.query();
  const page       = Math.max(1, Number(query.page) || 1);
  const limit      = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip       = (page - 1) * limit;
  const isApproved = query.isApproved === "true" ? true : query.isApproved === "false" ? false : undefined;
  const productId  = query.productId as string | undefined;

  const where: any = {
    ...(isApproved !== undefined && { isApproved }),
    ...(productId  && { productId }),
  };

  const [reviews, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        rating: true,
        title: true,
        comment: true,
        isApproved: true,
        createdAt: true,
        user:    { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.productReview.count({ where }),
  ]);

  return c.json({
    reviews,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function adminApproveReview(c: Context) {
  const { id } = c.req.param();

  const review = await prisma.productReview.findFirst({ where: { id } });
  if (!review) return c.json(errors.NOT_FOUND, 404);
  if (review.isApproved) return c.json(errors.CONFLICT, 409);

  const updated = await prisma.productReview.update({
    where: { id },
    data: { isApproved: true },
  });

  return c.json(updated);
}

export async function adminDeleteReview(c: Context) {
  const { id } = c.req.param();

  const review = await prisma.productReview.findFirst({ where: { id } });
  if (!review) return c.json(errors.NOT_FOUND, 404);

  await prisma.productReview.delete({ where: { id } });
  return c.json({ success: true });
}

// ─── AKTİVİTE LOGU ───────────────────────────────────────────────────────────

export async function getActivityLogs(c: Context) {
  const query = c.req.query();
  const actorType = query.actorType;
  const targetType = query.targetType;
  const action = query.action;
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 50;
  const skip = (page - 1) * limit;

  const where = {
    ...(actorType && { actorType: actorType as any }),
    ...(targetType && { targetType }),
    ...(action && { action }),
  };

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return c.json({ logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}

// ─── DASHBOARD İSTATİSTİKLERİ ─────────────────────────────────────────────────

export async function getDashboardStats(c: Context) {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    totalUsers,
    newUsersThisMonth,
    totalShelters,
    pendingShelters,
    totalCampaigns,
    activeCampaigns,
    pendingCampaigns,
    totalOrders,
    pendingOrders,
    cancelRequestOrders,
    totalStoreOrders,
    pendingStoreOrders,
    cancelRequestStoreOrders,
    pendingStories,
    unreadOrders,
    unreadStoreOrders,
    orderRevenue,
    storeRevenue,
    recentEftOrders,
    recentPendingShelters,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.shelter.count(),
    prisma.shelter.count({ where: { status: "PENDING" } }),
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: "ACTIVE" } }),
    prisma.campaign.count({ where: { status: "DRAFT" } }),
    prisma.order.count(),
    prisma.order.count({ where: { paymentStatus: "WAITING_APPROVAL" } }),
    prisma.order.count({ where: { cancelRequest: true } }),
    prisma.storeOrder.count(),
    prisma.storeOrder.count({ where: { paymentStatus: "WAITING_APPROVAL" } }),
    prisma.storeOrder.count({ where: { cancelRequest: true } }),
    prisma.shelterStory.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { isAdminRead: false } }),
    prisma.storeOrder.count({ where: { isAdminRead: false } }),
    // Bağış geliri — sadece PAID siparişler
    prisma.order.aggregate({
      where: { paymentStatus: "PAID" },
      _sum: { totalAmount: true },
    }),
    // Mağaza geliri — sadece PAID siparişler
    prisma.storeOrder.aggregate({
      where: { paymentStatus: "PAID" },
      _sum: { totalAmount: true },
    }),
    // Onay bekleyen son 5 EFT bağış siparişi
    prisma.order.findMany({
      where: { paymentStatus: "WAITING_APPROVAL", paymentMethod: "EFT" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        guestName: true,
        guestEmail: true,
        receiptUrl: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    // Onay bekleyen son 5 barınak
    prisma.shelter.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        city: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const totalRevenue =
    Number(orderRevenue._sum.totalAmount || 0) +
    Number(storeRevenue._sum.totalAmount || 0);

  return c.json({
    users: {
      total: totalUsers,
      newThisMonth: newUsersThisMonth,
    },
    shelters: {
      total: totalShelters,
      pending: pendingShelters,
      recentPending: recentPendingShelters,
    },
    campaigns: {
      total: totalCampaigns,
      active: activeCampaigns,
      pending: pendingCampaigns,
    },
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      cancelRequests: cancelRequestOrders,
      unread: unreadOrders,
      revenue: Number(orderRevenue._sum.totalAmount || 0),
      recentEftPending: recentEftOrders,
    },
    storeOrders: {
      total: totalStoreOrders,
      pending: pendingStoreOrders,
      cancelRequests: cancelRequestStoreOrders,
      unread: unreadStoreOrders,
      revenue: Number(storeRevenue._sum.totalAmount || 0),
    },
    stories: {
      pending: pendingStories,
    },
    revenue: {
      total: totalRevenue,
      donations: Number(orderRevenue._sum.totalAmount || 0),
      store: Number(storeRevenue._sum.totalAmount || 0),
    },
  });
}

// ─── GLOBAL ARAMA ─────────────────────────────────────────────────────────────

export async function adminSearch(c: Context) {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ users: [], shelters: [], campaigns: [] });

  const term = q.slice(0, 100);

  const [users, shelters, campaigns] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.shelter.findMany({
      where: {
        status: "APPROVED",
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { city: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, name: true, city: true, status: true },
    }),
    prisma.campaign.findMany({
      where: {
        status: "ACTIVE",
        title: { contains: term, mode: "insensitive" },
      },
      take: 5,
      select: {
        id: true,
        slug: true,
        title: true,
        shelter: { select: { name: true } },
      },
    }),
  ]);

  return c.json({ users, shelters, campaigns });
}

// ─── GELİR SERİSİ (CHART) ─────────────────────────────────────────────────────

export async function getRevenueSeries(c: Context) {
  const days = Math.min(90, Math.max(7, Number(c.req.query("days")) || 14));
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);

  const [orders, storeOrders] = await Promise.all([
    prisma.order.findMany({
      where: { paymentStatus: "PAID", createdAt: { gte: since } },
      select: { createdAt: true, totalAmount: true },
    }),
    prisma.storeOrder.findMany({
      where: { paymentStatus: "PAID", createdAt: { gte: since } },
      select: { createdAt: true, totalAmount: true },
    }),
  ]);

  // Build a map keyed by ISO date string (YYYY-MM-DD)
  const map: Record<string, { orders: number; store: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    map[d.toISOString().slice(0, 10)] = { orders: 0, store: 0 };
  }

  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    if (map[key]) map[key].orders += Number(o.totalAmount);
  }
  for (const o of storeOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    if (map[key]) map[key].store += Number(o.totalAmount);
  }

  const series = Object.entries(map).map(([date, v]) => ({ date, orders: v.orders, store: v.store }));
  return c.json({ series });
}