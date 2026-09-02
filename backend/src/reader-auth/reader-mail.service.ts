import { Injectable } from '@nestjs/common';
import { MailerService } from '../mailer/mailer.service';
import {
  registrationAttemptTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
  type TemplateContext,
} from '../mailer/templates/reader.templates';

/**
 * Reader-facing e-mails, one method per moment.
 *
 * Sits between the controller and MailerService so the controller does
 * not have to know about templates, and so the "never throw" contract is
 * in one place: none of these is worth failing a registration over. If
 * the mail does not go out, the reader can always ask for a new link.
 */
@Injectable()
export class ReaderMailService {
  constructor(private readonly mailer: MailerService) {}

  private async context(): Promise<TemplateContext> {
    return {
      siteName: await this.mailer.siteName(),
      siteUrl: this.mailer.siteUrl(),
    };
  }

  async sendVerification(
    to: string,
    name: string | null,
    token: string,
  ): Promise<void> {
    const rendered = verifyEmailTemplate(await this.context(), { name, token });
    await this.mailer.send({ to, ...rendered, tag: 'reader-verify' });
  }

  async sendPasswordReset(
    to: string,
    name: string | null,
    token: string,
    firstPassword = false,
  ): Promise<void> {
    const rendered = resetPasswordTemplate(await this.context(), {
      name,
      token,
      firstPassword,
    });
    await this.mailer.send({ to, ...rendered, tag: 'reader-reset' });
  }

  /**
   * The counterpart to registration always answering 202: the API tells a
   * stranger nothing, but the address owner is told something was tried.
   */
  async sendRegistrationAttempt(
    to: string,
    name: string | null,
    hasPassword: boolean,
  ): Promise<void> {
    const rendered = registrationAttemptTemplate(await this.context(), {
      name,
      hasPassword,
    });
    await this.mailer.send({ to, ...rendered, tag: 'reader-exists' });
  }
}
