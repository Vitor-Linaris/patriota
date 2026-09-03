import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { BrevoMailDriver } from './drivers/brevo.driver';
import { LogMailDriver } from './drivers/log.driver';
import { ResendMailDriver } from './drivers/resend.driver';
import { SmtpMailDriver } from './drivers/smtp.driver';
import type {
  MailDriver,
  MailMessage,
  MailResult,
  MailSender,
} from './mailer.types';

/** Sender identity is re-read at most this often. */
const SETTINGS_TTL_MS = 60_000;

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private cached: { at: number; sender: MailSender } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly log: LogMailDriver,
    private readonly brevo: BrevoMailDriver,
    private readonly resend: ResendMailDriver,
    private readonly smtp: SmtpMailDriver,
  ) {}

  /**
   * Defaults to `log`, so a fresh clone and the e2e suite both work with
   * no credentials at all.
   */
  private get driver(): MailDriver {
    switch (this.config.get<string>('MAIL_DRIVER')) {
      case 'brevo':
        return this.brevo;
      case 'resend':
        return this.resend;
      case 'smtp':
        return this.smtp;
      default:
        return this.log;
    }
  }

  /**
   * Sender name/address come from the Setting row — they are editorial
   * configuration and the newsroom edits them in /admin/configuracoes.
   * Credentials never do; those are env-only, because GET /admin/settings
   * hands the whole blob to anyone with configuracoes.aceder.
   */
  private async sender(): Promise<MailSender> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < SETTINGS_TTL_MS) {
      return this.cached.sender;
    }

    let fromName = this.config.get<string>('MAIL_FROM_NAME') ?? 'O Patriota Notícias';
    let fromEmail = this.config.get<string>('MAIL_FROM_EMAIL') ?? 'noreply@opatriota.pt';

    try {
      const email = (await this.settings.get('email')) as {
        fromName?: string;
        fromEmail?: string;
      };
      if (email.fromName) fromName = email.fromName;
      if (email.fromEmail) fromEmail = email.fromEmail;
    } catch {
      // Settings unavailable — the env fallback is enough to still send.
    }

    const sender = { name: fromName, email: fromEmail };
    this.cached = { at: now, sender };
    return sender;
  }

  /** Absolute base for links inside e-mails. */
  siteUrl(): string {
    return (
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'http://localhost:3005'
    ).replace(/\/+$/, '');
  }

  async siteName(): Promise<string> {
    try {
      const geral = (await this.settings.get('geral')) as { siteName?: string };
      return geral.siteName ?? 'O Patriota Notícias';
    } catch {
      return 'O Patriota Notícias';
    }
  }

  /**
   * Never throws.
   *
   * Every caller is a side effect of something more important — a reader
   * finishing registration, the digest cron draining its queue — and none
   * of them should fail because an ESP had a bad minute. Callers that
   * need to know (the notification outbox, which retries) use sendOrThrow.
   */
  async send(message: MailMessage): Promise<MailResult | null> {
    try {
      return await this.sendOrThrow(message);
    } catch (err) {
      this.logger.error(
        `Failed to send "${message.subject}" to ${message.to}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async sendOrThrow(message: MailMessage): Promise<MailResult> {
    return this.driver.send(message, await this.sender());
  }

  /**
   * What is actually sending, for the settings screen to report.
   *
   * Read-only, and deliberately so. The provider and its key live in the
   * environment, never in a Setting row — GET /admin/settings hands that
   * whole JSON blob to anybody with `configuracoes.aceder`, so a key
   * kept there is a key shared with the entire newsroom. A dropdown that
   * could switch provider from the browser would also let somebody take
   * e-mail down with no way to put it back from the same screen.
   *
   * No secret crosses this boundary: only which driver is selected and
   * whether it has what it needs.
   */
  status(): {
    driver: string;
    configured: boolean;
    /** True when nothing actually leaves the building. */
    isLog: boolean;
  } {
    const driver = this.driver;
    let configured = true;

    switch (driver.id) {
      case 'brevo':
        configured = Boolean(this.config.get<string>('BREVO_API_KEY'));
        break;
      case 'resend':
        configured = Boolean(this.config.get<string>('RESEND_API_KEY'));
        break;
      case 'smtp':
        // The host comes from the Setting row and is checked when the
        // transporter is built; the password is the part that can only
        // come from the environment.
        configured = Boolean(this.config.get<string>('SMTP_PASSWORD'));
        break;
      default:
        configured = true; // the log driver always works
    }

    return { driver: driver.id, configured, isLog: driver.id === 'log' };
  }

  /**
   * Whether a toggle in /admin/configuracoes › Email allows this class of mail.
   *
   * One key, not three. `emailComments` and `emailSubscriptions` used to be
   * listed here too, and nothing ever passed them — they were toggles that
   * saved and did nothing. Narrowing the type to what is actually wired
   * means the next dead switch cannot be added without the compiler asking
   * what reads it.
   */
  async isEnabled(key: 'emailArticlePublished'): Promise<boolean> {
    try {
      const email = (await this.settings.get('email')) as Record<string, unknown>;
      return email[key] !== false;
    } catch {
      return false;
    }
  }
}
