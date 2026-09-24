import { Module } from '@nestjs/common';
import { SocialConfig } from './social.config';
import { FacebookClient } from './facebook.client';
import { InstagramClient } from './instagram.client';
import { SocialPublishingService } from './social-publishing.service';
import { SocialScheduler } from './social.scheduler';
import { SocialController } from './social.controller';
import { SettingsModule } from '../settings/settings.module';

/**
 * Publicação automática nas redes sociais, end to end: the poller that
 * claims newly published articles, the outbox it writes, the cron that
 * drains it, the two Graph API clients, and the admin endpoints.
 *
 * Imports nothing schedule-related on purpose — ScheduleModule.forRoot()
 * lives in ArticlesModule and calling it twice is a duplicate
 * registration hazard.
 *
 * SettingsModule for the editorial knobs (which networks are on, the
 * delay, the caption templates). The credentials do NOT come from there:
 * they are environment variables, because /admin/settings hands its
 * whole JSON blob to anyone with configuracoes.aceder. See SocialConfig.
 *
 * The JPEG transcoding route lives in MediaModule with the rest of the
 * file serving, not here — it is a media concern that this happens to be
 * the only consumer of.
 */
@Module({
  imports: [SettingsModule],
  providers: [
    SocialConfig,
    FacebookClient,
    InstagramClient,
    SocialPublishingService,
    SocialScheduler,
  ],
  controllers: [SocialController],
  exports: [SocialPublishingService],
})
export class SocialModule {}
