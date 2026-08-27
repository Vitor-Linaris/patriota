import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'node:fs';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { bootstrapInitialAdmin } from './bootstrap-admin';

function resolveCorsOrigin(): string[] | false {
  const env = process.env.CORS_ORIGIN?.trim();
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CORS_ORIGIN must be set in production. ' +
        'Example: CORS_ORIGIN=https://opatriota.pt',
    );
  }
  // Dev fallback — only the local frontend.
  return ['http://localhost:3005'];
}

async function bootstrap() {
  // PHASE 2 (billing): Stripe webhooks need the untouched request body to
  // verify the signature, so this will have to become
  //   NestFactory.create(AppModule, { rawBody: true })
  // and the webhook route must carry @SkipThrottle() plus its own body
  // parser — the global ValidationPipe below (forbidNonWhitelisted) and
  // the JSON parsing both destroy the signature otherwise.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Docker/Nginx every request arrives from the proxy, so req.ip is
  // the proxy IP and ThrottlerGuard buckets the whole internet together —
  // including the 5/min limit on POST /auth/login. Trusting one hop makes
  // Express read the client IP from X-Forwarded-For instead.
  //
  // "1" (not `true`) on purpose: trusting the full chain would let a
  // client spoof X-Forwarded-For and dodge every rate limit. Raise this
  // only if a second reverse proxy is ever put in front.
  app.set('trust proxy', 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = resolveCorsOrigin();
  app.enableCors({ origin: corsOrigin, credentials: true });

  // Serve uploaded media (sharp output) from the named docker volume.
  // The Dockerfile creates this dir at build time; we double-check at
  // runtime in case the container is started from a stale image.
  const uploadsDir = process.env.UPLOADS_DIR ?? '/usr/src/app/uploads';
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
    immutable: true,
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days — variants are content-addressed
  });

  // First-deploy admin bootstrap — only fires on a truly empty DB.
  // See src/bootstrap-admin.ts for the triple-guard logic. Runs
  // BEFORE app.listen() so the API only starts accepting traffic
  // once the SUPER_ADMIN row exists (no race window between listen
  // and admin creation).
  try {
    const prisma = app.get(PrismaService);
    await bootstrapInitialAdmin(prisma);
  } catch (err) {
    // Fail loud — better to refuse to boot than to ship with a
    // half-bootstrapped state.
    new Logger('Bootstrap').error(
      `Initial admin bootstrap failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 8585);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `Patriota API listening on :${port} · CORS origin: ${
      Array.isArray(corsOrigin) ? corsOrigin.join(', ') : corsOrigin
    }`,
  );
}
void bootstrap();
