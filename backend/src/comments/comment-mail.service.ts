import { Injectable } from '@nestjs/common';
import { MailerService } from '../mailer/mailer.service';
import {
  commentApprovedTemplate,
  commentRemovedTemplate,
} from '../mailer/templates/comments.templates';
import type { TemplateContext } from '../mailer/templates/reader.templates';

/**
 * Comment-moderation e-mails, one method per moment.
 *
 * Mirrors ReaderMailService: the service that decides WHAT happened
 * (CommentsService) should not also know how a mail is composed. Neither
 * method here ever throws — MailerService.send() already swallows and
 * logs, and a comment approval or removal must succeed for the reader
 * regardless of whether the notice about it goes out.
 */
@Injectable()
export class CommentMailService {
  constructor(private readonly mailer: MailerService) {}

  private async context(): Promise<TemplateContext> {
    return {
      siteName: await this.mailer.siteName(),
      siteUrl: this.mailer.siteUrl(),
    };
  }

  async sendApproved(
    to: string,
    name: string | null,
    articleTitle: string,
    articleSlug: string,
    commentBody: string,
  ): Promise<void> {
    const rendered = commentApprovedTemplate(await this.context(), {
      name,
      articleTitle,
      articleSlug,
      commentBody,
    });
    await this.mailer.send({ to, ...rendered, tag: 'comment-approved' });
  }

  /** `reason` is the moderator's note — required by the caller, not here. */
  async sendRemoved(
    to: string,
    name: string | null,
    articleTitle: string,
    reason: string,
  ): Promise<void> {
    const rendered = commentRemovedTemplate(await this.context(), {
      name,
      articleTitle,
      reason,
    });
    await this.mailer.send({ to, ...rendered, tag: 'comment-removed' });
  }
}
