import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma/prisma.service';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_ORDER,
} from './rbac/rbac.constants';

const log = new Logger('Bootstrap');

/** Minimum acceptable strength for the bootstrap password. Anything
 * shorter is rejected loudly so we don't ship a production system
 * with `admin123`. The 12-char threshold mirrors common security
 * guidance (NIST 800-63B "memorized secret"). */
const MIN_PASSWORD_LENGTH = 12;

/**
 * Auto-bootstrap of the first SUPER_ADMIN — only ever fires on a
 * truly virgin database. The triple guard (no users AND no articles
 * AND no activity logs) means even an environment that lost just
 * its `User` table never accidentally synthesises a new "ghost"
 * admin: that scenario requires manual investigation, not auto-
 * recovery.
 *
 * Once any of those tables has data, this function becomes a no-op
 * for the lifetime of the database — there is no second chance for
 * an attacker to slip in via this codepath.
 *
 * Source of truth for credentials: SUPERADMIN_EMAIL +
 * SUPERADMIN_PASSWORD environment variables. If they're missing or
 * the password is too weak, we throw — refusing to boot insecurely
 * is the right behaviour.
 */
export async function bootstrapInitialAdmin(
  prisma: PrismaService,
): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';

  // Triple guard. If ANY of these tables has rows, the database has
  // already been used — refuse to bootstrap regardless.
  const [userCount, articleCount, activityCount] = await Promise.all([
    prisma.user.count(),
    prisma.article.count(),
    prisma.activityLog.count(),
  ]);

  if (userCount + articleCount + activityCount > 0) {
    // Existing data — bootstrap window is closed forever.
    return;
  }

  log.warn(
    '⚠ DATABASE IS EMPTY — bootstrapping initial SUPER_ADMIN from .env',
  );

  // Validate the env vars HARD. Failing the boot now is better than
  // creating a weak admin and finding out 3 months later when the
  // password gets brute-forced.
  const email = (process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? '';
  const name = process.env.SUPERADMIN_NAME ?? 'Super Admin';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      'Bootstrap aborted: SUPERADMIN_EMAIL is missing or invalid. ' +
        'Set it in .env before first deploy.',
    );
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Bootstrap aborted: SUPERADMIN_PASSWORD must be at least ` +
        `${MIN_PASSWORD_LENGTH} characters. Set it in .env before first deploy.`,
    );
  }

  // Heuristic refuse-list — catches the most embarrassing defaults.
  const lower = password.toLowerCase();
  const blocklist = [
    'admin',
    'password',
    'changeme',
    'patriotaadmin!2025',
    'patriota2026!',
  ];
  if (blocklist.some((b) => lower.includes(b))) {
    if (isProd) {
      throw new Error(
        'Bootstrap aborted: SUPERADMIN_PASSWORD looks like a default ' +
          'or example value. Pick a unique, strong password before deploy.',
      );
    }
    // In dev we allow it but shout about it.
    log.warn(
      'SUPERADMIN_PASSWORD looks weak — acceptable in dev only. ' +
        'Production will refuse to boot with this value.',
    );
  }

  const hash = await bcrypt.hash(password, 12);

  // Use a transaction so we don't end up with an admin user without
  // its role-permissions matrix.
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        email,
        name,
        password: hash,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });

    for (const role of ROLE_ORDER) {
      await tx.rolePermissions.upsert({
        where: { role },
        update: {}, // never overwrite an existing matrix
        create: { role, permissions: DEFAULT_ROLE_PERMISSIONS[role] },
      });
    }
  });

  log.warn(
    `✓ INITIAL BOOTSTRAP COMPLETE — created SUPER_ADMIN <${email}>. ` +
      `Log in at /admin/login and change the password from /admin/perfil.`,
  );
}
