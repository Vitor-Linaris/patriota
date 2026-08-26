import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SettingsService } from '../../settings/settings.service';
import type {
  MailDriver,
  MailMessage,
  MailResult,
  MailSender,
} from '../mailer.types';

/**
 * Plain SMTP, kept so the /admin/configuracoes › Email fields stay
 * meaningful and self-hosters have an escape hatch from Resend.
 *
 * Host, port and user come from the Setting row (they are configuration,
 * and the newsroom edits them); the PASSWORD comes from env only. That
 * split is deliberate — the settings blob is readable by every user with
 * configuracoes.aceder, so a credential in there is a credential shared
 * with the whole newsroom.
 */
@Injectable()
export class SmtpMailDriver implements MailDriver {
  readonly id = 'smtp';
  private readonly logger = new Logger('Mailer:smtp');
  private transporter: Transporter | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) return this.transporter;

    const email = (await this.settings.get('email')) as {
      smtpHost?: string;
      smtpPort?: string;
      smtpUser?: string;
    };
    const password = this.config.get<string>('SMTP_PASSWORD');

    if (!email.smtpHost || !password) {
      throw new Error(
        'SMTP is not configured. Set the host in /admin/configuracoes and ' +
          'SMTP_PASSWORD in the environment, or switch MAIL_DRIVER to log.',
      );
    }

    const port = Number(email.smtpPort ?? 587);
    this.transporter = nodemailer.createTransport({
      host: email.smtpHost,
      port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: port === 465,
      auth: { user: email.smtpUser ?? '', pass: password },
    });
    return this.transporter;
  }

  async send(message: MailMessage, from: MailSender): Promise<MailResult> {
    const transporter = await this.getTransporter();
    const info = await transporter.sendMail({
      from: { name: from.name, address: from.email },
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers,
    });
    this.logger.log(`Sent to ${message.to} (${info.messageId})`);
    return { messageId: info.messageId ?? null };
  }
}
