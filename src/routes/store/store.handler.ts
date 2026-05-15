import type { Context } from "hono";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import { activityMessages } from "../../lib/activity.js";
import { sendEmail, buildOrderConfirmationEmail, buildOrderCancelledEmail, buildShippingEmail } from "../../lib/email.js";
import crypto from "crypto";
import { generatePaytrToken } from "../paytr/paytr.handler.js";

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

function generateOrderNumber(): string {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `SO${timestamp}${random}`;
}

function generateToken(): string {
    return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Kargo ücretini hesapla
 * CargoRate tablosundaki dinamik aralıklara göre
 */
async function calculateShippingFee(totalWeightKg: number): Promise<number> {
    const config = await prisma.systemConfig.findFirst({
        where: { isDefault: true },
    });

    // Ücretsiz kargo aktifse
    if (config?.freeShipping) return 0;

    // Ücretsiz kargo eşiği kontrolü sipariş oluşturulurken yapılır
    // Burada sadece ağırlığa göre hesaplıyoruz

    const rates = await prisma.cargoRate.findMany({
        where: { isActive: true },
        orderBy: { minKg: "asc" },
    });

    for (const rate of rates) {
        const minKg = Number(rate.minKg);
        const maxKg = rate.maxKg !== null ? Number(rate.maxKg) : Infinity;
        if (totalWeightKg >= minKg && totalWeightKg <= maxKg) {
            return Number(rate.price);
        }
    }

    // Hiçbir aralığa uymuyorsa en yüksek fiyatı al
    const lastRate = rates[rates.length - 1];
    return lastRate ? Number(lastRate.price) : 0;
}

// ─── PUBLIC — KATEGORİLER ─────────────────────────────────────────────────────

export async function getPublicConfig(c: Context) {
    const config = await prisma.systemConfig.findFirst({ where: { isDefault: true } });
    return c.json({
        paytxSurchargePercent: config?.paytxSurchargePercent ?? 4,
        bankName:              config?.bankName              ?? null,
        accountHolder:         config?.accountHolder         ?? null,
        iban:                  config?.iban                  ?? null,
    });
}

export async function getShippingQuote(c: Context) {
    const w = Number(c.req.query("weightKg") ?? 0);
    const weightKg = isFinite(w) && w > 0 ? w : 0;
    const fee = await calculateShippingFee(weightKg);
    const config = await prisma.systemConfig.findFirst({ where: { isDefault: true } });
    return c.json({ fee, freeShippingThreshold: config?.freeShippingThreshold ?? null });
}

export async function getPublicBrands(c: Context) {
    const brands = await prisma.storeBrand.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, imageUrl: true, color: true },
    });
    return c.json({ brands });
}

export async function getStoreCategories(c: Context) {
    const categories = await prisma.category.findMany({
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        select: {
            id: true, name: true, slug: true, imageUrl: true,
            _count: { select: { products: { where: { showInStore: true, isActive: true } } } },
            children: {
                orderBy: { sortOrder: "asc" },
                select: {
                    id: true, name: true, slug: true, imageUrl: true,
                    _count: { select: { products: { where: { showInStore: true, isActive: true } } } },
                },
            },
        },
    });
    return c.json(categories.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        imageUrl: cat.imageUrl,
        count: cat._count.products,
        children: cat.children.map((ch: any) => ({
            id: ch.id,
            name: ch.name,
            slug: ch.slug,
            imageUrl: ch.imageUrl,
            count: ch._count.products,
        })),
    })));
}

export async function getStoreAttributeOptions(c: Context) {
    const [rows, variantProducts] = await Promise.all([
        prisma.$queryRaw<{ key: string; value: string }[]>`
            SELECT DISTINCT kv.key, kv.value
            FROM "Product"
            CROSS JOIN LATERAL jsonb_each_text("nutritionValues") kv
            WHERE "showInStore" = true AND "isActive" = true
              AND "nutritionValues" IS NOT NULL
              AND kv.value IS NOT NULL
              AND kv.value != ''
            ORDER BY kv.key, kv.value
        `,
        prisma.product.findMany({
            where: { showInStore: true, isActive: true },
            select: { sizes: true, colors: true, materials: true },
        }),
    ]);

    const map = new Map<string, string[]>();
    for (const { key, value } of rows) {
        const arr = map.get(key) ?? [];
        arr.push(value);
        map.set(key, arr);
    }

    const sizes     = [...new Set(variantProducts.flatMap((p: any) => p.sizes as string[]))].sort();
    const colors    = [...new Set(variantProducts.flatMap((p: any) => p.colors as string[]))].sort();
    const materials = [...new Set(variantProducts.flatMap((p: any) => p.materials as string[]))].sort();

    return c.json({
        variants: { sizes, colors, materials },
        nutrition: [...map.entries()].map(([key, values]) => ({ key, values })),
    });
}

// ─── PUBLIC — ÜRÜNLER ─────────────────────────────────────────────────────────

export async function getProducts(c: Context) {
    const query = c.req.query();

    const categoryId  = query.category;
    const categoryIds = query.categories?.split(",").filter(Boolean) ?? [];
    const brand       = query.brand;
    const minPrice    = query.minPrice ? Number(query.minPrice) : undefined;
    const maxPrice    = query.maxPrice ? Number(query.maxPrice) : undefined;
    const tag         = query.tag;
    const sizes       = query.sizes?.split(",").filter(Boolean) ?? [];
    const colors      = query.colors?.split(",").filter(Boolean) ?? [];
    const materials   = query.materials?.split(",").filter(Boolean) ?? [];
    const search      = query.search?.trim();
    const sortBy      = query.sortBy || "sortOrder";
    const page        = Number(query.page) || 1;
    const limit       = Number(query.limit) || 20;
    const skip        = (page - 1) * limit;

    type OrderByOne = { price?: "asc" | "desc"; name?: "asc" | "desc"; createdAt?: "asc" | "desc"; sortOrder?: "asc" | "desc"; reviews?: { _count: "asc" | "desc" } };
    const orderBy: OrderByOne | OrderByOne[] = search
        ? { sortOrder: "asc" }
        : sortBy === "price_asc"      ? { price: "asc" }
        : sortBy === "price_desc"     ? { price: "desc" }
        : sortBy === "a_z"            ? { name: "asc" }
        : sortBy === "z_a"            ? { name: "desc" }
        : sortBy === "newest"         ? { createdAt: "desc" }
        : sortBy === "most_reviewed"  ? [{ reviews: { _count: "desc" } }, { sortOrder: "asc" }]
        :                               { sortOrder: "asc" };

    // Kategori — categories (çoklu, virgülle) veya category (tekli) desteklenir
    const activeCategoryIds = categoryIds.length > 0 ? categoryIds : (categoryId ? [categoryId] : []);

    // Parent seçilince tüm alt kategoriler de dahil edilir (OR mantığı)
    let expandedCatIds: string[] = [...activeCategoryIds];
    if (activeCategoryIds.length > 0) {
        const childCats = await prisma.category.findMany({
            where: { parentId: { in: activeCategoryIds } },
            select: { id: true },
        });
        childCats.forEach((ch: any) => expandedCatIds.push(ch.id));
    }

    // Attribute filtreleri — "Renk:Kırmızı,Materyal:Krom" formatı
    const attrFilters = (query.attrs ?? "")
        .split(",").filter(Boolean)
        .map((s) => { const i = s.indexOf(":"); return { key: s.slice(0, i), value: s.slice(i + 1) }; })
        .filter((f) => f.key && f.value);

    // AND koşulları — arama kelimeleri + attribute filtreleri
    const andConditions: any[] = [];
    if (search) {
        search.split(/\s+/).filter(Boolean).forEach((word) => {
            andConditions.push({
                OR: [
                    { name:        { contains: word, mode: "insensitive" } },
                    { brand:       { contains: word, mode: "insensitive" } },
                    { description: { contains: word, mode: "insensitive" } },
                    { tags:        { hasSome: [word.toLowerCase()] } },
                ],
            });
        });
    }
    attrFilters.forEach(({ key, value }) => {
        andConditions.push({ nutritionValues: { path: [key], equals: value } });
    });

    const showInDonation = query.showInDonation === "true" ? true : undefined;

    // where nesnesini aşamalı olarak oluştur — tip çıkarımını korur
    const where: any = { isActive: true };
    if (showInDonation !== undefined) {
        where.showInDonation = showInDonation;
    } else {
        where.showInStore = true;
    }
    if (expandedCatIds.length > 0) where.categoryId = { in: expandedCatIds };
    if (brand) where.brand = brand;
    if (tag) where.tags = { has: tag };
    if (sizes.length)     where.sizes     = { hasSome: sizes };
    if (colors.length)    where.colors    = { hasSome: colors };
    if (materials.length) where.materials = { hasSome: materials };
    if (minPrice !== undefined || maxPrice !== undefined) {
        where.price = {
            ...(minPrice !== undefined ? { gte: minPrice } : {}),
            ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
        };
    }
    if (andConditions.length > 0) where.AND = andConditions;

    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                price: true,
                comparePrice: true,
                stock: true,
                isFeatured: true,
                weightKg: true,
                brand: true,
                tags: true,
                category: { select: { id: true, name: true, slug: true } },
                _count: { select: { reviews: true } },
            },
        }),
        prisma.product.count({ where }),
    ]);

    const productIds = products.map((p: any) => p.id as string);
    const avgRatings = await prisma.productReview.groupBy({
        by: ["productId"],
        where: { productId: { in: productIds }, isApproved: true },
        _avg: { rating: true },
    });
    const avgMap = new Map(avgRatings.map((r: any) => [r.productId as string, r._avg.rating as number | null]));

    const enriched = products.map(({ _count, ...p }: any) => ({
        ...p,
        reviewCount: _count.reviews,
        avgRating: avgMap.get(p.id) ?? null,
    }));

    return c.json({
        products: enriched,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
}

export async function getProductBySlug(c: Context) {
    const { slug } = c.req.param();

    const product = await prisma.product.findFirst({
        where: { slug, showInStore: true, isActive: true },
        select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            imageUrl: true,
            galleryImageUrls: true,
            price: true,
            comparePrice: true,
            stock: true,
            weightKg: true,
            brand: true,
            tags: true,
            sizes: true,
            colors: true,
            materials: true,
            productionDate: true,
            expiryDate: true,
            nutritionValues: true,
            category: {
                select: { id: true, name: true, slug: true },
            },
            reviews: {
                where: { isApproved: true },
                select: {
                    id: true,
                    rating: true,
                    title: true,
                    comment: true,
                    createdAt: true,
                    user: { select: { name: true, image: true } },
                },
                orderBy: { createdAt: "desc" },
                take: 10,
            },
        },
    });

    if (!product) return c.json(errors.NOT_FOUND, 404);
    return c.json(product);
}

export async function addStockAlert(c: Context) {
    const user = c.get("user") as { id: string; email: string } | null;
    const { id } = c.req.param();

    const product = await prisma.product.findFirst({
        where: { id, showInStore: true },
    });
    if (!product) return c.json(errors.NOT_FOUND, 404);

    const body = await c.req.json() as { email: string };
    const email = user?.email || body.email;

    if (!email) return c.json(errors.BAD_REQUEST, 400);

    // Zaten kayıtlı mı?
    const existing = await prisma.stockAlert.findFirst({
        where: { productId: id, email },
    });
    if (existing) return c.json(errors.CONFLICT, 409);

    await prisma.stockAlert.create({
        data: {
            productId: id,
            email,
            userId: user?.id,
        },
    });

    return c.json({ success: true }, 201);
}

// ─── SİPARİŞ OLUŞTUR ──────────────────────────────────────────────────────────

export async function createStoreOrder(c: Context) {
    const user = c.get("user") as { id: string; name: string; email: string } | null;

    const body = await c.req.json() as {
        items: { productId: string; quantity: number }[];
        paymentMethod: "EFT" | "PAYTR";
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
        city?: string;
        addressId?: string;
        userIp?: string;
        couponCode?: string;
        receiptUrl?: string;
    };

    if (!body.items || body.items.length === 0) return c.json(errors.BAD_REQUEST, 400);

    // Resolve contact/address from addressId (logged-in) or direct fields (guest)
    let resolved = {
        name: body.name,
        email: body.email,
        phone: body.phone,
        address: body.address,
        city: body.city,
    };
    if (user && body.addressId) {
        const addr = await prisma.userAddress.findFirst({
            where: { id: body.addressId, userId: user.id },
        });
        if (!addr) return c.json(errors.NOT_FOUND, 404);
        resolved = {
            name: addr.fullName,
            email: user.email,
            phone: addr.phone,
            address: addr.address,
            city: addr.city,
        };
    }

    if (!resolved.name || !resolved.email || !resolved.phone || !resolved.address || !resolved.city) {
        return c.json(errors.BAD_REQUEST, 400);
    }

    // Ürünleri çek
    const products = await Promise.all(
        body.items.map(async (item) => {
            const product = await prisma.product.findFirst({
                where: { id: item.productId, showInStore: true, isActive: true },
            });
            return { product, quantity: item.quantity };
        })
    );

    // Ürün kontrolü
    for (const { product, quantity } of products) {
        if (!product) return c.json(errors.NOT_FOUND, 404);
        if (product.trackStock && product.stock < quantity) {
            return c.json({ error: `${product.name} için yeterli stok yok` }, 400);
        }
    }

    // Ara toplam
    const subtotal = products.reduce((sum, { product, quantity }) => {
        return sum + Number(product!.price) * quantity;
    }, 0);

    // Toplam ağırlık
    const totalWeightKg = products.reduce((sum, { product, quantity }) => {
        return sum + (product!.weightKg || 0) * quantity;
    }, 0);

    // Kargo ücreti
    let shippingFee = await calculateShippingFee(totalWeightKg);

    // Ücretsiz kargo eşiği kontrolü
    const config = await prisma.systemConfig.findFirst({ where: { isDefault: true } });
    if (config?.freeShippingThreshold && subtotal >= config.freeShippingThreshold) {
        shippingFee = 0;
    }

    // EFT havale indirimi — paytxSurchargePercent yüzdesi kadar indirim
    let discountAmount = 0;
    if (body.paymentMethod === "EFT" && config?.paytxSurchargePercent) {
        discountAmount = Math.round(subtotal * Number(config.paytxSurchargePercent)) / 100;
    }

    // Kupon
    let coupon = null;
    let couponDiscount = 0;
    if (body.couponCode) {
        coupon = await prisma.coupon.findFirst({
            where: {
                code: body.couponCode,
                isActive: true,
                AND: [
                    { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
                    { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
                ],
            },
        });

        if (!coupon) return c.json({ error: "Geçersiz veya süresi dolmuş kupon" }, 400);

        // maxUses kontrolü
        if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
            return c.json({ error: "Bu kuponun kullanım limiti doldu" }, 400);
        }

        if (!coupon) return c.json({ error: "Geçersiz veya süresi dolmuş kupon" }, 400);
        if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
            return c.json({ error: `Bu kupon için minimum sipariş tutarı ${coupon.minOrderAmount} TL` }, 400);
        }

        couponDiscount = coupon.type === "PERCENTAGE"
            ? (subtotal * Number(coupon.value)) / 100
            : Number(coupon.value);
    }

    const totalDiscount = discountAmount + couponDiscount;
    const totalAmount = Math.max(0, subtotal + shippingFee - totalDiscount);

    // Token'lar
    const orderNumber = generateOrderNumber();
    const cancelToken = generateToken();
    const trackingToken = generateToken();
    const cancelTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiresAt = body.paymentMethod === "EFT"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;

    // Sipariş oluştur
    const order = await prisma.storeOrder.create({
        data: {
            orderNumber,
            userId: user?.id || null,
            guestName: user ? null : resolved.name!,
            guestEmail: user ? null : resolved.email!,
            guestPhone: user ? null : resolved.phone!,
            guestAddress: resolved.address!,
            guestCity: resolved.city!,
            subtotal,
            discountAmount: totalDiscount,
            shippingFee,
            totalAmount,
            paymentMethod: body.paymentMethod as any,
            paymentStatus: body.paymentMethod === "PAYTR" ? "PENDING_PAYMENT" : "WAITING_APPROVAL",
            receiptUrl: body.receiptUrl,
            couponId: coupon?.id,
            couponCode: body.couponCode,
            cancelToken,
            cancelTokenExpiresAt,
            trackingToken,
            expiresAt,
            shippingAddress: `${resolved.address}, ${resolved.city}`,
            items: {
                create: products.map(({ product, quantity }) => ({
                    productId: product!.id,
                    productName: product!.name,
                    productImage: product!.imageUrl,
                    unitPrice: product!.price,
                    quantity,
                    weightKg: product!.weightKg,
                })),
            },
            statusLogs: {
                create: {
                    toStatus: "PENDING",
                    note: "Sipariş oluşturuldu",
                    changedBy: "SYSTEM",
                },
            },
        },
        include: { items: true },
    });

    // Kupon kullanım sayısını artır
    if (coupon) {
        await prisma.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
        });

        await prisma.couponUsage.create({
            data: {
                couponId: coupon.id,
                userId: user?.id,
                orderId: order.id,
            },
        });
    }

    // ActivityLog
    await prisma.activityLog.create({
        data: {
            actorId: user?.id,
            actorName: user?.name || body.name,
            actorType: user ? "DONOR" : "SYSTEM",
            action: "STORE_ORDER_PLACED",
            targetType: "StoreOrder",
            targetId: order.id,
            targetName: order.orderNumber,
            message: activityMessages.STORE_ORDER_PLACED(order.orderNumber),
            metadata: { guestName: body.name, guestEmail: body.email, city: body.city },
        },
    });

    await notifyAdmins({
        type: "PAYMENT_RECEIVED",
        title: "Yeni Mağaza Siparişi",
        message: `${orderNumber} numaralı yeni bir mağaza siparişi var (${body.paymentMethod})`,
        link: `/admin/store/orders/${order.id}`,
    });

    // Mail gönder
    const recipientEmail = user?.email || resolved.email!;
    await sendEmail({
        to: recipientEmail,
        subject: `Siparişiniz Alındı — ${orderNumber}`,
        html: buildOrderConfirmationEmail({
            orderNumber,
            name: resolved.name!,
            items: products.map(({ product, quantity }) => ({
                productName: product!.name,
                quantity,
                unitPrice: Number(product!.price),
            })),
            totalAmount,
            paymentMethod: body.paymentMethod,
            trackingToken,
            cancelToken,
            frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
        }),
    });

    if (body.paymentMethod === "PAYTR") {
        const paytrResult = await generatePaytrToken({
            orderNumber,
            email:       recipientEmail,
            amount:      Math.round(totalAmount * 100),
            userName:    resolved.name!,
            userPhone:   resolved.phone!,
            userAddress: resolved.address!,
            userCity:    resolved.city!,
            userIp:      body.userIp || "127.0.0.1",
            basketItems: products.map(({ product, quantity }) => [
                product!.name,
                String(Number(product!.price).toFixed(2)),
                quantity,
            ]),
        });

        if (!paytrResult.token) {
            console.error("[store] PayTR token alınamadı:", paytrResult.error, "orderNumber:", orderNumber);
            return c.json({ error: paytrResult.error || "PayTR token alınamadı" }, 500);
        }

        return c.json({ orderNumber, paytrToken: paytrResult.token, trackingToken }, 201);
    }

    return c.json({ orderNumber, trackingToken }, 201);
}

// ─── GİRİŞ YAPMIŞ KULLANICI ───────────────────────────────────────────────────

export async function getMyStoreOrders(c: Context) {
    const user = c.get("user") as { id: string };
    const query = c.req.query();
    const page  = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const skip  = (page - 1) * limit;

    const where = { userId: user.id };

    const [orders, total] = await Promise.all([
        prisma.storeOrder.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
            select: {
                id: true,
                orderNumber: true,
                paymentStatus: true,
                orderStatus: true,
                paymentMethod: true,
                totalAmount: true,
                cancelRequest: true,
                createdAt: true,
                shipment: {
                    select: {
                        provider: true,
                        trackingNumber: true,
                        trackingUrl: true,
                        status: true,
                    },
                },
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
        prisma.storeOrder.count({ where }),
    ]);

    return c.json({
        orders,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
}

export async function getStoreOrderById(c: Context) {
    const user = c.get("user") as { id: string; role: string };
    const { id } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { id },
        include: {
            items: true,
            shipment: true,
            statusLogs: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
        },
    });

    if (!order) return c.json(errors.NOT_FOUND, 404);

    if (order.userId !== user.id && user.role !== "ADMIN") {
        return c.json(errors.FORBIDDEN, 403);
    }

    return c.json(order);
}

export async function trackStoreByToken(c: Context) {
    const { token } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { trackingToken: token },
        select: {
            id: true,
            orderNumber: true,
            paymentStatus: true,
            orderStatus: true,
            paymentMethod: true,
            totalAmount: true,
            shippingFee: true,
            discountAmount: true,
            createdAt: true,
            guestName: true,
            shipment: {
                select: {
                    provider: true,
                    trackingNumber: true,
                    trackingUrl: true,
                    status: true,
                    estimatedAt: true,
                },
            },
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

export async function cancelStoreByToken(c: Context) {
    const { token } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { cancelToken: token },
        include: { user: true },
    });

    if (!order) return c.json(errors.NOT_FOUND, 404);

    if (order.cancelTokenExpiresAt && order.cancelTokenExpiresAt < new Date()) {
        return c.json({ error: "Cancel token expired" }, 400);
    }

    // Sadece PENDING → direkt iptal
    // CONFIRMED ve sonrası → admin'e düşer
    const canCancel = order.orderStatus === "PENDING";
    if (!canCancel) {
        return c.json({ error: "Cannot cancel this order. Please contact admin." }, 400);
    }

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
            fromStatus: order.orderStatus,
            toStatus: "CANCELLED",
            note: "Token ile iptal edildi",
            changedBy: "SYSTEM",
        },
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

    return c.json({ success: true });
}

export async function requestStoreCancel(c: Context) {
    const user = c.get("user") as { id: string; email: string; name: string };
    const { id } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { id },
        include: { user: true },
    });
    if (!order) return c.json(errors.NOT_FOUND, 404);

    if (order.userId !== user.id) return c.json(errors.FORBIDDEN, 403);

    // Sadece PENDING → direkt iptal
    // CONFIRMED ve sonrası → admin'e düşer
    const canCancelDirectly = order.orderStatus === "PENDING";

    if (canCancelDirectly) {
        await prisma.storeOrder.update({
            where: { id },
            data: { paymentStatus: "CANCELLED", orderStatus: "CANCELLED" },
        });

        await prisma.orderStatusLog.create({
            data: {
                orderId: order.id,
                fromStatus: order.orderStatus,
                toStatus: "CANCELLED",
                note: "Kullanıcı tarafından iptal edildi",
                changedBy: user.id,
            },
        });

        await sendEmail({
            to: user.email,
            subject: `Siparişiniz İptal Edildi — ${order.orderNumber}`,
            html: buildOrderCancelledEmail({ orderNumber: order.orderNumber, name: user.name }),
        });

        return c.json({ success: true });
    }

    // PREPARING ve sonrası → admin'e iptal talebi düşer
    const phone = order.user?.phone || order.guestPhone || "";
    const email = order.user?.email || order.guestEmail || user.email;

    await prisma.storeOrder.update({
        where: { id },
        data: {
            cancelRequest: true,
            cancelRequestedAt: new Date(),
            isAdminRead: false, // admin panelde kırmızı badge
        },
    });

    await prisma.activityLog.create({
        data: {
            actorId: user.id,
            actorName: user.name,
            actorType: "DONOR",
            action: "ORDER_CANCEL_REQUESTED",
            targetType: "StoreOrder",
            targetId: order.id,
            targetName: order.orderNumber,
            message: `${order.orderNumber} numaralı mağaza siparişi için iptal talebi oluşturuldu`,
            metadata: {
                phone,
                email,
                paymentMethod: order.paymentMethod,
                orderStatus: order.orderStatus,
                note: order.paymentMethod === "EFT"
                    ? "EFT ödemesi yapıldı — müşteriyi arayın ve manuel iade edin"
                    : "PayTR ödemesi — /api/paytr/refund ile iade başlatın",
            },
        },
    });

    await notifyAdmins({
        type: "SYSTEM",
        title: "İptal Talebi",
        message: `${order.orderNumber} numaralı mağaza siparişi için iptal talebi geldi`,
        link: `/admin/store/orders/${order.id}`,
    });

    return c.json({ message: "Cancel request submitted" });
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export async function getAllStoreOrders(c: Context) {
    const query = c.req.query();
    const page  = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip  = (page - 1) * limit;

    // Filtreler
    const paymentStatus = query.paymentStatus as string | undefined;
    const orderStatus   = query.orderStatus   as string | undefined;
    const paymentMethod = query.paymentMethod as string | undefined;
    const cancelRequest = query.cancelRequest === "true" ? true : query.cancelRequest === "false" ? false : undefined;
    const search        = query.search?.trim();
    const dateFrom      = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo        = query.dateTo   ? new Date(query.dateTo)   : undefined;

    const where: any = {
        // PAYTR siparişleri callback gelene kadar admin'e düşmesin
        ...(paymentStatus ? { paymentStatus } : { paymentStatus: { not: "PENDING_PAYMENT" } }),
        ...(orderStatus    && { orderStatus }),
        ...(paymentMethod  && { paymentMethod }),
        ...(cancelRequest  !== undefined && { cancelRequest }),
        ...((dateFrom || dateTo) && {
            createdAt: {
                ...(dateFrom && { gte: dateFrom }),
                ...(dateTo   && { lte: dateTo }),
            },
        }),
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
        prisma.storeOrder.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
            select: {
                id: true,
                orderNumber: true,
                paymentStatus: true,
                orderStatus: true,
                paymentMethod: true,
                totalAmount: true,
                shippingFee: true,
                discountAmount: true,
                isAdminRead: true,
                cancelRequest: true,
                cancelRequestedAt: true,
                guestName: true,
                guestEmail: true,
                guestPhone: true,
                guestAddress: true,
                guestCity: true,
                receiptUrl: true,
                couponCode: true,
                createdAt: true,
                user: { select: { id: true, name: true, email: true, phone: true } },
                shipment: { select: { provider: true, trackingNumber: true, status: true } },
                items: { select: { productName: true, quantity: true, unitPrice: true } },
            },
        }),
        prisma.storeOrder.count({ where }),
    ]);

    return c.json({
        orders,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
}

export async function updateStoreOrderStatus(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { id },
        include: { items: true, user: true },
    });
    if (!order) return c.json(errors.NOT_FOUND, 404);

    const body = await c.req.json() as {
        orderStatus: "CONFIRMED" | "PREPARING" | "READY_TO_SHIP" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
        note?: string;
    };

    const updated = await prisma.storeOrder.update({
        where: { id },
        data: {
            orderStatus: body.orderStatus,
            isAdminRead: true,
            ...(body.orderStatus === "CONFIRMED" && { paymentStatus: "PAID" }),
            ...(body.orderStatus === "REFUNDED" && { paymentStatus: "REFUNDED" }),
        },
    });

    await prisma.orderStatusLog.create({
        data: {
            orderId: order.id,
            fromStatus: order.orderStatus,
            toStatus: body.orderStatus,
            note: body.note,
            changedBy: admin.id,
        },
    });

    // CONFIRMED → stok düş
    if (body.orderStatus === "CONFIRMED") {
        for (const item of order.items) {
            await prisma.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: item.quantity } },
            });
        }
    }

    if (body.orderStatus === "CANCELLED" && order.userId) {
        await prisma.notification.create({
            data: {
                userId: order.userId,
                type: "ORDER_STATUS",
                title: "Siparişiniz İptal Edildi",
                message: `${order.orderNumber} numaralı siparişiniz iptal edildi`,
                link: `/orders/store/${order.id}`,
            },
        });
    }

    if (body.orderStatus === "REFUNDED" && order.userId) {
        await prisma.notification.create({
            data: {
                userId: order.userId,
                type: "ORDER_STATUS",
                title: "Siparişiniz İade Edildi",
                message: `${order.orderNumber} numaralı siparişiniz iade edildi`,
                link: `/orders/store/${order.id}`,
            },
        });
    }

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: `STORE_ORDER_${body.orderStatus}`,
            targetType: "StoreOrder",
            targetId: order.id,
            targetName: order.orderNumber,
            message: `${order.orderNumber} numaralı sipariş durumu ${body.orderStatus} olarak güncellendi`,
        },
    });

    return c.json(updated);
}

export async function addShipment(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { id },
        include: { user: true },
    });
    if (!order) return c.json(errors.NOT_FOUND, 404);

    const body = await c.req.json() as {
        provider: string;
        trackingNumber: string;
        trackingUrl?: string;
        estimatedAt?: string;
    };

    // Mevcut kargo varsa güncelle, yoksa oluştur
    const shipment = await prisma.shipment.upsert({
        where: { storeOrderId: id },
        create: {
            storeOrderId: id,
            provider: body.provider,
            trackingNumber: body.trackingNumber,
            trackingUrl: body.trackingUrl,
            estimatedAt: body.estimatedAt ? new Date(body.estimatedAt) : null,
            status: "IN_TRANSIT",
        },
        update: {
            provider: body.provider,
            trackingNumber: body.trackingNumber,
            trackingUrl: body.trackingUrl,
            estimatedAt: body.estimatedAt ? new Date(body.estimatedAt) : null,
            status: "IN_TRANSIT",
        },
    });

    // Sipariş durumunu SHIPPED yap
    await prisma.storeOrder.update({
        where: { id },
        data: { orderStatus: "SHIPPED" },
    });

    await prisma.orderStatusLog.create({
        data: {
            orderId: order.id,
            fromStatus: order.orderStatus,
            toStatus: "SHIPPED",
            note: `${body.provider} — ${body.trackingNumber}`,
            changedBy: admin.id,
        },
    });

    // Kargo maili gönder
    const email = order.user?.email || order.guestEmail || "";
    const name = order.user?.name || order.guestName || "Müşteri";
    if (email && order.trackingToken) {
        await sendEmail({
            to: email,
            subject: `Siparişiniz Yola Çıktı — ${order.orderNumber}`,
            html: buildShippingEmail({
                orderNumber: order.orderNumber,
                name,
                provider: body.provider,
                trackingNumber: body.trackingNumber,
                trackingUrl: body.trackingUrl,
                trackingToken: order.trackingToken,
                frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
            }),
        });
    }

    if (order.userId) {
        await prisma.notification.create({
            data: {
                userId: order.userId,
                type: "ORDER_STATUS",
                title: "Siparişiniz Kargoya Verildi! 📦",
                message: `${order.orderNumber} numaralı siparişiniz ${body.provider} ile kargoya verildi. Takip no: ${body.trackingNumber}`,
                link: `/track?token=${order.trackingToken}`,
            },
        });
    }

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "STORE_ORDER_SHIPPED",
            targetType: "StoreOrder",
            targetId: order.id,
            targetName: order.orderNumber,
            message: activityMessages.STORE_ORDER_SHIPPED(order.orderNumber),
        },
    });

    return c.json(shipment);
}

export async function approveStoreCancel(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { id },
        include: { user: true },
    });
    if (!order) return c.json(errors.NOT_FOUND, 404);
    if (!order.cancelRequest) return c.json(errors.BAD_REQUEST, 400);

    await prisma.storeOrder.update({
        where: { id },
        data: {
            paymentStatus: "CANCELLED",
            orderStatus: "CANCELLED",
            cancelRequest: false,
        },
    });

    await prisma.orderStatusLog.create({
        data: {
            orderId: order.id,
            fromStatus: order.orderStatus,
            toStatus: "CANCELLED",
            note: "Admin tarafından iptal onaylandı",
            changedBy: admin.id,
        },
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

    if (order.userId) {
        await prisma.notification.create({
            data: {
                userId: order.userId,
                type: "ORDER_STATUS",
                title: "İptal Talebiniz Onaylandı",
                message: `${order.orderNumber} numaralı siparişinizin iptal talebi onaylandı`,
                link: `/orders/store/${order.id}`,
            },
        });
    }

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "ORDER_CANCEL_APPROVED",
            targetType: "StoreOrder",
            targetId: order.id,
            targetName: order.orderNumber,
            message: `${order.orderNumber} numaralı mağaza siparişi iptal talebi onaylandı`,
        },
    });

    return c.json({ success: true });
}

export async function adminDeleteStoreOrder(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const order = await prisma.storeOrder.findFirst({ where: { id } });
    if (!order) return c.json(errors.NOT_FOUND, 404);

    await prisma.storeOrder.delete({ where: { id } });

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "STORE_ORDER_DELETED",
            targetType: "StoreOrder",
            targetId: id,
            targetName: order.orderNumber,
            message: activityMessages.STORE_ORDER_DELETED(order.orderNumber),
        },
    });

    return c.json({ success: true });
}

// ─── ADMIN — ÜRÜN CRUD ────────────────────────────────────────────────────────

export async function adminGetAllProducts(c: Context) {
    const products = await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            category: { select: { id: true, name: true } },
            _count: { select: { storeOrderItems: true, reviews: true } },
        },
    });

    return c.json(products);
}

export async function adminCreateProduct(c: Context) {
    const admin = c.get("user") as { id: string; name: string };

    const body = await c.req.json() as {
        name: string;
        slug: string;
        description?: string;
        imageUrl?: string;
        galleryImageUrls?: string[];
        price: number;
        comparePrice?: number;
        stock?: number;
        trackStock?: boolean;
        showInStore?: boolean;
        showInDonation?: boolean;
        isActive?: boolean;
        isFeatured?: boolean;
        sortOrder?: number;
        productionDate?: string;
        expiryDate?: string;
        nutritionValues?: object;
        weightKg?: number;
        brand?: string;
        tags?: string[];
        sizes?: string[];
        colors?: string[];
        materials?: string[];
        categoryId?: string;
    };

    const existing = await prisma.product.findFirst({ where: { slug: body.slug } });
    if (existing) return c.json(errors.CONFLICT, 409);

    const product = await prisma.product.create({
        data: {
            ...body,
            productionDate: body.productionDate ? new Date(body.productionDate) : null,
            expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        },
    });

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "PRODUCT_CREATED",
            targetType: "Product",
            targetId: product.id,
            targetName: product.name,
            message: activityMessages.PRODUCT_CREATED(product.name),
        },
    });

    return c.json(product, 201);
}

export async function adminUpdateProduct(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const product = await prisma.product.findFirst({ where: { id } });
    if (!product) return c.json(errors.NOT_FOUND, 404);

    const body = await c.req.json() as Partial<{
        name: string;
        slug: string;
        description: string;
        imageUrl: string;
        galleryImageUrls: string[];
        price: number;
        comparePrice: number;
        stock: number;
        trackStock: boolean;
        showInStore: boolean;
        showInDonation: boolean;
        isActive: boolean;
        isFeatured: boolean;
        sortOrder: number;
        productionDate: string;
        expiryDate: string;
        nutritionValues: object;
        weightKg: number;
        brand: string;
        tags: string[];
        sizes: string[];
        colors: string[];
        materials: string[];
        categoryId: string;
    }>;

    const updated = await prisma.product.update({
        where: { id },
        data: {
            ...body,
            productionDate: body.productionDate ? new Date(body.productionDate) : undefined,
            expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
        },
    });

    // Stok gelince stockAlert tetikle
    if (body.stock && body.stock > 0 && product.stock === 0) {
        await triggerStockAlerts(id, product.name);
    }

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "PRODUCT_UPDATED",
            targetType: "Product",
            targetId: product.id,
            targetName: product.name,
            message: activityMessages.PRODUCT_UPDATED(product.name),
        },
    });

    return c.json(updated);
}

export async function adminDeleteProduct(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const product = await prisma.product.findFirst({ where: { id } });
    if (!product) return c.json(errors.NOT_FOUND, 404);

    await prisma.product.delete({ where: { id } });

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "PRODUCT_DELETED",
            targetType: "Product",
            targetId: product.id,
            targetName: product.name,
            message: activityMessages.PRODUCT_DELETED(product.name),
        },
    });

    return c.json({ success: true });
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

// ─── ÜRÜN YORUMLARI ───────────────────────────────────────────────────────────

export async function getProductReviews(c: Context) {
    const { id } = c.req.param();
    const query = c.req.query();
    const page  = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const skip  = (page - 1) * limit;

    const product = await prisma.product.findFirst({ where: { id } });
    if (!product) return c.json(errors.NOT_FOUND, 404);

    const where = { productId: id, isApproved: true };

    const [reviews, total, stats, distribution] = await Promise.all([
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
                createdAt: true,
                user: { select: { name: true, image: true } },
            },
        }),
        prisma.productReview.count({ where }),
        prisma.productReview.aggregate({
            where,
            _avg: { rating: true },
            _count: { rating: true },
        }),
        prisma.productReview.groupBy({
            by: ["rating"],
            where,
            _count: { rating: true },
            orderBy: { rating: "desc" },
        }),
    ]);

    return c.json({
        reviews,
        stats: {
            average: stats._avg.rating ? Number(stats._avg.rating.toFixed(1)) : 0,
            total: stats._count.rating,
            distribution: [5, 4, 3, 2, 1].map((star) => ({
                star,
                count: distribution.find((d) => d.rating === star)?._count.rating ?? 0,
            })),
        },
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
}

export async function addReview(c: Context) {
    const user = c.get("user") as { id: string };
    const { id } = c.req.param();

    const product = await prisma.product.findFirst({
        where: { id, showInStore: true, isActive: true },
    });
    if (!product) return c.json(errors.NOT_FOUND, 404);

    const existing = await prisma.productReview.findFirst({
        where: { productId: id, userId: user.id },
    });
    if (existing) return c.json({ error: "Bu ürüne zaten yorum yaptınız" }, 409);

    // Satın almış mı? — PAID sipariş içinde bu ürün olmalı
    const hasPurchased = await prisma.storeOrderItem.findFirst({
        where: {
            productId: id,
            order: { userId: user.id, paymentStatus: "PAID" },
        },
    });
    if (!hasPurchased) {
        return c.json({ error: "Yorum yapabilmek için önce bu ürünü satın almanız gerekiyor" }, 403);
    }

    const body = await c.req.json() as { rating: number; title?: string; comment?: string };

    if (!body.rating || body.rating < 1 || body.rating > 5) {
        return c.json({ error: "Puan 1-5 arasında olmalıdır" }, 400);
    }

    const review = await prisma.productReview.create({
        data: {
            productId: id,
            userId: user.id,
            rating: Math.round(body.rating),
            title:   body.title?.trim()   || null,
            comment: body.comment?.trim() || null,
            isApproved: true, // otomatik onay — admin bilgilendirilir
        },
        select: {
            id: true, rating: true, title: true,
            comment: true, isApproved: true, createdAt: true,
        },
    });

    await notifyAdmins({
        type: "SYSTEM",
        title: "Yeni Ürün Yorumu",
        message: `${product.name} ürününe yeni bir yorum yapıldı`,
        link: `/admin/reviews?productId=${id}`,
    });

    return c.json(review, 201);
}

export async function deleteMyReview(c: Context) {
    const user = c.get("user") as { id: string };
    const { id } = c.req.param();

    const review = await prisma.productReview.findFirst({
        where: { id, userId: user.id },
    });
    if (!review) return c.json(errors.NOT_FOUND, 404);

    await prisma.productReview.delete({ where: { id } });
    return c.json({ success: true });
}

// ─── EFT ONAY / RED ───────────────────────────────────────────────────────────

export async function approveStoreEft(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { id },
        include: { items: true, user: true },
    });
    if (!order) return c.json(errors.NOT_FOUND, 404);
    if (order.paymentMethod !== "EFT") return c.json({ error: "Bu sipariş EFT ile ödenmedi" }, 400);
    if (order.paymentStatus !== "WAITING_APPROVAL") return c.json({ error: "Onay bekleyen EFT siparişi değil" }, 400);

    await prisma.storeOrder.update({
        where: { id },
        data: { paymentStatus: "PAID", orderStatus: "CONFIRMED", isAdminRead: true, expiresAt: null },
    });

    // Stok düş
    for (const item of order.items) {
        await prisma.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
        });
    }

    await prisma.orderStatusLog.create({
        data: {
            orderId: order.id,
            fromStatus: "PENDING",
            toStatus: "CONFIRMED",
            note: "EFT ödemesi admin tarafından onaylandı",
            changedBy: admin.id,
        },
    });

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "STORE_ORDER_EFT_APPROVED",
            targetType: "StoreOrder",
            targetId: order.id,
            targetName: order.orderNumber,
            message: `${order.orderNumber} numaralı mağaza siparişi EFT ödemesi onaylandı`,
        },
    });

    if (order.userId) {
        await prisma.notification.create({
            data: {
                userId: order.userId,
                type: "ORDER_STATUS",
                title: "Ödemeniz Onaylandı",
                message: `${order.orderNumber} numaralı siparişinizin EFT ödemesi onaylandı`,
                link: `/orders/store/${order.id}`,
            },
        });
    }

    return c.json({ success: true });
}

export async function rejectStoreEft(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const order = await prisma.storeOrder.findFirst({
        where: { id },
        include: { user: true },
    });
    if (!order) return c.json(errors.NOT_FOUND, 404);
    if (order.paymentMethod !== "EFT") return c.json({ error: "Bu sipariş EFT ile ödenmedi" }, 400);
    if (order.paymentStatus !== "WAITING_APPROVAL") return c.json({ error: "Onay bekleyen EFT siparişi değil" }, 400);

    const body = await c.req.json().catch(() => ({})) as { reason?: string };

    await prisma.storeOrder.update({
        where: { id },
        data: { paymentStatus: "CANCELLED", orderStatus: "CANCELLED", isAdminRead: true },
    });

    await prisma.orderStatusLog.create({
        data: {
            orderId: order.id,
            fromStatus: "PENDING",
            toStatus: "CANCELLED",
            note: body.reason ? `EFT reddedildi: ${body.reason}` : "EFT ödemesi admin tarafından reddedildi",
            changedBy: admin.id,
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
                reason: body.reason || "EFT ödemesi doğrulanamadı",
            }),
        });
    }

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "STORE_ORDER_EFT_REJECTED",
            targetType: "StoreOrder",
            targetId: order.id,
            targetName: order.orderNumber,
            message: `${order.orderNumber} numaralı mağaza siparişi EFT ödemesi reddedildi`,
        },
    });

    return c.json({ success: true });
}

// ─── DEKONT UPLOAD ─────────────────────────────────────────────────────────────

export async function uploadStoreReceipt(c: Context) {
    const user = c.get("user") as { id: string } | null;
    const { orderNumber } = c.req.param();

    const order = await prisma.storeOrder.findFirst({ where: { orderNumber } });
    if (!order) return c.json(errors.NOT_FOUND, 404);

    // Yetki: giriş yapmış kullanıcı kendi siparişi || trackingToken ile guest
    const body = await c.req.json() as { receiptUrl: string; trackingToken?: string };

    const isOwner = user && order.userId === user.id;
    const isGuest = !order.userId && body.trackingToken && order.trackingToken === body.trackingToken;

    if (!isOwner && !isGuest) return c.json(errors.FORBIDDEN, 403);
    if (!body.receiptUrl) return c.json(errors.BAD_REQUEST, 400);

    await prisma.storeOrder.update({
        where: { id: order.id },
        data: { receiptUrl: body.receiptUrl, isAdminRead: false, expiresAt: null },
    });

    await notifyAdmins({
        type: "PAYMENT_RECEIVED",
        title: "Dekont Yüklendi",
        message: `${orderNumber} numaralı mağaza siparişi için dekont yüklendi`,
        link: `/admin/store/orders/${order.id}`,
    });

    return c.json({ success: true });
}

// ─── STOK UYARISI TETİKLE ─────────────────────────────────────────────────────

async function triggerStockAlerts(productId: string, productName: string) {
    const alerts = await prisma.stockAlert.findMany({
        where: { productId, notified: false },
    });

    for (const alert of alerts) {
        // Üye ise bildirim gönder
        if (alert.userId) {
            await prisma.notification.create({
                data: {
                    userId: alert.userId,
                    type: "STOCK_AVAILABLE",
                    title: "Stok Geldi!",
                    message: `${productName} tekrar stokta!`,
                    link: `/store/products/${productId}`,
                },
            });
        }

        // Mail gönder
        await sendEmail({
            to: alert.email,
            subject: `${productName} Tekrar Stokta!`,
            html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;">
          <h2>🎉 ${productName} Tekrar Stokta!</h2>
          <p>Stok gelince haber vermemizi istediğiniz ürün tekrar mevcut.</p>
          <a href="${process.env.FRONTEND_URL}/store/products/${productId}"
             style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">
            Ürüne Git →
          </a>
        </div>
      `,
        });

        // Alert'i güncelle
        await prisma.stockAlert.update({
            where: { id: alert.id },
            data: { notified: true, notifiedAt: new Date() },
        });
    }
}

// ─── ADMIN — KARGO LİSTESİ ────────────────────────────────────────────────────

export async function adminListShipments(c: Context) {
    const query = c.req.query();
    const page  = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip  = (page - 1) * limit;

    const status = query.status as string | undefined;
    const search = query.search?.trim();

    const where: any = {
        ...(status && { status }),
        ...(search && {
            OR: [
                { trackingNumber: { contains: search, mode: "insensitive" } },
                { provider:       { contains: search, mode: "insensitive" } },
                { storeOrder: { orderNumber: { contains: search, mode: "insensitive" } } },
                { storeOrder: { guestEmail:  { contains: search, mode: "insensitive" } } },
                { storeOrder: { user: { email: { contains: search, mode: "insensitive" } } } },
            ],
        }),
    };

    const [shipments, total] = await Promise.all([
        prisma.shipment.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            skip,
            take: limit,
            include: {
                storeOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        guestName: true,
                        guestEmail: true,
                        user: { select: { id: true, name: true, email: true, phone: true } },
                    },
                },
            },
        }),
        prisma.shipment.count({ where }),
    ]);

    return c.json({
        shipments,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
}

export async function adminUpdateShipment(c: Context) {
    const admin = c.get("user") as { id: string; name: string };
    const { id } = c.req.param();

    const existing = await prisma.shipment.findFirst({
        where: { id },
        include: { storeOrder: { include: { user: true } } },
    });
    if (!existing) return c.json(errors.NOT_FOUND, 404);

    const body = await c.req.json() as {
        provider?: string;
        trackingNumber?: string;
        trackingUrl?: string | null;
        status?: "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RETURNED";
        estimatedAt?: string | null;
    };

    const updated = await prisma.shipment.update({
        where: { id },
        data: {
            ...(body.provider       !== undefined && { provider: body.provider }),
            ...(body.trackingNumber !== undefined && { trackingNumber: body.trackingNumber }),
            ...(body.trackingUrl    !== undefined && { trackingUrl: body.trackingUrl }),
            ...(body.status         !== undefined && { status: body.status }),
            ...(body.estimatedAt    !== undefined && {
                estimatedAt: body.estimatedAt ? new Date(body.estimatedAt) : null,
            }),
            ...(body.status === "DELIVERED" && { deliveredAt: new Date() }),
        },
    });

    // Sipariş durumu senkronizasyonu
    const order = existing.storeOrder;
    if (body.status === "DELIVERED" && order.orderStatus !== "DELIVERED") {
        await prisma.storeOrder.update({
            where: { id: order.id },
            data: { orderStatus: "DELIVERED" },
        });
        await prisma.orderStatusLog.create({
            data: {
                orderId: order.id,
                fromStatus: order.orderStatus,
                toStatus: "DELIVERED",
                note: "Kargo teslim edildi",
                changedBy: admin.id,
            },
        });
        if (order.userId) {
            await prisma.notification.create({
                data: {
                    userId: order.userId,
                    type: "ORDER_STATUS",
                    title: "Siparişiniz Teslim Edildi ✅",
                    message: `${order.orderNumber} numaralı siparişiniz teslim edildi`,
                    link: `/orders/store/${order.id}`,
                },
            });
        }
    }

    await prisma.activityLog.create({
        data: {
            actorId: admin.id,
            actorName: admin.name,
            actorType: "ADMIN",
            action: "SHIPMENT_UPDATED",
            targetType: "Shipment",
            targetId: updated.id,
            targetName: updated.trackingNumber,
            message: `${order.orderNumber} kargo bilgisi güncellendi`,
        },
    });

    return c.json(updated);
}