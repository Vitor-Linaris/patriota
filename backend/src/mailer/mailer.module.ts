import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { BrevoMailDriver } from './drivers/brevo.driver';
import { LogMailDriver } from './drivers/log.driver';
import { ResendMailDriver } from './drivers/resend.driver';
import { SmtpMailDriver } from './drivers/smtp.driver';
import { SettingsModule } from '../settings/settings.module';

/**
 * Transactional e-mail.
 *
 * @Global because the reader auth flows, the notification digest and
 * (eventually) staff invites all need it, and threading an import through
 * every one of those modules buys nothing.
 *
 * Every driver is instantiated; MailerService picks per call from
 * MAIL_DRIVER. They are cheap — none opens a connection until it sends.
 */
@Global()
@Module({
  imports: [SettingsModule],
  providers: [
    MailerService,
    LogMailDriver,
    BrevoMailDriver,
    ResendMailDriver,
    SmtpMailDriver,
  ],
  exports: [MailerService],
})
export class MailerModule {}
