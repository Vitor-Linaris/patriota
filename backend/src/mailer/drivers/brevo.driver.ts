import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MailDriver,
  MailMessage,
  MailResult,
  MailSender,
} from '../mailer.types';

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo transactional API.
 *
 * Chosen over Resend because settings.service.ts already ships
 * `newsletter.provider: 'brevo'` — running two ESPs means two sending
 * domains, two SPF/DKIM/DMARC setups and two reputations to warm, which
 * for a single Portuguese title is a real deliverability cost.
 *
 * HTTP rather than the SMTP shape the settings suggest: outbound :587 is
 * blocked on a lot of hosting, and the API returns a messageId that can
 * be correlated with bounce webhooks later. Node has global fetch, so
 * this needs no SDK.
 */
@Injectable()
export class BrevoMailDriver implements MailDriver {
  readonly id = 'brevo';
  private readonly logger = new Logger('Mailer:brevo');

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage, from: MailSender): Promise<MailResult> {
    // Read from env, never from the Setting rows: GET /admin/settings
    // returns that whole JSON blob to anyone with configuracoes.aceder.
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      throw new Error(
        'BREVO_API_KEY is not set. Either configure it or switch MAIL_DRIVER to log.',
      );
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: from.name, email: from.email },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.tag ? { tags: [message.tag] } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Brevo rejected the message (${res.status}): ${body}`);
      throw new Error(`Brevo responded ${res.status}`);
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { messageId: data.messageId ?? null };
  }
}
