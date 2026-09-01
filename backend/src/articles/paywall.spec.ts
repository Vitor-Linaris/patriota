import { previewOf } from './paywall';

const p = (text: string) => `<p>${text}</p>`;
const words = (n: number) => Array(n).fill('palavra').join(' ');

/** Every tag opened is closed, in order. Broken markup is the failure. */
function balanced(html: string): boolean {
  const stack: string[] = [];
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)\b[^>]*?(\/?)>/gi)) {
    const [, closing, tag, selfClosing] = m;
    if (selfClosing || ['br', 'img', 'hr'].includes(tag!.toLowerCase())) continue;
    if (closing) {
      if (stack.pop() !== tag!.toLowerCase()) return false;
    } else {
      stack.push(tag!.toLowerCase());
    }
  }
  return stack.length === 0;
}

describe('previewOf', () => {
  it('gives back whole paragraphs, never half a tag', () => {
    const html = [p(words(30)), p(words(30)), p(words(30)), p(words(30))].join('');
    const out = previewOf(html);

    expect(balanced(out)).toBe(true);
    expect(out.startsWith('<p>')).toBe(true);
    expect(out.endsWith('</p>')).toBe(true);
  });

  it('withholds the rest', () => {
    // The point of the whole exercise. The tail must not be in there in
    // any form — this is the assertion a CSS blur would fail.
    const html = p(words(40)) + p('O SEGREDO FICA CÁ DENTRO') + p(words(200));
    const out = previewOf(html, 100);

    expect(out).not.toContain('O SEGREDO FICA CÁ DENTRO');
    expect(out.length).toBeLessThan(html.length);
  });

  it('always gives at least one block, even a long one', () => {
    const out = previewOf(p(words(60)), 50);
    expect(out).toContain('palavra');
    expect(balanced(out)).toBe(true);
  });

  it('cuts inside a wall of text rather than handing it over', () => {
    // One enormous first paragraph is a real shape, and "at least one
    // whole block" would mean serving the entire article.
    const wall = p(words(2000));
    const out = previewOf(wall, 200);

    expect(out.length).toBeLessThan(wall.length / 4);
    expect(out).toContain('…');
    expect(balanced(out)).toBe(true);
  });

  it('keeps lists and quotes intact', () => {
    const html = `<ul><li>um</li><li>dois</li></ul><blockquote><p>citação</p></blockquote>${p(words(200))}`;
    const out = previewOf(html, 30);

    expect(balanced(out)).toBe(true);
    expect(out).toContain('</ul>');
  });

  it('copes with content that has no block markup at all', () => {
    const out = previewOf(`Texto solto sem etiquetas. ${words(200)}`, 60);
    expect(balanced(out)).toBe(true);
    expect(out).toContain('Texto solto');
  });

  it('never returns the whole article, however short it is', () => {
    // The invariant that actually matters, and the one a fixed character
    // budget cannot hold on its own: an article shorter than the budget
    // would otherwise come back complete, and the paywall would do
    // nothing for precisely the short exclusives most likely to sit
    // behind it.
    const cases = [
      'Um brevíssimo apontamento de duas linhas apenas.',
      p('Uma nota curta de opinião, e mais nada.'),
      p(words(10)) + p(words(10)),
      p(words(400)),
    ];
    for (const html of cases) {
      const out = previewOf(html);
      expect(out.replace(/<[^>]*>/g, '').length).toBeLessThan(
        html.replace(/<[^>]*>/g, '').length,
      );
      expect(balanced(out)).toBe(true);
    }
  });
});
