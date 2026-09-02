import { digestTemplate, type DigestArticle } from './digest.template';

const CTX = { siteName: 'O Patriota Notícias', siteUrl: 'https://opatriota.pt' };

function article(over: Partial<DigestArticle> = {}): DigestArticle {
  return {
    slug: 'artigo',
    title: 'Título',
    summary: 'Resumo',
    content: '<p>Corpo do artigo de teste.</p>',
    categoryName: 'Política',
    categorySlug: 'politica',
    ...over,
  };
}

describe('digestTemplate', () => {
  it('uses the headline as the subject when there is a single article', () => {
    const mail = digestTemplate(CTX, {
      name: 'Ana',
      articles: [article({ title: 'Governo aprova orçamento' })],
      unsubscribeToken: 'tok',
    });

    expect(mail.subject).toContain('Governo aprova orçamento');
  });

  it('counts instead when there are several', () => {
    const mail = digestTemplate(CTX, {
      name: null,
      articles: [
        article({ slug: 'a', title: 'A' }),
        article({ slug: 'b', title: 'B' }),
        article({ slug: 'c', title: 'C' }),
      ],
      unsubscribeToken: 'tok',
    });

    expect(mail.subject).toContain('3 novidades');
    // One message carrying all three: sending three separate e-mails is
    // how a newsroom trains its own readers to mark it as spam.
    for (const slug of ['a', 'b', 'c']) {
      expect(mail.html).toContain(`https://opatriota.pt/artigo/${slug}`);
    }
  });

  it('groups the body by category', () => {
    const mail = digestTemplate(CTX, {
      name: null,
      articles: [
        article({ slug: 'p1', title: 'P1', categoryName: 'Política' }),
        article({ slug: 'e1', title: 'E1', categoryName: 'Economia', categorySlug: 'economia' }),
        article({ slug: 'p2', title: 'P2', categoryName: 'Política' }),
      ],
      unsubscribeToken: 'tok',
    });

    // Two headings for three articles: Política is not repeated just
    // because it holds two items. The heading cell is the only place
    // letter-spacing:1px appears, so counting it counts the groups.
    const headings = mail.html.match(/letter-spacing:1px/g) ?? [];
    expect(headings).toHaveLength(2);
    expect(mail.html).toContain('Política');
    expect(mail.html).toContain('Economia');
    // All three articles are still there.
    for (const slug of ['p1', 'e1', 'p2']) {
      expect(mail.html).toContain(`/artigo/${slug}`);
    }
  });

  it('escapes titles rather than trusting them as HTML', () => {
    const mail = digestTemplate(CTX, {
      name: null,
      articles: [article({ title: 'Aspas "e" <b>tags</b>' })],
      unsubscribeToken: 'tok',
    });

    expect(mail.html).not.toContain('<b>tags</b>');
    expect(mail.html).toContain('&lt;b&gt;');
  });

  it('carries both exits: mute one category and stop everything', () => {
    const mail = digestTemplate(CTX, {
      name: null,
      articles: [article()],
      unsubscribeToken: 'the-token',
    });

    // Muting a category is a different intention from unsubscribing
    // altogether, so the footer must not collapse them into one link.
    expect(mail.html).toContain('Deixar de receber sobre Política');
    expect(mail.html).toContain('Cancelar todos os e-mails');
    expect(mail.html).toContain('categoria=politica');
    expect(mail.html).toContain('t=the-token');
  });

  it('cuts the body at 50 words and adds a button to read the rest', () => {
    const longBody = `<p>${Array.from({ length: 200 }, (_, i) => `palavra${i}`).join(' ')}</p>`;
    const mail = digestTemplate(CTX, {
      name: null,
      articles: [article({ slug: 'longo', content: longBody })],
      unsubscribeToken: 'tok',
    });

    // The 50th word is in; the 51st never reaches the e-mail at all —
    // not hidden by CSS, not present and cut client-side. The button is
    // the only way to read the rest.
    expect(mail.html).toContain('palavra49');
    expect(mail.html).not.toContain('palavra50');
    expect(mail.html).toContain('Ler artigo completo');
    expect(mail.text).toContain('palavra49');
    expect(mail.text).not.toContain('palavra50');
    expect(mail.text).toContain('Ler artigo completo: https://opatriota.pt/artigo/longo');
  });

  it('does not truncate a body shorter than the cut', () => {
    const mail = digestTemplate(CTX, {
      name: null,
      articles: [article({ content: '<p>Um parágrafo curto.</p>' })],
      unsubscribeToken: 'tok',
    });

    expect(mail.html).toContain('Um parágrafo curto.');
    expect(mail.html).not.toContain('…');
  });

  it('strips markup from the excerpt rather than sending raw tags', () => {
    const mail = digestTemplate(CTX, {
      name: null,
      articles: [
        article({
          content: '<p>Primeiro <strong>parágrafo</strong>.</p><p>Segundo.</p>',
        }),
      ],
      unsubscribeToken: 'tok',
    });

    expect(mail.html).toContain('Primeiro parágrafo . Segundo.');
    // Only the excerpt has to be markup-free — the footer legitimately
    // uses <strong> for the category name, which is unrelated.
    expect(mail.html).not.toMatch(/Primeiro[^<]*<strong>/);
  });

  it('always ships a plain-text part with working links', () => {
    const mail = digestTemplate(CTX, {
      name: 'Ana',
      articles: [article({ slug: 'orcamento' })],
      unsubscribeToken: 'tok',
    });

    expect(mail.text).toContain('Olá Ana,');
    expect(mail.text).toContain('https://opatriota.pt/artigo/orcamento');
    expect(mail.text).toContain('Cancelar todos os e-mails');
  });
});
