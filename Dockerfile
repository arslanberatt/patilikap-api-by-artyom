# ─── BUILD STAGE ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Önce sadece package.json kopyala — layer cache için
COPY package*.json ./
RUN npm ci

# Kaynak kodları kopyala
COPY . .

# Prisma client üret
RUN npx prisma generate

# TypeScript derle
RUN npm run build

# ─── PRODUCTION STAGE ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Sadece production bağımlılıkları
COPY package*.json ./
RUN npm ci --only=production

# Build çıktısını kopyala
COPY --from=builder /app/dist ./dist

# Prisma schema + generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Sharp için native binary
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp

# Güvenlik — root olmayan kullanıcı
RUN addgroup -S patilikap && adduser -S patilikap -G patilikap
USER patilikap

EXPOSE 3001

# Sağlık kontrolü
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]