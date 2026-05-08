const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:5173";

function base(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px;">
        <tr>
          <td style="background:#e8581e;padding:24px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;">🐾 Patilikap</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;text-align:center;color:#999;font-size:12px;">
            © ${new Date().getFullYear()} Patilikap — Tüm hakları saklıdır.<br/>
            <a href="${FRONTEND}" style="color:#e8581e;">patilikap.com</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function orderConfirmationHtml(opts: {
  name: string;
  orderNumber: string;
  totalAmount: string;
  paymentMethod: string;
  cancelToken?: string;
}): string {
  const isEft = opts.paymentMethod === "EFT";
  const cancelLink = opts.cancelToken
    ? `${FRONTEND}/siparisler/${opts.orderNumber}/iptal?token=${opts.cancelToken}`
    : null;

  const eftBlock = isEft
    ? `<div style="background:#fff8f3;border:1px solid #f5cba7;border-radius:6px;padding:16px;margin:20px 0;">
        <strong>EFT / Havale Bilgileri</strong><br/>
        Lütfen banka hesap bilgilerimize ödemeyi yapın ve dekontunuzu yükleyin.<br/>
        <a href="${FRONTEND}/siparisler/${opts.orderNumber}/dekont" style="color:#e8581e;">Dekont Yükle</a>
      </div>`
    : "";

  const cancelBlock = cancelLink
    ? `<p style="font-size:13px;color:#888;">Siparişinizi iptal etmek için <a href="${cancelLink}" style="color:#e8581e;">tıklayın</a>.</p>`
    : "";

  return base(
    `Siparişiniz Alındı — ${opts.orderNumber}`,
    `<h2 style="color:#333;margin-top:0;">Merhaba ${opts.name},</h2>
    <p>Bağış siparişiniz başarıyla alındı. Teşekkür ederiz! 🐾</p>
    <table width="100%" cellpadding="8" style="border-collapse:collapse;margin:16px 0;">
      <tr style="background:#f9f9f9;">
        <td style="border:1px solid #eee;"><strong>Sipariş No</strong></td>
        <td style="border:1px solid #eee;">${opts.orderNumber}</td>
      </tr>
      <tr>
        <td style="border:1px solid #eee;"><strong>Toplam Tutar</strong></td>
        <td style="border:1px solid #eee;">${opts.totalAmount} ₺</td>
      </tr>
      <tr style="background:#f9f9f9;">
        <td style="border:1px solid #eee;"><strong>Ödeme Yöntemi</strong></td>
        <td style="border:1px solid #eee;">${opts.paymentMethod}</td>
      </tr>
    </table>
    ${eftBlock}
    ${cancelBlock}`,
  );
}

export function orderPaidHtml(opts: { name: string; orderNumber: string }): string {
  return base(
    `Ödemeniz Onaylandı — ${opts.orderNumber}`,
    `<h2 style="color:#333;margin-top:0;">Merhaba ${opts.name},</h2>
    <p>Harika haber! <strong>${opts.orderNumber}</strong> numaralı bağış siparişinizin ödemesi onaylandı.</p>
    <p>Bağışınız en kısa sürede barınağa iletilecektir. Desteğiniz için çok teşekkür ederiz! 🐾</p>
    <a href="${FRONTEND}/siparisler/${opts.orderNumber}"
       style="display:inline-block;background:#e8581e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px;">
      Siparişi Görüntüle
    </a>`,
  );
}

export function orderCancelledHtml(opts: { name: string; orderNumber: string }): string {
  return base(
    `Siparişiniz İptal Edildi — ${opts.orderNumber}`,
    `<h2 style="color:#333;margin-top:0;">Merhaba ${opts.name},</h2>
    <p><strong>${opts.orderNumber}</strong> numaralı bağış siparişiniz iptal edildi.</p>
    <p>Herhangi bir sorunuz varsa bizimle iletişime geçebilirsiniz.</p>
    <a href="${FRONTEND}/kampanyalar"
       style="display:inline-block;background:#e8581e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px;">
      Kampanyalara Göz At
    </a>`,
  );
}
