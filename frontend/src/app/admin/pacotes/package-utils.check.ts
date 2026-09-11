/**
 * Assertions for the pacote editor's pure helpers.
 *
 * Run with `npm run check:pacotes`. A plain Node script rather than a spec
 * because the frontend has no test runner — same reasoning as
 * categorias/tree-utils.check.ts next door.
 *
 * The price maths is the part of this feature that can be wrong without
 * looking wrong, and being wrong means charging somebody the wrong amount.
 */
import assert from "node:assert";
import {
  centsToEuros,
  eurosToCents,
  formatPrice,
  moveItem,
  slugPreview,
} from "./package-utils.ts";

// ── eurosToCents ─────────────────────────────────────────────────────

assert.strictEqual(eurosToCents("9.99"), 999);
// A Portuguese keyboard types this. Reading it as 9 would put a €9,99
// pacote on sale for €9.
assert.strictEqual(eurosToCents("9,99"), 999);
assert.strictEqual(eurosToCents("10"), 1000);
assert.strictEqual(eurosToCents("0,05"), 5);
assert.strictEqual(eurosToCents(" 12,50 "), 1250);
assert.strictEqual(eurosToCents("12,50 €"), 1250);
assert.strictEqual(eurosToCents("1,1"), 110);

// Float binary representation: 0.1 * 100 is 10.000000000000002, and
// 8.29 * 100 is 828.9999999999999. Truncating either is wrong.
assert.strictEqual(eurosToCents("0,10"), 10);
assert.strictEqual(eurosToCents("8,29"), 829);
assert.strictEqual(eurosToCents("1,15"), 115);

// Not prices. null so the caller refuses to save, rather than sending
// NaN or 0 to the API.
assert.strictEqual(eurosToCents(""), null);
assert.strictEqual(eurosToCents("   "), null);
assert.strictEqual(eurosToCents("grátis"), null);
assert.strictEqual(eurosToCents("9,999"), null, "três decimais não é um preço");
assert.strictEqual(eurosToCents("-5"), null);
assert.strictEqual(eurosToCents("1,2,3"), null);
assert.strictEqual(eurosToCents("9,99abc"), null);

// ── round trip ───────────────────────────────────────────────────────

for (const cents of [0, 5, 10, 99, 100, 829, 999, 1250, 100000]) {
  assert.strictEqual(
    eurosToCents(centsToEuros(cents)),
    cents,
    `ida e volta falhou em ${cents}c`,
  );
}

assert.strictEqual(centsToEuros(999), "9,99");
assert.strictEqual(centsToEuros(1000), "10,00");
assert.strictEqual(centsToEuros(5), "0,05");

// ── formatPrice ──────────────────────────────────────────────────────

// Non-breaking space and the symbol after the number, which is what
// pt-PT does. Asserted loosely: the exact spacing is ICU's business and
// changes between Node versions.
const shown = formatPrice(990);
assert.ok(shown.includes("9,90"), `esperava 9,90 em "${shown}"`);
assert.ok(shown.includes("€"), `esperava o símbolo em "${shown}"`);

// ── moveItem ─────────────────────────────────────────────────────────

assert.deepStrictEqual(moveItem(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
assert.deepStrictEqual(moveItem(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
assert.deepStrictEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "c", "b"]);

// Off the ends is a no-op, not a throw: the buttons are disabled there,
// and a double-click race must not crash the editor.
assert.deepStrictEqual(moveItem(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
assert.deepStrictEqual(moveItem(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
assert.deepStrictEqual(moveItem(["a", "b", "c"], 9, 1), ["a", "b", "c"]);

// A copy, never the same reference — the caller feeds this to setState.
const original = ["a", "b"];
assert.notStrictEqual(moveItem(original, 0, 1), original);
assert.deepStrictEqual(original, ["a", "b"], "o array original mudou");

// ── slugPreview ──────────────────────────────────────────────────────

assert.strictEqual(slugPreview("Dossiê Habitação 2026"), "dossie-habitacao-2026");
assert.strictEqual(slugPreview("  Eleições — 2026!  "), "eleicoes-2026");
assert.strictEqual(slugPreview("Corrupção"), "corrupcao");
assert.strictEqual(slugPreview("---"), "");

console.log("check:pacotes OK");
