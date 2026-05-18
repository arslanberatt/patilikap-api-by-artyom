import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";
import { sendEmail, buildPasswordResetEmail } from "./email.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, token }) => {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const resetUrl = `${frontendUrl}/sifre-sifirla?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: user.email,
        subject: "Patilikap — Şifre Sıfırlama",
        html: buildPasswordResetEmail({
          name: user.name || user.email,
          resetUrl,
        }),
      });
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 saat
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
    process.env.FRONTEND_URL ?? "http://localhost:5173",
    "http://localhost:5173",
    "http://localhost:3000",
  ],
  advanced: {
    crossSubDomainCookies: process.env.COOKIE_DOMAIN
      ? { enabled: true, domain: process.env.COOKIE_DOMAIN }
      : { enabled: false },
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "DONOR",
        required: false,
      },
      phone: {
        type: "string",
        required: false,
      },
      onboardingCompleted: {
        type: "boolean",
        defaultValue: false,
        required: false,
      },
    },
  },
});