export const activityMessages = {
  // ─── BARINAK ────────────────────────────────────────────────────────────────
  SHELTER_APPROVED:     (name: string) => `${name} barınağı onaylandı`,
  SHELTER_REJECTED:     (name: string) => `${name} barınağı reddedildi`,
  SHELTER_DEACTIVATED:  (name: string) => `${name} barınağı pasife alındı`,
  SHELTER_DELETED:      (name: string) => `${name} barınağı silindi`,

  // ─── KAMPANYA ───────────────────────────────────────────────────────────────
  CAMPAIGN_CREATED:     (name: string) => `${name} kampanyası oluşturuldu`,
  CAMPAIGN_UPDATED:     (name: string) => `${name} kampanyası güncellendi`,
  CAMPAIGN_ACTIVATED:   (name: string) => `${name} kampanyası aktive edildi`,
  CAMPAIGN_DEACTIVATED: (name: string) => `${name} kampanyası pasife alındı`,
  CAMPAIGN_FEATURED:    (name: string) => `${name} kampanyası öne çıkarıldı`,
  CAMPAIGN_UNFEATURED:  (name: string) => `${name} kampanyasının öne çıkarması kaldırıldı`,
  CAMPAIGN_DELETED:     (name: string) => `${name} kampanyası silindi`,

  // ─── BAĞIŞ SİPARİŞİ ─────────────────────────────────────────────────────────
  ORDER_PLACED:            (number: string) => `${number} numaralı bağış siparişi oluşturuldu`,
  ORDER_PAID:              (number: string) => `${number} numaralı bağış siparişi ödendi`,
  ORDER_CANCELLED:         (number: string) => `${number} numaralı bağış siparişi iptal edildi`,
  ORDER_CANCEL_REQUESTED:  (number: string) => `${number} numaralı bağış siparişi için iptal talebi gönderildi`,
  ORDER_CANCEL_APPROVED:   (number: string) => `${number} numaralı bağış siparişinin iptal talebi onaylandı`,
  ORDER_DELETED:           (number: string) => `${number} numaralı bağış siparişi silindi`,

  // ─── MAĞAZA SİPARİŞİ ────────────────────────────────────────────────────────
  STORE_ORDER_PLACED:   (number: string) => `${number} numaralı sipariş oluşturuldu`,
  STORE_ORDER_CONFIRMED:(number: string) => `${number} numaralı sipariş onaylandı`,
  STORE_ORDER_SHIPPED:  (number: string) => `${number} numaralı sipariş kargoya verildi`,
  STORE_ORDER_DELIVERED:(number: string) => `${number} numaralı sipariş teslim edildi`,
  STORE_ORDER_CANCELLED:(number: string) => `${number} numaralı sipariş iptal edildi`,
  STORE_ORDER_REFUNDED: (number: string) => `${number} numaralı sipariş iade edildi`,
  STORE_ORDER_DELETED:  (number: string) => `${number} numaralı mağaza siparişi silindi`,

  // ─── KULLANICI ──────────────────────────────────────────────────────────────
  USER_ROLE_CHANGED:    (name: string, role: string) => `${name} kullanıcısının rolü ${role} olarak değiştirildi`,
  USER_BANNED:          (name: string) => `${name} kullanıcısı engellendi`,
  USER_DELETED:         (name: string) => `${name} kullanıcısı silindi`,

  // ─── ÜRÜN ───────────────────────────────────────────────────────────────────
  PRODUCT_CREATED:      (name: string) => `${name} ürünü oluşturuldu`,
  PRODUCT_UPDATED:      (name: string) => `${name} ürünü güncellendi`,
  PRODUCT_DELETED:      (name: string) => `${name} ürünü silindi`,

  // ─── HİKAYE ─────────────────────────────────────────────────────────────────
  STORY_CREATED:        (name: string) => `${name} barınağı yeni bir hikaye paylaştı`,
  STORY_DELETED:        (name: string) => `${name} barınağının hikayesi silindi`,
} as const;

// Action tipleri — ActivityLog.action alanında kullanılır
export type ActivityAction = keyof typeof activityMessages;