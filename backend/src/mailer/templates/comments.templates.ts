import type { RenderedMail } from '../mailer.types';
import { escapeHtml, renderLayout } from './layout';
import type { TemplateContext } from './reader.templates';

function greeting(name: string | null): string {
  return name?.trim() ? `Olá ${escapeHtml(name.trim())},` : 'Olá,';
}

/**
 * Sent the moment a moderator approves a comment.
 *
 * Carries the comment back to its author as a summary — not just "foi
 * aprovado", but which comment, on which article, so the mail stands on
 * its own days later without the reader having to remember what they
 * wrote or go hunting for it on the site.
 */
export function commentApprovedTemplate(
  ctx: TemplateContext,
  data: {
    name: string | null;
    articleTitle: string;
    articleSlug: string;
    commentBody: string;
  },
): RenderedMail {
  const url = `${ctx.siteUrl}/artigo/${data.articleSlug}#comentarios`;
  return {
    subject: `O seu comentário foi aprovado — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader: `O seu comentário em "${data.articleTitle}" já está visível.`,
      heading: 'O seu comentário foi aprovado',
      bodyHtml: `
        <p style="margin:0 0 12px;">${greeting(data.name)}</p>
        <p style="margin:0 0 12px;">
          O comentário que deixou em <strong>${escapeHtml(data.articleTitle)}</strong>
          foi aprovado pela nossa equipa e já está visível para todos os leitores.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="margin:0 0 12px;">
          <tr>
            <td style="padding:12px 16px;background:#f8fafc;border-left:3px solid #2a467e;
                       color:#334155;font-size:14px;line-height:1.6;">
              ${escapeHtml(data.commentBody).replace(/\n/g, '<br>')}
            </td>
          </tr>
        </table>`,
      cta: { label: 'Ver o comentário', url },
    }),
    text: [
      greeting(data.name).replace(/<[^>]*>/g, ''),
      '',
      `O comentário que deixou em "${data.articleTitle}" foi aprovado e já está visível:`,
      '',
      data.commentBody,
      '',
      url,
    ].join('\n'),
  };
}

/**
 * Sent when a moderator removes a comment WITH a reason.
 *
 * Never sent for a hard/permanent delete — that is a records-cleanup
 * action taken after this mail already went out for the soft removal,
 * not a second notice about the same thing.
 */
export function commentRemovedTemplate(
  ctx: TemplateContext,
  data: { name: string | null; articleTitle: string; reason: string },
): RenderedMail {
  return {
    subject: `O seu comentário foi removido — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader: `O seu comentário em "${data.articleTitle}" foi removido.`,
      heading: 'O seu comentário foi removido',
      bodyHtml: `
        <p style="margin:0 0 12px;">${greeting(data.name)}</p>
        <p style="margin:0 0 12px;">
          O comentário que deixou em <strong>${escapeHtml(data.articleTitle)}</strong>
          foi removido pela nossa equipa de moderação, por não cumprir as
          regras de comentários do site.
        </p>
        <p style="margin:0;">
          <strong>Motivo:</strong> ${escapeHtml(data.reason)}
        </p>`,
      footerHtml:
        'Se acha que isto foi um engano, pode responder a este e-mail.',
    }),
    text: [
      greeting(data.name).replace(/<[^>]*>/g, ''),
      '',
      `O comentário que deixou em "${data.articleTitle}" foi removido.`,
      '',
      `Motivo: ${data.reason}`,
      '',
      'Se acha que isto foi um engano, pode responder a este e-mail.',
    ].join('\n'),
  };
}
