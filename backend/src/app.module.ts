import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { CategoriesModule } from './categories/categories.module';
import { ArticlesModule } from './articles/articles.module';
import { UsersModule } from './users/users.module';
import { MediaModule } from './media/media.module';
import { AdsModule } from './ads/ads.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { SettingsModule } from './settings/settings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { VisitsModule } from './visits/visits.module';
import { MailerModule } from './mailer/mailer.module';
import { ReaderAuthModule } from './reader-auth/reader-auth.module';
import { ReaderLibraryModule } from './reader-library/reader-library.module';
import { CommentsModule } from './comments/comments.module';
import { ReaderNotificationsModule } from './reader-notifications/reader-notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      // Disabled under Jest only.
      //
      // Every e2e test shares one process and one client IP, so the
      // per-IP buckets fill up inside a describe block and later cases
      // fail with 429 for reasons unrelated to what they assert — the
      // 3/minute limit on posting a comment is correct in production and
      // unusable in a test file.
      //
      // Keyed on JEST_WORKER_ID rather than NODE_ENV: the containers run
      // with NODE_ENV=development, so that check would have been a no-op
      // here and a live footgun anywhere NODE_ENV drifts. JEST_WORKER_ID
      // is injected by the Jest runner into each worker process and
      // exists nowhere else.
      //
      // Nothing of ours goes untested by this: the limits are declarative
      // @Throttle metadata enforced by the library, so a test would be
      // exercising @nestjs/throttler. What actually needed fixing was
      // req.ip being the proxy address — the trust-proxy call in main.ts.
      skipIf: () => process.env.JEST_WORKER_ID !== undefined,
    }),
    PrismaModule,
    RedisModule,
    RbacModule,
    AuthModule,
    ActivityLogModule,
    CategoriesModule,
    ArticlesModule,
    UsersModule,
    MediaModule,
    AdsModule,
    NewsletterModule,
    SettingsModule,
    DashboardModule,
    VisitsModule,
    // @Global — reader auth, digests and (later) staff invites all send.
    MailerModule,
    // Public-audience accounts. Every route inside is gated by
    // FEATURE_READER_AREA (see ReaderFeatureGuard), so registering the
    // module unconditionally is safe and keeps e2e able to build the
    // full graph.
    ReaderAuthModule,
    ReaderLibraryModule,
    CommentsModule,
    ReaderNotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
