import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
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
import { VisitsMiddleware } from './common/visits.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Counts visits to public surfaces. Excluded routes (admin/*, auth/*)
    // never increment the counter.
    consumer.apply(VisitsMiddleware).forRoutes('*');
  }
}
