import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

/**
 * Boots a full Nest application (same wiring as main.ts) for e2e tests.
 * Returns the running app — caller is responsible for `await app.close()`.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // rawBody must match main.ts. Without it req.rawBody is undefined and
  // the Stripe webhook rejects EVERY request for a missing body — which
  // makes the tests that assert a rejection pass for the wrong reason,
  // and hides the ones that assert success.
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}
