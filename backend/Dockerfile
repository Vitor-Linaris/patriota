ARG NODE_VERSION=22-alpine

# ---------- base ----------
FROM node:${NODE_VERSION} AS base
WORKDIR /usr/src/app
RUN apk add --no-cache libc6-compat openssl

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
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm run start:dev"]

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
