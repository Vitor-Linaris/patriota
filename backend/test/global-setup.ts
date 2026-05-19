/**
 * Jest globalSetup for e2e: redirects DATABASE_URL to a dedicated test database
 * (`patriota_test`) and runs `prisma migrate deploy` against it.
 *
 * This isolates the test runner from the dev/prod database so truncating
 * tables in tests never touches real data.
 */
import { execSync } from 'child_process';

export default async function globalSetup(): Promise<void> {
  const baseUrl =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, '/patriota_test$1') ??
    'postgresql://patriota:patriota@postgres:5432/patriota_test?schema=public';

  process.env.DATABASE_URL = baseUrl;

  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: baseUrl },
    });
  } catch (err) {
    console.error('[e2e] prisma migrate deploy failed:', err);
    throw err;
  }
}
