import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

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
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = resolveCorsOrigin();
  app.enableCors({ origin: corsOrigin, credentials: true });

  const port = Number(process.env.PORT ?? 8585);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `Patriota API listening on :${port} · CORS origin: ${
      Array.isArray(corsOrigin) ? corsOrigin.join(', ') : corsOrigin
    }`,
  );
}
void bootstrap();
