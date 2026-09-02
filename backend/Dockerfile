ARG NODE_VERSION=22-alpine

# ---------- base ----------
FROM node:${NODE_VERSION} AS base
WORKDIR /usr/src/app
# vips is required by sharp's prebuilt binary on Alpine.
#
# ffmpeg is for video, and only for INSPECTING it: ffprobe reads the
# duration, resolution and codec, and one frame comes out as a
# thumbnail. Nothing is transcoded — a real conversion takes minutes and
# does not belong inside an HTTP request. Costs about 80 MB in the image.
RUN apk add --no-cache libc6-compat openssl vips ffmpeg \
    && mkdir -p /usr/src/app/uploads

# ---------- deps ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- prisma ----------
FROM deps AS prisma
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# ---------- dev ----------
FROM prisma AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
# `prisma generate` is re-run at startup so the client always matches
# the schema bind-mounted from the host. Without this the container
# can boot with a stale client whenever the schema changes between
# `docker compose down` and `up` cycles.
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npx prisma db seed && npm run start:dev"]

# ---------- build ----------
FROM prisma AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- prod ----------
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/generated ./generated
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/prisma.config.ts ./
COPY --from=build /usr/src/app/package.json ./
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
