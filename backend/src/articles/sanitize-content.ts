import sanitizeHtml from 'sanitize-html';

/**
 * The article body, with anything that can execute taken out.
 *
 * Why this exists: `content` reaches the public article page and the
 * admin preview through `dangerouslySetInnerHTML`, and until now nothing
 * stood between the two. The DTO accepted `@IsString()` and no more, so
 * the Tiptap editor was the only thing shaping the HTML — and Tiptap runs
 * in the browser, which makes it a convenience, not a control. Anyone
 * holding `artigos.criar` (JORNALISTA, the lowest editorial role) could
 * POST a `<script>` straight to the API. It would then run for every
 * reader once published, and — worse, because it needs no publishing
 * right at all — for whichever editor opened the preview to review it.
 *
 * The allowlist below is not a general-purpose "safe HTML" set. It is
 * exactly what the editor can produce, read off its own configuration in
 * RichTextEditor.tsx: StarterKit (headings 1-4, bold, italic, underline,
 * strike, code, codeBlock, blockquote, lists, hr, link) plus Image and
 * TextAlign. Nothing an editor can create through the interface is lost.
 *
 * Deliberately NOT covered by this, and it must stay that way: `Ad.
 * htmlCode`. Advertising embeds (AdSense, Taboola, Outbrain) are script
 * tags by definition — that is what the field is for — and they are
 * written only by someone holding `configuracoes.editar`. Running them
 * through here would silently break every ad on the site.
 */

/**
 * `style` survives only for TextAlign, and only these four values.
 *
 * Matches the VALUE alone — sanitize-html tests each declaration's value,
 * not `property: value`. Written the other way round the first time, and
 * the effect was silent: every centred heading and image in the archive
 * would have quietly gone back to the left on the next save. The test
 * that caught it is in sanitize-content.spec.ts and should stay.
 */
const TEXT_ALIGN = [/^(left|center|right|justify)$/];

export const ARTICLE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'del',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    // Tiptap wraps some marks in these; harmless and it keeps the
    // round-trip through the editor stable.
    'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'class'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    span: ['class'],
    // No `class` on the rest: the article page styles the body through
    // its own `prose` rules, so a class from the payload can only be a
    // way to reposition something over the page furniture.
  },
  allowedStyles: {
    p: { 'text-align': TEXT_ALIGN },
    h1: { 'text-align': TEXT_ALIGN },
    h2: { 'text-align': TEXT_ALIGN },
    h3: { 'text-align': TEXT_ALIGN },
    h4: { 'text-align': TEXT_ALIGN },
  },
  // No `data:` — an image is uploaded and served from /uploads, never
  // inlined, and `data:` is a way to smuggle an SVG (which is a script
  // container) past a check that only looked at the tag name.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  // A relative /uploads/... path has no scheme and must still work.
  allowProtocolRelative: false,
  // Anything not on the list loses its TAG but keeps its TEXT. A stray
  // <div> from a paste becomes its own words rather than vanishing —
  // losing an editor's paragraph is its own kind of damage.
  disallowedTagsMode: 'discard',
  transformTags: {
    // Every outbound link leaves with these whether the editor
    // remembered them or not. `target="_blank"` without `noopener` hands
    // the opened page a handle back to ours.
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener nofollow',
      target: '_blank',
    }),
  },
};

/**
 * Clean an article body. Empty in, empty out.
 *
 * Applied on WRITE (create, update and the autosaved draft), so what sits
 * in the database is already safe and every present and future reader of
 * `content` inherits that without having to remember anything. Cleaning
 * at render time instead would put the cost on the hottest page of the
 * site and would need repeating at each new surface — which is the same
 * shape as the bug that once let `draft` reach the public API.
 */
export function sanitizeArticleContent(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, ARTICLE_SANITIZE_OPTIONS);
}
