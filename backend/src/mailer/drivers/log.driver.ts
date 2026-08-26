import { Injectable, Logger } from '@nestjs/common';
import type {
  MailDriver,
  MailMessage,
  MailResult,
  MailSender,
} from '../mailer.types';

/**
 * Default driver. Writes the message to the application log instead of
 * sending it.
 *
 * This is what makes a fresh clone work with no credentials and keeps the
 * e2e suite hermetic — no test ever needs a network call or an inbox. The
 * verification and reset links appear in `docker compose logs api`, which
 * is exactly how the flows were exercised before a provider existed.
 */
@Injectable()
export class LogMailDriver implements MailDriver {
  readonly id = 'log';
  private readonly logger = new Logger('Mailer:log');

  send(message: MailMessage, from: MailSender): Promise<MailResult> {
    this.logger.log(
      `→ ${message.to} · from ${from.name} <${from.email}> · ${message.subject}`,
    );
    // The text part carries the links; printing the HTML would bury them.
    this.logger.log(`\n${message.text}\n`);
    return Promise.resolve({ messageId: `log-${Date.now()}` });
  }
}
