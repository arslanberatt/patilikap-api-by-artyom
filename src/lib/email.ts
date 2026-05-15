// src/lib/email.ts
import nodemailer from "nodemailer";
import { logger } from "./logger.js";

// ─── TRANSPORTER ──────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    // Shared hosting sertifikaları çoğunlukla custom domain'i kapsamaz
    rejectUnauthorized: false,
  },
});

// ─── TİPLER ───────────────────────────────────────────────────────────────────

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

// ─── GÖNDERICI ────────────────────────────────────────────────────────────────

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "Patilikap <info@patilikap.com>",
      to,
      subject,
      html,
    });
    logger.info(`Mail gönderildi → ${to}`);
    return true;
  } catch (error) {
    logger.error(`Mail gönderilemedi → ${to}: ${error}`);
    return false;
  }
}

// ─── MAİL ŞABLONları ──────────────────────────────────────────────────────────

/**
 * Sipariş onay maili — EFT ve PayTR için
 */
export function buildOrderConfirmationEmail(data: {
  orderNumber: string;
  name: string;
  items: { productName: string; quantity: number; unitPrice: number }[];
  totalAmount: number;
  paymentMethod: string;
  trackingToken: string;
  cancelToken: string;
  frontendUrl: string;
}): string {
  const { orderNumber, name, items, totalAmount, paymentMethod, trackingToken, cancelToken, frontendUrl } = data;

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">${item.productName}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;">${item.unitPrice.toFixed(2)} TL</td>
      </tr>`
    )
    .join("");

  const paymentNote =
    paymentMethod === "EFT"
      ? `<div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:12px 16px;margin:20px 0;border-radius:4px;">
          <strong>EFT / Havale Bilgisi</strong><br/>
          Ödemenizi aşağıdaki hesaba yapabilirsiniz. Dekontunuzu sisteme yüklediyseniz daha hızlı onaylanır.<br/>
          Siparişiniz 30 gün içinde onaylanmazsa otomatik iptal edilecektir.
        </div>`
      : `<div style="background:#e8f5e9;border-left:4px solid #22c55e;padding:12px 16px;margin:20px 0;border-radius:4px;">
          <strong>Ödemeniz alındı!</strong><br/>
          Siparişiniz onaylanmış ve işleme alınmıştır.
        </div>`;

  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Siparişiniz Alındı</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:#f97316;padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">🐾 Patilikap</h1>
      <p style="color:#fff;margin:8px 0 0;opacity:0.9;">Siparişiniz Alındı</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:20px;">Merhaba, ${name}!</h2>
      <p style="color:#6b7280;margin:0 0 24px;">Siparişiniz başarıyla alındı. Aşağıda sipariş detaylarınızı bulabilirsiniz.</p>

      <!-- Sipariş Numarası -->
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
        <p style="margin:0;color:#6b7280;font-size:13px;">SİPARİŞ NUMARANIZ</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#f97316;letter-spacing:2px;">${orderNumber}</p>
      </div>

      ${paymentNote}

      <!-- Sipariş Özeti -->
      <h3 style="font-size:16px;margin:0 0 12px;">Sipariş Özeti</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #f0f0f0;">
            <th style="text-align:left;padding:8px 0;font-size:13px;color:#6b7280;">Ürün</th>
            <th style="text-align:center;padding:8px 0;font-size:13px;color:#6b7280;">Adet</th>
            <th style="text-align:right;padding:8px 0;font-size:13px;color:#6b7280;">Fiyat</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:12px 0 0;font-weight:bold;">Toplam</td>
            <td style="padding:12px 0 0;text-align:right;font-weight:bold;font-size:18px;color:#f97316;">${totalAmount.toFixed(2)} TL</td>
          </tr>
        </tfoot>
      </table>

      <!-- Butonlar -->
      <div style="margin-top:32px;display:flex;gap:12px;">
        <a href="${frontendUrl}/track?token=${trackingToken}"
           style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:12px;">
          📦 Siparişimi Takip Et
        </a>
        <a href="${frontendUrl}/orders/cancel?token=${cancelToken}"
           style="display:inline-block;background:#fff;color:#ef4444;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;border:1px solid #ef4444;">
          ✕ Siparişimi İptal Et
        </a>
      </div>

      <p style="margin-top:16px;font-size:12px;color:#9ca3af;">
        * İptal linki sadece sipariş hazırlanmaya başlamadan önce geçerlidir.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:24px;text-align:center;border-top:1px solid #f0f0f0;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Bu maili <strong>Patilikap</strong> gönderdi.<br/>
        Sorularınız için <a href="mailto:info@patilikap.com" style="color:#f97316;">info@patilikap.com</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * İptal onay maili
 */
export function buildOrderCancelledEmail(data: {
  orderNumber: string;
  name: string;
  reason?: string;
}): string {
  const { orderNumber, name, reason } = data;

  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#ef4444;padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">🐾 Patilikap</h1>
      <p style="color:#fff;margin:8px 0 0;opacity:0.9;">Sipariş İptal Edildi</p>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;">Merhaba, ${name}!</h2>
      <p style="color:#6b7280;">${orderNumber} numaralı siparişiniz iptal edilmiştir.</p>
      ${reason ? `<p style="color:#6b7280;">Sebep: ${reason}</p>` : ""}
      <p style="color:#6b7280;">EFT ödemesi yaptıysanız ve ödemeniz onaylanmışsa, iade için bizimle iletişime geçebilirsiniz.</p>
    </div>
    <div style="background:#f9fafb;padding:24px;text-align:center;border-top:1px solid #f0f0f0;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Sorularınız için <a href="mailto:info@patilikap.com" style="color:#f97316;">info@patilikap.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Barınak sahibine bağış bildirimi maili
 */
export function buildShelterDonationEmail(data: {
  shelterName: string;
  donorName: string;
  orderNumber: string;
  items: { productName: string; quantity: number; unitPrice: number }[];
  totalAmount: number;
  paymentMethod: string;
}): string {
  const { shelterName, donorName, orderNumber, items, totalAmount, paymentMethod } = data;

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">${item.productName}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;">${item.unitPrice.toFixed(2)} TL</td>
      </tr>`
    )
    .join("");

  const methodLabel = paymentMethod === "EFT" ? "EFT / Havale" : "Kredi Kartı";

  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Yeni Bağış Alındı</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <div style="background:#22c55e;padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">🐾 Patilikap</h1>
      <p style="color:#fff;margin:8px 0 0;opacity:0.9;">Yeni Bağış Alındı!</p>
    </div>

    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:20px;">Merhaba, ${shelterName}!</h2>
      <p style="color:#6b7280;margin:0 0 24px;">Kampanyanıza yeni bir bağış yapıldı ve ödeme onaylandı.</p>

      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;margin-bottom:24px;border-radius:4px;">
        <strong>Bağışçı:</strong> ${donorName}<br/>
        <strong>Ödeme Yöntemi:</strong> ${methodLabel}
      </div>

      <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
        <p style="margin:0;color:#6b7280;font-size:13px;">SİPARİŞ NUMARASI</p>
        <p style="margin:4px 0 0;font-size:20px;font-weight:bold;color:#22c55e;letter-spacing:2px;">${orderNumber}</p>
      </div>

      <h3 style="font-size:16px;margin:0 0 12px;">Bağış İçeriği</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #f0f0f0;">
            <th style="text-align:left;padding:8px 0;font-size:13px;color:#6b7280;">Ürün</th>
            <th style="text-align:center;padding:8px 0;font-size:13px;color:#6b7280;">Adet</th>
            <th style="text-align:right;padding:8px 0;font-size:13px;color:#6b7280;">Fiyat</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:12px 0 0;font-weight:bold;">Toplam</td>
            <td style="padding:12px 0 0;text-align:right;font-weight:bold;font-size:18px;color:#22c55e;">${totalAmount.toFixed(2)} TL</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="background:#f9fafb;padding:24px;text-align:center;border-top:1px solid #f0f0f0;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Bu maili <strong>Patilikap</strong> gönderdi.<br/>
        Sorularınız için <a href="mailto:info@patilikap.com" style="color:#f97316;">info@patilikap.com</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Kargo bilgisi maili
 */
export function buildShippingEmail(data: {
  orderNumber: string;
  name: string;
  provider: string;
  trackingNumber: string;
  trackingUrl?: string;
  trackingToken: string;
  frontendUrl: string;
}): string {
  const { orderNumber, name, provider, trackingNumber, trackingUrl, trackingToken, frontendUrl } = data;

  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#3b82f6;padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">🐾 Patilikap</h1>
      <p style="color:#fff;margin:8px 0 0;opacity:0.9;">Siparişiniz Yola Çıktı!</p>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;">Merhaba, ${name}!</h2>
      <p style="color:#6b7280;">${orderNumber} numaralı siparişiniz kargoya verildi.</p>
      
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 8px;"><strong>Kargo Firması:</strong> ${provider}</p>
        <p style="margin:0;"><strong>Takip Numarası:</strong> ${trackingNumber}</p>
        ${trackingUrl ? `<p style="margin:8px 0 0;"><a href="${trackingUrl}" style="color:#f97316;">Kargo Firmasında Takip Et →</a></p>` : ""}
      </div>

      <a href="${frontendUrl}/track?token=${trackingToken}"
         style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        📦 Siparişimi Takip Et
      </a>
    </div>
    <div style="background:#f9fafb;padding:24px;text-align:center;border-top:1px solid #f0f0f0;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Sorularınız için <a href="mailto:info@patilikap.com" style="color:#f97316;">info@patilikap.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}