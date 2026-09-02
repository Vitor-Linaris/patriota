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
 * HTTP rather than their SMTP relay: outbound :587 is blocked on a lot of
 * hosting, and the API returns a messageId that correlates with Brevo's
 * webhooks and logs. No SDK — Node has global fetch and the payload is a
 * handful of fields.
 *
 * Three things that differ from Resend, and each one is a way to get a
 * 400 that says very little:
 *
 *   • Auth is an `api-key` HEADER, not a Bearer token.
 *   • `sender` and `to` are objects ({ name, email }), not a formatted
 *     "Name <address>" string.
 *   • Tags are a flat array of strings, not name/value pairs.
 *
 * Like every provider, `sender.email` has to be on a domain (or a single
 * address) verified in the Brevo dashboard, or the send is refused. That
 * is MAIL_FROM_EMAIL, or the fromEmail row in /admin/configuracoes.
 */
@Injectable()
export class BrevoMailDriver implements MailDriver {
  readonly id = 'brevo';
  private readonly logger = new Logger('Mailer:brevo');

  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage, from: MailSender): Promise<MailResult> {
    // Env only, never a Setting row: GET /admin/settings returns that
    // whole JSON blob to anyone with configuracoes.aceder, so a key in
    // there is a key shared with the entire newsroom.
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
        // Carries List-Unsubscribe / List-Unsubscribe-Post through for
        // the digests — Gmail and Yahoo require them from bulk senders,
        // and deliverability collapses without them.
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.tag ? { tags: [message.tag] } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Brevo rejected the message (${res.status}): ${body}`);
      throw new Error(`Brevo responded ${res.status}`);
    }

    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
    };
    return { messageId: data.messageId ?? null };
  }
}
