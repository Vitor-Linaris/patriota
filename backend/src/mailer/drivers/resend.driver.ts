import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MailDriver,
  MailMessage,
  MailResult,
  MailSender,
} from '../mailer.types';

const ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend transactional API.
 *
 * HTTP rather than SMTP: outbound :587 is blocked on a lot of hosting,
 * and the API returns an id that can be correlated with their webhooks
 * later. No SDK — Node has global fetch, and the payload is four fields.
 *
 * Two things Resend is stricter about than most:
 *   • `from` must be on a domain verified in the Resend dashboard.
 *     MAIL_FROM_EMAIL (or the fromEmail Setting row) has to match, or
 *     every send comes back 403.
 *   • tag names accept only ASCII letters, digits, underscore and dash.
 */
@Injectable()
export class ResendMailDriver implements MailDriver {
  readonly id = 'resend';
  private readonly logger = new Logger('Mailer:resend');

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage, from: MailSender): Promise<MailResult> {
    // Env only, never a Setting row: GET /admin/settings returns that
    // whole JSON blob to anyone with configuracoes.aceder, so a key in
    // there is a key shared with the entire newsroom.
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error(
        'RESEND_API_KEY is not set. Either configure it or switch MAIL_DRIVER to log.',
      );
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${from.name} <${from.email}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        // Carries List-Unsubscribe / List-Unsubscribe-Post through for the
        // digests — Gmail and Yahoo require them from bulk senders.
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.tag
          ? { tags: [{ name: 'category', value: message.tag }] }
          : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Resend rejected the message (${res.status}): ${body}`);
      throw new Error(`Resend responded ${res.status}`);
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { messageId: data.id ?? null };
  }
}
