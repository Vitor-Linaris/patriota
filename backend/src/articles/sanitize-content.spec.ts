import { sanitizeArticleContent } from './sanitize-content';

/**
 * Two halves, and both matter equally.
 *
 * The first pins what must be REMOVED — a sanitiser nobody tests is a
 * sanitiser that quietly stops sanitising. The second pins what must
 * SURVIVE: the whole risk of adding this was losing formatting an editor
 * had already written, so every tag the Tiptap toolbar can produce is
 * asserted to come back intact.
 */
describe('sanitizeArticleContent', () => {
  describe('removes what can execute', () => {
    it('strips a script tag, keeping the surrounding prose', () => {
      const out = sanitizeArticleContent(
        '<p>antes</p><script>window.x=1</script><p>depois</p>',
      );
      expect(out).not.toContain('<script');
      expect(out).not.toContain('window.x');
      expect(out).toContain('<p>antes</p>');
      expect(out).toContain('<p>depois</p>');
    });

    it('strips event handlers from a tag that is otherwise allowed', () => {
      // The classic: the tag is on the allowlist, the attribute is not.
      const out = sanitizeArticleContent(
        '<img src="/uploads/a.webp" onerror="fetch(\'//evil\')">',
      );
      expect(out).toContain('/uploads/a.webp');
      expect(out).not.toContain('onerror');
    });

    it.each([
      ['<p onclick="x()">texto</p>', 'onclick'],
      ['<p onmouseover="x()">texto</p>', 'onmouseover'],
      ['<a href="/a" onfocus="x()">l</a>', 'onfocus'],
    ])('drops %s', (input, attr) => {
      expect(sanitizeArticleContent(input)).not.toContain(attr);
    });

    it('refuses javascript: and data: URLs', () => {
      expect(sanitizeArticleContent('<a href="javascript:alert(1)">l</a>')).not.toContain(
        'javascript:',
      );
      // data: is how an SVG — which is a script container — gets smuggled
      // past a check that only looked at the tag name.
      expect(
        sanitizeArticleContent('<img src="data:image/svg+xml;base64,PHN2Zz4=">'),
      ).not.toContain('data:');
    });

    it('strips iframe, object, embed and svg entirely', () => {
      const out = sanitizeArticleContent(
        '<iframe src="//evil"></iframe><object data="x"></object>' +
          '<embed src="x"><svg onload="x()"></svg>',
      );
      for (const tag of ['<iframe', '<object', '<embed', '<svg', 'onload']) {
        expect(out).not.toContain(tag);
      }
    });

    it('strips style tags and style attributes that are not text-align', () => {
      const out = sanitizeArticleContent(
        '<style>body{display:none}</style>' +
          '<p style="position:fixed;top:0;background:red">a</p>',
      );
      expect(out).not.toContain('<style');
      expect(out).not.toContain('position');
      expect(out).not.toContain('background');
    });

    it('keeps the words of a tag it does not know', () => {
      // discard, not `escape` and not silent deletion: an editor's
      // sentence surviving a stray <div> from a paste matters more than
      // the <div> did.
      const out = sanitizeArticleContent('<div>parágrafo colado</div>');
      expect(out).toContain('parágrafo colado');
      expect(out).not.toContain('<div');
    });

    it('is empty for empty input', () => {
      expect(sanitizeArticleContent('')).toBe('');
      expect(sanitizeArticleContent(null)).toBe('');
      expect(sanitizeArticleContent(undefined)).toBe('');
    });
  });

  describe('keeps everything the editor can produce', () => {
    // Read straight off RichTextEditor.tsx: StarterKit (headings 1-4,
    // bold, italic, underline, strike, code, codeBlock, blockquote,
    // lists, hr, link) + Image + TextAlign. If a case here ever fails,
    // the allowlist has drifted away from the editor and an editor is
    // losing work.
    it.each([
      ['<p>parágrafo</p>', '<p>parágrafo</p>'],
      ['<h2>título</h2>', '<h2>título</h2>'],
      ['<h3>sub</h3>', '<h3>sub</h3>'],
      ['<strong>negrito</strong>', '<strong>negrito</strong>'],
      ['<em>itálico</em>', '<em>itálico</em>'],
      ['<u>sublinhado</u>', '<u>sublinhado</u>'],
      ['<s>rasurado</s>', '<s>rasurado</s>'],
      ['<code>código</code>', '<code>código</code>'],
      ['<pre><code>bloco</code></pre>', '<pre><code>bloco</code></pre>'],
      ['<blockquote><p>citação</p></blockquote>', '<blockquote><p>citação</p></blockquote>'],
      ['<ul><li>um</li><li>dois</li></ul>', '<ul><li>um</li><li>dois</li></ul>'],
      ['<ol><li>um</li></ol>', '<ol><li>um</li></ol>'],
      ['<hr />', '<hr />'],
    ])('keeps %s', (input, expected) => {
      expect(sanitizeArticleContent(input)).toBe(expected);
    });

    it('keeps an uploaded image with its alt and class', () => {
      const out = sanitizeArticleContent(
        '<img src="/uploads/2026/09/foto-medium.webp" alt="Uma foto" class="rounded-lg">',
      );
      expect(out).toContain('src="/uploads/2026/09/foto-medium.webp"');
      expect(out).toContain('alt="Uma foto"');
      expect(out).toContain('rounded-lg');
    });

    it('keeps text-align, which is the one style TextAlign emits', () => {
      // Without this, every centred heading and image in the archive
      // would silently go back to the left.
      expect(sanitizeArticleContent('<p style="text-align: center">a</p>')).toContain(
        'text-align:center',
      );
      expect(sanitizeArticleContent('<h2 style="text-align: right">a</h2>')).toContain(
        'text-align:right',
      );
    });

    it('keeps links and forces rel/target on every one', () => {
      const out = sanitizeArticleContent('<a href="https://exemplo.pt">ligação</a>');
      expect(out).toContain('href="https://exemplo.pt"');
      expect(out).toContain('rel="noopener nofollow"');
      // target="_blank" without noopener hands the opened page a handle
      // back to ours, so the transform adds both whichever the editor
      // remembered.
      expect(out).toContain('target="_blank"');
    });

    it('keeps a relative link and a mailto', () => {
      expect(sanitizeArticleContent('<a href="/categoria/politica">a</a>')).toContain(
        'href="/categoria/politica"',
      );
      expect(sanitizeArticleContent('<a href="mailto:a@b.pt">a</a>')).toContain(
        'mailto:a@b.pt',
      );
    });

    it('leaves a realistic article body byte-identical', () => {
      // The regression that matters most: a normal piece must round-trip
      // unchanged, or every save would rewrite the body.
      const body =
        '<h2 style="text-align:center">O título</h2>' +
        '<p>Um parágrafo com <strong>negrito</strong>, <em>itálico</em> e ' +
        '<a href="https://exemplo.pt" rel="noopener nofollow" target="_blank">uma ligação</a>.</p>' +
        '<img src="/uploads/2026/09/foto-medium.webp" alt="Foto" class="rounded-lg" />' +
        '<blockquote><p>Uma citação.</p></blockquote>' +
        '<ul><li>Primeiro</li><li>Segundo</li></ul>';
      expect(sanitizeArticleContent(body)).toBe(body);
    });
  });
});
