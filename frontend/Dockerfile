ARG NODE_VERSION=22-alpine

# ---------- base ----------
FROM node:${NODE_VERSION} AS base
WORKDIR /usr/src/app
RUN apk add --no-cache libc6-compat

# ---------- deps ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- dev ----------
FROM deps AS dev
ENV NODE_ENV=development
# Force file polling so file changes on Windows/Mac bind mounts trigger rebuilds
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true
COPY . .
EXPOSE 3005
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

# ---------- prod ----------
FROM node:${NODE_VERSION} AS prod
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /usr/src/app/public ./public
COPY --from=build --chown=nextjs:nodejs /usr/src/app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /usr/src/app/.next/static ./.next/static
USER nextjs
EXPOSE 3005
CMD ["node", "server.js"]
