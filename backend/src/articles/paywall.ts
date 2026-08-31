/**
 * Cutting an exclusive article down to a taster.
 *
 * The cut happens HERE, on the server, and the rest of the text is never
 * put in the response at all. A blur in CSS or a slice in the browser is
 * defeated by View Source, which makes it not a paywall but a costume.
 */

/** Roughly how much visible text a non-subscriber gets to read. */
const PREVIEW_BUDGET = 600;

/**
 * The block elements Tiptap emits. Matched non-greedily to its own
 * closing tag, so the preview always ends on a complete element — an
 * unclosed `<blockquote>` handed to dangerouslySetInnerHTML swallows the
 * rest of the page layout into itself.
 */
const BLOCK =
  /<(p|h[1-6]|blockquote|ul|ol|figure|pre)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Visible characters, i.e. what a reader actually gets. */
function textLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').trim().length;
}

/** Plain text, cut on a word boundary and wrapped back into a paragraph. */
function cutToParagraph(html: string, budget: number): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= budget) return `<p>${text}</p>`;
  const slice = text.slice(0, budget);
  const lastSpace = slice.lastIndexOf(' ');
  return `<p>${(lastSpace > budget * 0.6 ? slice.slice(0, lastSpace) : slice).trim()}…</p>`;
}

/**
 * The opening of an article, as complete blocks.
 *
 * Whole elements rather than a character slice: `content` is HTML, and
 * `slice(0, 600)` lands mid-tag about as often as not.
 *
 * The one case that cannot be served by whole blocks is an article whose
 * first paragraph is itself enormous — a wall of text, which does happen.
 * Giving that away whole would be handing over the article, so it falls
 * back to cutting the text and rewrapping it.
 */
export function previewOf(html: string, budget = PREVIEW_BUDGET): string {
  // Never more than half the piece, whatever the budget says.
  //
  // Without this an article shorter than the budget is served whole, and
  // the paywall quietly does nothing for exactly the pieces most likely
  // to be behind it — a short exclusive, a column, a news brief. A fixed
  // character budget only works for articles long enough to exceed it,
  // which is not a property anything guarantees.
  const total = textLength(html);
  const cap = Math.min(budget, Math.floor(total / 2));

  const blocks = html.match(BLOCK) ?? [];

  // Nothing we recognise as block markup: plain text, or an editor we do
  // not model. Cut the text rather than guess at structure.
  const first = blocks[0];
  if (first === undefined) return cutToParagraph(html, cap);

  // A first block that is already over the cap has to be cut inside.
  // Covers both shapes that would otherwise give the game away: the wall
  // of text with no paragraph breaks, and the article so short that one
  // paragraph is the whole of it.
  if (textLength(first) > cap) return cutToParagraph(first, cap);

  const out: string[] = [];
  let used = 0;
  for (const block of blocks) {
    out.push(block);
    used += textLength(block);
    if (used >= cap) break;
  }
  return out.join('');
}
