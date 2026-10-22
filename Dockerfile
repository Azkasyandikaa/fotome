# --- Build stage: Vite build + tsc build:server (butuh devDependencies) ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm run build:server

# --- Runtime stage: image kecil, kode jalan dari hasil build ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# PATH file service account Google Drive (opsional) — file rahasia
# disuntikkan lewat secret platform, bukan di-commit.
ENV GDRIVE_SERVICE_ACCOUNT_FILE=/run/secrets/gdrive-service-account.json

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# public/ dipakai sebagai sumber seed DATA_DIR (frame bawaan, dst.)
COPY --from=build /app/public ./public

# Mount persistent volume platform di /app/data dan set DATA_DIR=/app/data.
# Semua state mutable (frame upload, kategori, leaderboard, showcase,
# checksum galeri) disimpan di situ supaya tidak hilang saat redeploy.
ENV DATA_DIR=/app/data

EXPOSE 3000
CMD ["node", "dist-server/index.js"]
