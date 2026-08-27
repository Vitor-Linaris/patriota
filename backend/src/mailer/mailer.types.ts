/**
 * One outbound message, provider-agnostic.
 *
 * `headers` exists for RFC 8058 one-click unsubscribe: Gmail and Yahoo
 * require List-Unsubscribe + List-Unsubscribe-Post on bulk mail, and
 * without them deliverability for the category digests collapses.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Provider-side tagging, used to separate transactional from digest. */
  tag?: string;
}

export interface MailSender {
  name: string;
  email: string;
}

export interface MailResult {
  /** Provider message id when there is one — useful for bounce correlation. */
  messageId: string | null;
}

/**
 * Implemented by log / resend / smtp. Kept deliberately small: everything
 * provider-specific lives behind this, so swapping ESP is one file.
 */
export interface MailDriver {
  readonly id: string;
  send(message: MailMessage, from: MailSender): Promise<MailResult>;
}

/** Shape returned by the templates. */
export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}
