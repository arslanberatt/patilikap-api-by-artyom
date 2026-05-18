// src/lib/openapi.ts
// Patilikap API — OpenAPI 3.0 dökümanı

export const openApiDoc = {
    openapi: "3.0.0",
    info: {
        title: "Patilikap API",
        version: "1.0.0",
        description: "Patilikap hayvan barınağı patili platformu API dokümantasyonu",
    },
    servers: [
        {
            url: process.env.APP_URL || "http://localhost:3001",
            description: process.env.NODE_ENV === "production" ? "Production" : "Development",
        },
    ],
    tags: [
        { name: "Auth", description: "Kimlik doğrulama (Better Auth)" },
        { name: "Users", description: "Kullanıcı yönetimi" },
        { name: "Shelters", description: "Barınak yönetimi" },
        { name: "Campaigns", description: "Kampanya yönetimi" },
        { name: "Orders", description: "Patili siparişleri" },
        { name: "Store", description: "Mağaza ürünleri ve siparişleri" },
        { name: "Stories", description: "Barınak hikayeleri" },
        { name: "Notifications", description: "Bildirimler" },
        { name: "PayTR", description: "Ödeme sistemi" },
        { name: "Upload", description: "Dosya yükleme (Bunny CDN)" },
        { name: "Admin", description: "Admin paneli" },
    ],
    components: {
        securitySchemes: {
            cookieAuth: {
                type: "apiKey",
                in: "cookie",
                name: "better-auth.session_token",
                description: "Better Auth session cookie",
            },
        },
        schemas: {
            Error: {
                type: "object",
                properties: {
                    error: { type: "string", example: "Not Found" },
                },
            },
            ValidationError: {
                type: "object",
                properties: {
                    error: { type: "string", example: "Validation failed" },
                    issues: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                path: { type: "string" },
                                message: { type: "string" },
                                code: { type: "string" },
                            },
                        },
                    },
                },
            },
            Pagination: {
                type: "object",
                properties: {
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                    totalPages: { type: "integer" },
                },
            },
        },
    },
    paths: {
        // ─── HEALTH ───────────────────────────────────────────────────────────────
        "/health": {
            get: {
                summary: "Sunucu durumu",
                tags: ["Auth"],
                responses: {
                    200: { description: "Sunucu çalışıyor" },
                    503: { description: "DB bağlantısı yok" },
                },
            },
        },

        // ─── AUTH ─────────────────────────────────────────────────────────────────
        "/api/auth/sign-in/email": {
            post: {
                summary: "Email ile giriş",
                tags: ["Auth"],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["email", "password"],
                                properties: {
                                    email: { type: "string", format: "email" },
                                    password: { type: "string", minLength: 8 },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Giriş başarılı" },
                    401: { description: "Geçersiz kimlik bilgileri" },
                },
            },
        },
        "/api/auth/sign-up/email": {
            post: {
                summary: "Email ile kayıt",
                tags: ["Auth"],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["email", "password", "name"],
                                properties: {
                                    email: { type: "string", format: "email" },
                                    password: { type: "string", minLength: 8 },
                                    name: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: "Kayıt başarılı" },
                    400: { description: "Geçersiz veri" },
                },
            },
        },
        "/api/auth/sign-out": {
            post: {
                summary: "Çıkış",
                tags: ["Auth"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "Çıkış başarılı" } },
            },
        },

        // ─── USERS ────────────────────────────────────────────────────────────────
        "/api/users/me": {
            get: {
                summary: "Profil bilgisi",
                tags: ["Users"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "Kullanıcı bilgisi" }, 401: { description: "Unauthorized" } },
            },
            patch: {
                summary: "Profil güncelle",
                tags: ["Users"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    phone: { type: "string" },
                                    image: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: "Güncellendi" } },
            },
        },
        "/api/users/complete-onboarding": {
            post: {
                summary: "Onboarding tamamla (rol seç)",
                tags: ["Users"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["role"],
                                properties: {
                                    role: { type: "string", enum: ["DONOR", "SHELTER"] },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: "Onboarding tamamlandı" } },
            },
        },
        "/api/users/me/addresses": {
            get: {
                summary: "Adres listesi",
                tags: ["Users"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "Adresler" } },
            },
            post: {
                summary: "Adres ekle",
                tags: ["Users"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["title", "fullName", "phone", "city", "district", "address"],
                                properties: {
                                    title: { type: "string" },
                                    fullName: { type: "string" },
                                    phone: { type: "string" },
                                    city: { type: "string" },
                                    district: { type: "string" },
                                    address: { type: "string" },
                                    zipCode: { type: "string" },
                                    isDefault: { type: "boolean" },
                                },
                            },
                        },
                    },
                },
                responses: { 201: { description: "Adres eklendi" } },
            },
        },

        // ─── SHELTERS ─────────────────────────────────────────────────────────────
        "/api/shelters": {
            get: {
                summary: "Onaylı barınak listesi",
                tags: ["Shelters"],
                responses: { 200: { description: "Barınaklar" } },
            },
            post: {
                summary: "Barınak başvurusu (SHELTER rolü)",
                tags: ["Shelters"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["name", "city", "district", "phone", "description"],
                                properties: {
                                    name: { type: "string" },
                                    city: { type: "string" },
                                    district: { type: "string" },
                                    phone: { type: "string" },
                                    description: { type: "string" },
                                    documentUrls: { type: "array", items: { type: "string" } },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Başvuru alındı" },
                    403: { description: "Forbidden" },
                    409: { description: "Conflict — bu isimde barınak var" },
                },
            },
        },
        "/api/shelters/{id}": {
            get: {
                summary: "Barınak detayı",
                tags: ["Shelters"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Barınak" }, 404: { description: "Not Found" } },
            },
            patch: {
                summary: "Barınak güncelle (sahip)",
                tags: ["Shelters"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Güncellendi" }, 403: { description: "Forbidden" } },
            },
        },
        "/api/shelters/{id}/approve": {
            post: {
                summary: "Barınak onayla (Admin)",
                tags: ["Shelters"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Onaylandı" }, 403: { description: "Forbidden" } },
            },
        },
        "/api/shelters/{id}/reject": {
            post: {
                summary: "Barınak reddet (Admin)",
                tags: ["Shelters"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Reddedildi" } },
            },
        },
        "/api/shelters/{id}/deactivate": {
            post: {
                summary: "Barınak pasife al (sahip)",
                tags: ["Shelters"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Pasife alındı" } },
            },
        },

        // ─── CAMPAIGNS ────────────────────────────────────────────────────────────
        "/api/campaigns": {
            get: {
                summary: "Aktif kampanya listesi",
                tags: ["Campaigns"],
                responses: { 200: { description: "Kampanyalar" } },
            },
            post: {
                summary: "Kampanya oluştur (Shelter)",
                tags: ["Campaigns"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["title"],
                                properties: {
                                    title: { type: "string" },
                                    story: { type: "string" },
                                    coverImageUrl: { type: "string" },
                                    autoRestartWhenFull: { type: "boolean" },
                                },
                            },
                        },
                    },
                },
                responses: { 201: { description: "Kampanya oluşturuldu" } },
            },
        },
        "/api/campaigns/{slug}": {
            get: {
                summary: "Kampanya detayı (slug ile)",
                tags: ["Campaigns"],
                parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Kampanya" }, 404: { description: "Not Found" } },
            },
        },
        "/api/campaigns/{id}/products": {
            get: {
                summary: "Kampanya ürünleri (progress ile)",
                tags: ["Campaigns"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Ürünler + targetStock + currentStock" } },
            },
            post: {
                summary: "Kampanyaya ürün ekle (Shelter/Admin)",
                tags: ["Campaigns"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["productId", "targetStock"],
                                properties: {
                                    productId: { type: "string" },
                                    targetStock: { type: "integer", minimum: 1 },
                                },
                            },
                        },
                    },
                },
                responses: { 201: { description: "Ürün eklendi" }, 409: { description: "Zaten eklenmiş" } },
            },
        },
        "/api/campaigns/{id}/share": {
            post: {
                summary: "Kampanya paylaşım sayacı artır",
                tags: ["Campaigns"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "{ success: true }" } },
            },
        },
        "/api/campaigns/{id}/feature": {
            post: {
                summary: "Kampanyayı öne çıkar/kaldır (Admin)",
                tags: ["Campaigns"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Toggle — öne çıkarıldı veya kaldırıldı" } },
            },
        },

        // ─── ORDERS ───────────────────────────────────────────────────────────────
        "/api/orders": {
            post: {
                summary: "Patili siparişi oluştur (misafir veya üye)",
                tags: ["Orders"],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["items", "paymentMethod", "name", "email", "phone", "address", "city", "userIp"],
                                properties: {
                                    items: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            required: ["campaignId", "productId", "quantity"],
                                            properties: {
                                                campaignId: { type: "string" },
                                                productId: { type: "string" },
                                                quantity: { type: "integer", minimum: 1 },
                                            },
                                        },
                                    },
                                    paymentMethod: { type: "string", enum: ["EFT", "PAYTR"] },
                                    name: { type: "string" },
                                    email: { type: "string", format: "email" },
                                    phone: { type: "string" },
                                    address: { type: "string" },
                                    city: { type: "string" },
                                    userIp: { type: "string" },
                                    receiptUrl: { type: "string", description: "EFT dekont URL (opsiyonel)" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: "Sipariş oluşturuldu. PayTR seçildiyse paytr objesi de döner" },
                    400: { description: "Geçersiz veri" },
                },
            },
        },
        "/api/orders/track/{token}": {
            get: {
                summary: "Token ile sipariş takibi (giriş gerekmez)",
                tags: ["Orders"],
                parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Sipariş durumu" }, 404: { description: "Not Found" } },
            },
        },
        "/api/orders/cancel/{token}": {
            post: {
                summary: "Token ile sipariş iptali (giriş gerekmez)",
                tags: ["Orders"],
                parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    200: { description: "İptal edildi, mail gönderildi" },
                    400: { description: "İptal edilemez (token expired veya PAID)" },
                },
            },
        },
        "/api/orders/my": {
            get: {
                summary: "Kendi siparişlerim",
                tags: ["Orders"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "Siparişler" } },
            },
        },
        "/api/orders/{id}/cancel-request": {
            post: {
                summary: "İptal talebi gönder",
                tags: ["Orders"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    200: { description: "WAITING_APPROVAL → direkt iptal, PAID → admin'e iletildi" },
                },
            },
        },

        // ─── STORE ────────────────────────────────────────────────────────────────
        "/api/store/products": {
            get: {
                summary: "Mağaza ürün listesi + filtreleme",
                tags: ["Store"],
                parameters: [
                    { name: "category", in: "query", schema: { type: "string" } },
                    { name: "brand", in: "query", schema: { type: "string" } },
                    { name: "minPrice", in: "query", schema: { type: "number" } },
                    { name: "maxPrice", in: "query", schema: { type: "number" } },
                    { name: "tag", in: "query", schema: { type: "string" } },
                    { name: "sortBy", in: "query", schema: { type: "string", enum: ["price_asc", "price_desc", "a_z", "z_a", "newest", "sortOrder"] } },
                    { name: "page", in: "query", schema: { type: "integer", default: 1 } },
                    { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
                ],
                responses: { 200: { description: "Ürünler + pagination" } },
            },
        },
        "/api/store/products/{slug}": {
            get: {
                summary: "Ürün detayı + yorumlar",
                tags: ["Store"],
                parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Ürün" }, 404: { description: "Not Found" } },
            },
        },
        "/api/store/products/{id}/stock-alert": {
            post: {
                summary: "Stok gelince haber ver",
                tags: ["Store"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["email"],
                                properties: { email: { type: "string", format: "email" } },
                            },
                        },
                    },
                },
                responses: { 201: { description: "Kayıt edildi" }, 409: { description: "Zaten kayıtlı" } },
            },
        },
        "/api/store/orders": {
            post: {
                summary: "Mağaza siparişi oluştur (misafir veya üye)",
                tags: ["Store"],
                responses: { 201: { description: "Sipariş oluşturuldu" } },
            },
        },
        "/api/store/orders/track/{token}": {
            get: {
                summary: "Token ile mağaza sipariş takibi (giriş gerekmez)",
                tags: ["Store"],
                parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Sipariş + kargo durumu" } },
            },
        },
        "/api/store/admin/orders/{id}/ship": {
            post: {
                summary: "Kargo bilgisi gir (Admin) — kargo maili gönderilir",
                tags: ["Store"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["provider", "trackingNumber"],
                                properties: {
                                    provider: { type: "string", example: "Yurtiçi" },
                                    trackingNumber: { type: "string" },
                                    trackingUrl: { type: "string" },
                                    estimatedAt: { type: "string", format: "date-time" },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: "Kargo eklendi, müşteriye mail gönderildi" } },
            },
        },

        // ─── STORIES ──────────────────────────────────────────────────────────────
        "/api/stories": {
            get: {
                summary: "Aktif + onaylı hikayeler",
                tags: ["Stories"],
                responses: { 200: { description: "Hikayeler" } },
            },
            post: {
                summary: "Hikaye paylaş (Shelter) — admin onayı gerekir",
                tags: ["Stories"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["type", "mediaUrl"],
                                properties: {
                                    type: { type: "string", enum: ["IMAGE", "VIDEO"] },
                                    mediaUrl: { type: "string" },
                                    caption: { type: "string", maxLength: 200 },
                                    link: { type: "string" },
                                    campaignId: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: { 201: { description: "Hikaye oluşturuldu, onay bekliyor" } },
            },
        },
        "/api/stories/pending": {
            get: {
                summary: "Onay bekleyen hikayeler (Admin)",
                tags: ["Stories"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "Bekleyen hikayeler" } },
            },
        },
        "/api/stories/{id}/approve": {
            post: {
                summary: "Hikaye onayla (Admin)",
                tags: ["Stories"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Onaylandı, shelter'a bildirim gönderildi" } },
            },
        },
        "/api/stories/{id}/reject": {
            post: {
                summary: "Hikaye reddet (Admin) — Bunny'den de silinir",
                tags: ["Stories"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "Reddedildi ve silindi" } },
            },
        },
        "/api/stories/{id}/view": {
            post: {
                summary: "Hikaye görüntüleme sayacı",
                tags: ["Stories"],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { 200: { description: "{ success: true }" } },
            },
        },

        // ─── NOTIFICATIONS ────────────────────────────────────────────────────────
        "/api/notifications": {
            get: {
                summary: "Son 50 bildirim",
                tags: ["Notifications"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "Bildirimler" } },
            },
            delete: {
                summary: "Tüm bildirimleri sil",
                tags: ["Notifications"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "Silindi" } },
            },
        },
        "/api/notifications/unread-count": {
            get: {
                summary: "Okunmamış bildirim sayısı (badge için)",
                tags: ["Notifications"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "{ count: number }" } },
            },
        },
        "/api/notifications/read-all": {
            patch: {
                summary: "Tümünü okundu işaretle",
                tags: ["Notifications"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "{ success: true }" } },
            },
        },

        // ─── UPLOAD ───────────────────────────────────────────────────────────────
        "/api/upload/image": {
            post: {
                summary: "Tek resim yükle — otomatik WebP dönüşümü",
                tags: ["Upload"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                required: ["file"],
                                properties: {
                                    file: { type: "string", format: "binary" },
                                    folder: { type: "string", enum: ["campaigns", "products", "shelters", "stories", "avatars", "store", "documents"] },
                                },
                            },
                        },
                    },
                },
                responses: { 201: { description: "{ url: string }" } },
            },
        },
        "/api/upload/images": {
            post: {
                summary: "Çoklu resim yükle (max 10)",
                tags: ["Upload"],
                security: [{ cookieAuth: [] }],
                responses: { 201: { description: "{ urls: string[] }" } },
            },
        },
        "/api/upload/document": {
            post: {
                summary: "PDF belge yükle (max 20MB)",
                tags: ["Upload"],
                security: [{ cookieAuth: [] }],
                responses: { 201: { description: "{ url: string }" } },
            },
        },
        "/api/upload/video": {
            post: {
                summary: "Video yükle — hikaye için (max 100MB)",
                tags: ["Upload"],
                security: [{ cookieAuth: [] }],
                responses: { 201: { description: "{ url: string }" } },
            },
        },

        // ─── PAYTR ────────────────────────────────────────────────────────────────
        "/api/paytr/token": {
            post: {
                summary: "PayTR iframe token al",
                tags: ["PayTR"],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["orderNumber", "email", "amount", "userName", "userPhone", "userAddress", "userCity", "userIp", "basketItems"],
                                properties: {
                                    orderNumber: { type: "string", example: "DO-123ABC" },
                                    email: { type: "string", format: "email" },
                                    amount: { type: "integer", description: "Kuruş cinsinden. 49.90 TL → 4990" },
                                    userName: { type: "string" },
                                    userPhone: { type: "string" },
                                    userAddress: { type: "string" },
                                    userCity: { type: "string" },
                                    userIp: { type: "string" },
                                    basketItems: {
                                        type: "array",
                                        description: "[[ürün adı, fiyat, adet], ...]",
                                        items: { type: "array" },
                                    },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: "{ token: string }" }, 500: { description: "PayTR hatası" } },
            },
        },
        "/api/paytr/callback": {
            post: {
                summary: "PayTR ödeme callback — sadece PayTR IP'lerinden",
                tags: ["PayTR"],
                description: "PayTR sunucusundan gelen ödeme sonucu. Hash doğrulama yapılır. DO- prefix bağış, SO- prefix mağaza siparişi.",
                responses: { 200: { description: "OK (düz metin)" }, 400: { description: "INVALID_HASH" } },
            },
        },
        "/api/paytr/refund": {
            post: {
                summary: "PayTR iade başlat (Admin)",
                tags: ["PayTR"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["orderId", "orderType"],
                                properties: {
                                    orderId: { type: "string" },
                                    orderType: { type: "string", enum: ["donation", "store"] },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: "İade başlatıldı" }, 400: { description: "Geçersiz sipariş" } },
            },
        },

        // ─── ADMIN ────────────────────────────────────────────────────────────────
        "/api/admin/dashboard": {
            get: {
                summary: "Dashboard istatistikleri",
                tags: ["Admin"],
                security: [{ cookieAuth: [] }],
                responses: { 200: { description: "Kullanıcı, barınak, kampanya, sipariş sayıları" } },
            },
        },
        "/api/admin/users": {
            get: {
                summary: "Kullanıcı listesi + filtreleme",
                tags: ["Admin"],
                security: [{ cookieAuth: [] }],
                parameters: [
                    { name: "role", in: "query", schema: { type: "string", enum: ["ADMIN", "SHELTER", "DONOR"] } },
                    { name: "page", in: "query", schema: { type: "integer", default: 1 } },
                    { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
                ],
                responses: { 200: { description: "Kullanıcılar + pagination" } },
            },
        },
        "/api/admin/users/{id}/role": {
            patch: {
                summary: "Kullanıcı rolü değiştir",
                tags: ["Admin"],
                security: [{ cookieAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["role"],
                                properties: { role: { type: "string", enum: ["ADMIN", "SHELTER", "DONOR"] } },
                            },
                        },
                    },
                },
                responses: { 200: { description: "Rol güncellendi" } },
            },
        },
        "/api/admin/config": {
            get: { summary: "Sistem ayarları", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 200: { description: "Config" } } },
            patch: { summary: "Sistem ayarlarını güncelle", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 200: { description: "Güncellendi" } } },
        },
        "/api/admin/cargo-rates": {
            get: { summary: "Kargo fiyat listesi", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 200: { description: "Kargo fiyatları" } } },
            post: {
                summary: "Kargo fiyatı ekle",
                tags: ["Admin"],
                security: [{ cookieAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["minKg", "price"],
                                properties: {
                                    minKg: { type: "number" },
                                    maxKg: { type: "number", description: "null = sınırsız (80+)" },
                                    price: { type: "number" },
                                    isActive: { type: "boolean" },
                                },
                            },
                        },
                    },
                },
                responses: { 201: { description: "Eklendi" } },
            },
        },
        "/api/admin/categories": {
            get: { summary: "Kategori listesi (alt kategorilerle)", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 200: { description: "Kategoriler" } } },
            post: { summary: "Kategori ekle", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 201: { description: "Eklendi" } } },
        },
        "/api/admin/coupons": {
            get: { summary: "Kupon listesi", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 200: { description: "Kuponlar" } } },
            post: { summary: "Kupon oluştur", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 201: { description: "Oluşturuldu" } } },
        },
        "/api/admin/hero-slides": {
            get: { summary: "Hero slide listesi", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 200: { description: "Slides" } } },
            post: { summary: "Hero slide ekle", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 201: { description: "Eklendi" } } },
        },
        "/api/admin/brands": {
            get: { summary: "Marka listesi", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 200: { description: "Markalar" } } },
            post: { summary: "Marka ekle", tags: ["Admin"], security: [{ cookieAuth: [] }], responses: { 201: { description: "Eklendi" } } },
        },
        "/api/admin/logs": {
            get: {
                summary: "Aktivite logları + filtreleme",
                tags: ["Admin"],
                security: [{ cookieAuth: [] }],
                parameters: [
                    { name: "actorType", in: "query", schema: { type: "string", enum: ["ADMIN", "SHELTER", "DONOR", "SYSTEM"] } },
                    { name: "targetType", in: "query", schema: { type: "string" } },
                    { name: "action", in: "query", schema: { type: "string" } },
                    { name: "page", in: "query", schema: { type: "integer", default: 1 } },
                ],
                responses: { 200: { description: "Loglar + pagination" } },
            },
        },
    },
};