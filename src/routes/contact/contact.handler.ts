import type { Context } from "hono";
import { sendEmail } from "../../lib/email.js";
import { logger } from "../../lib/logger.js";

export async function handleContact(c: Context) {
  const body = await c.req.json() as {
    name?: string;
    email?: string;
    topic?: string;
    message?: string;
  };

  const { name, email, topic, message } = body;

  if (!name || !email || !message) {
    return c.json({ error: "Ad, e-posta ve mesaj zorunludur" }, 400);
  }

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#FD7E14;">Yeni İletişim Mesajı</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;font-weight:bold;width:120px;">Ad Soyad:</td><td style="padding:8px;">${escHtml(name)}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">E-posta:</td><td style="padding:8px;"><a href="mailto:${escHtml(email)}">${escHtml(email)}</a></td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Konu:</td><td style="padding:8px;">${escHtml(topic ?? "Belirtilmedi")}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;vertical-align:top;">Mesaj:</td><td style="padding:8px;white-space:pre-wrap;">${escHtml(message)}</td></tr>
      </table>
    </div>
  `;

  const ok = await sendEmail({
    to: process.env.CONTACT_EMAIL || "no-reply@patilikap.com",
    subject: `[İletişim] ${topic ?? "Genel"} — ${name}`,
    html,
  });

  if (!ok) {
    logger.warn(`İletişim maili gönderilemedi — gönderen: ${email}`);
  }

  return c.json({ success: true });
}

function escHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
