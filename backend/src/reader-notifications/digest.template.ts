import type { RenderedMail } from '../mailer/mailer.types';
import { escapeHtml, renderLayout } from '../mailer/templates/layout';
import type { TemplateContext } from '../mailer/templates/reader.templates';

export interface DigestArticle {
  slug: string;
  title: string;
  summary: string;
  /** Raw HTML body — cut down to an excerpt in this file, never sent whole. */
  content: string;
  categoryName: string;
  categorySlug: string;
  /**
   * The published pacote this article belongs to, if any.
   *
   * Changes what the item is FOR. An ordinary article's job in this
   * e-mail is to be read, so it links to itself. An article inside a
   * pacote cannot be read by most of the people receiving this — it is
   * behind the paywall the pacote is the key to — so linking to it would
   * send a reader to a wall. It links to the pacote instead, where there
   * is a cover, a price and a way in.
   */
  pkg?: {
    slug: string;
    name: string;
    priceCents: number;
    currency: string;
  } | null;
}

/** The price as a Portuguese reader reads it. */
function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/** How much of the article a reader gets before the button takes over. */
const EXCERPT_WORDS = 50;

/**
 * The opening of the article, as plain text, cut on a word boundary.
 *
 * Tags are stripped rather than parsed — this is a digest e-mail, not
 * the paywall preview in paywall.ts, which keeps whole HTML blocks so a
 * reader can keep reading inline on the site. Here the excerpt always
 * ends in a button, so the shape of the remaining markup does not
 * matter — only the words do.
 */
function excerptOf(html: string, maxWords = EXCERPT_WORDS): string {
  const words = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ') + '…';
}

/**
 * "Novidades nas categorias que segue".
 *
 * Everything a reader is owed goes in ONE message, grouped by category —
 * one e-mail per article is how a newsroom trains its own readers to mark
 * it as spam.
 *
 * The footer carries two distinct exits, because they are genuinely
 * different intentions: mute one category (keeping it on the dashboard)
 * versus stop all notification e-mail. Both land on a confirmation page
 * that POSTs; neither mutates on the GET.
 */
export function digestTemplate(
  ctx: TemplateContext,
  data: {
    name: string | null;
    articles: DigestArticle[];
    unsubscribeToken: string;
  },
): RenderedMail {
  const count = data.articles.length;

  // Group by category so the reader sees why each item reached them.
  const groups = new Map<string, DigestArticle[]>();
  for (const a of data.articles) {
    const list = groups.get(a.categoryName);
    if (list) list.push(a);
    else groups.set(a.categoryName, [a]);
  }

  const bodyHtml = [...groups.entries()]
    .map(([category, articles]) => {
      const items = articles
        .map((a) => {
          // Where the item points, and what it promises, both hinge on
          // whether this piece is part of a pacote. See DigestArticle.pkg.
          const url = a.pkg
            ? `${ctx.siteUrl}/pacotes/${encodeURIComponent(a.pkg.slug)}`
            : `${ctx.siteUrl}/artigo/${encodeURIComponent(a.slug)}`;
          const cta = a.pkg
            ? `Ver o pacote — ${formatPrice(a.pkg.priceCents, a.pkg.currency)}`
            : 'Ler artigo completo';
          // A line above the headline saying which pacote it joined, so
          // the reader understands why the button says what it says
          // before they get to the button.
          const pkgLine = a.pkg
            ? `<div style="margin-bottom:6px;font-size:11px;font-weight:700;
                           letter-spacing:0.5px;text-transform:uppercase;color:#8B6900;">
                 Novo no pacote ${escapeHtml(a.pkg.name)}
               </div>`
            : '';
          return `
        <tr>
          <td style="padding:0 0 22px;">
            ${pkgLine}
            <a href="${url}"
               style="color:#0a1629;text-decoration:none;font-size:16px;
                      font-weight:700;line-height:1.4;">
              ${escapeHtml(a.title)}
            </a>
            <div style="margin-top:6px;font-size:14px;line-height:1.65;color:#334155;">
              ${escapeHtml(excerptOf(a.content))}
            </div>
            <div style="margin-top:12px;">
              <a href="${url}"
                 style="display:inline-block;background:#2a467e;color:#ffffff;
                        text-decoration:none;font-weight:700;font-size:13px;
                        padding:10px 20px;border-radius:8px;">
                ${escapeHtml(cta)}
              </a>
            </div>
          </td>
        </tr>`;
        })
        .join('');

      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="margin-bottom:8px;">
          <tr>
            <td style="padding-bottom:10px;font-size:11px;font-weight:700;
                       letter-spacing:1px;text-transform:uppercase;color:#2a467e;">
              ${escapeHtml(category)}
            </td>
          </tr>
          ${items}
        </table>`;
    })
    .join('');

  const unsubBase = `${ctx.siteUrl}/conta/notificacoes?t=${encodeURIComponent(
    data.unsubscribeToken,
  )}`;
  const perCategory = [...groups.keys()][0];
  const firstSlug = data.articles[0]?.categorySlug ?? '';

  const footerHtml = `
    Recebeu esta mensagem porque segue ${
      groups.size === 1
        ? `a categoria <strong>${escapeHtml(perCategory ?? '')}</strong>`
        : `${groups.size} categorias`
    } em ${escapeHtml(ctx.siteName)}.<br>
    <a href="${unsubBase}&categoria=${encodeURIComponent(firstSlug)}"
       style="color:#64748b;">Deixar de receber sobre ${escapeHtml(perCategory ?? '')}</a>
    &nbsp;·&nbsp;
    <a href="${unsubBase}" style="color:#64748b;">Cancelar todos os e-mails</a>
    &nbsp;·&nbsp;
    <a href="${ctx.siteUrl}/conta/categorias" style="color:#64748b;">Gerir preferências</a>`;

  const heading =
    count === 1 ? 'Há uma notícia nova para si' : `Há ${count} notícias novas para si`;

  return {
    subject:
      count === 1
        ? `${data.articles[0]!.title} — ${ctx.siteName}`
        : `${count} novidades nas categorias que segue — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader:
        count === 1
          ? data.articles[0]!.title
          : `${count} novas notícias nas categorias que segue.`,
      heading,
      bodyHtml,
      footerHtml,
    }),
    text: [
      data.name?.trim() ? `Olá ${data.name.trim()},` : 'Olá,',
      '',
      heading + ':',
      '',
      ...[...groups.entries()].flatMap(([category, articles]) => [
        category.toUpperCase(),
        ...articles.flatMap((a) => [
          ...(a.pkg ? [`  [Novo no pacote ${a.pkg.name}]`] : []),
          `  ${a.title}`,
          `  ${excerptOf(a.content)}`,
          a.pkg
            ? `  Ver o pacote (${formatPrice(a.pkg.priceCents, a.pkg.currency)}): ${ctx.siteUrl}/pacotes/${a.pkg.slug}`
            : `  Ler artigo completo: ${ctx.siteUrl}/artigo/${a.slug}`,
          '',
        ]),
      ]),
      `Gerir preferências: ${ctx.siteUrl}/conta/categorias`,
      `Cancelar todos os e-mails: ${unsubBase}`,
    ].join('\n'),
  };
}
