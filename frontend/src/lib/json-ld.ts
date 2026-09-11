/**
 * Serialise an object for a <script type="application/ld+json"> block.
 *
 * `JSON.stringify` is not enough on its own, and the gap is easy to miss:
 * it escapes quotes and backslashes, but it does NOT escape `<`. So a
 * value containing `</script>` — a headline, a category name, an author's
 * display name — closes the tag early and everything after it is parsed
 * as HTML by the browser. That is a script-injection sink, reached
 * through a field somebody types into the CMS.
 *
 * Escaping `<` as its unicode form fixes it without changing the data:
 * `<` is the same character to any JSON parser, and Google reads
 * this block with a JSON parser. `&` is escaped for the same reason one
 * step removed — it cannot break out here, but it stops a value being
 * re-interpreted as an HTML entity by anything that later copies this
 * text into a different context.
 *
 * Use this for EVERY JSON-LD block. The alternative is remembering the
 * rule at each call site, and the two that existed before this helper
 * both carried a comment asserting the input was safe when it was in
 * fact editor-controlled.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
