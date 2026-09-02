/**
 * Assertions for the flat-tree mechanics behind the drag-and-drop admin.
 *
 * Run with `npm run check:tree`. This is a plain Node script rather than
 * a spec because the frontend has no test runner — adding one for a
 * single module would be a bigger change than the module. The projection
 * maths is the part of this feature that can be wrong without looking
 * wrong, so it gets pinned down here.
 */
import assert from "node:assert";
import {
  INDENT_WIDTH,
  applyMove,
  flatten,
  getProjection,
  subtreeHeight,
  withoutCollapsed,
  withoutDescendants,
  type FlatNode,
  type TreeNode,
} from "./tree-utils.ts";

const n = (
  id: string,
  parentId: string | null,
  depth: number,
  order: number,
  children: TreeNode[] = [],
): TreeNode => ({
  id,
  name: id,
  slug: id,
  description: "",
  followable: true,
  icon: "◆",
  color: "#000",
  visible: true,
  parentId,
  depth,
  order,
  articleCount: 0,
  articleCountTotal: 0,
  children,
});

// portugal > madeira > funchal > se ; desporto (root)
const tree: TreeNode[] = [
  n("pt", null, 0, 0, [
    n("ma", "pt", 1, 0, [n("fu", "ma", 2, 0, [n("se", "fu", 3, 0)])]),
  ]),
  n("dp", null, 0, 1),
];

const flat = flatten(tree);
assert.deepEqual(
  flat.map((f) => f.id),
  ["pt", "ma", "fu", "se", "dp"],
  "flatten must be depth-first",
);
assert.deepEqual(
  flat.map((f) => f.depth),
  [0, 1, 2, 3, 0],
);

// ── subtree height ──────────────────────────────────────────────────
assert.equal(subtreeHeight(flat, "pt"), 3);
assert.equal(subtreeHeight(flat, "ma"), 2);
assert.equal(subtreeHeight(flat, "se"), 0);

// ── descendants are removed from the drag list ──────────────────────
const dragging = withoutDescendants(flat, "ma");
assert.deepEqual(
  dragging.map((f) => f.id),
  ["pt", "ma", "dp"],
  "the dragged node stays; its descendants must not be droppable targets",
);

// ── collapse ────────────────────────────────────────────────────────
assert.deepEqual(
  withoutCollapsed(flat, new Set(["ma"])).map((f) => f.id),
  ["pt", "ma", "dp"],
  "collapsing ma must hide its whole subtree, not just direct children",
);

// ── projection: depth ceiling from the travelling subtree ───────────
// Drag `ma` (height 2) onto `dp`, pushed far right. Without the
// subtree-height clamp this would nest it under dp at depth 1, putting
// `se` at depth 4 — one past the limit.
{
  const list = withoutDescendants(flat, "ma"); // pt, ma, dp
  const p = getProjection(list, "ma", "dp", INDENT_WIDTH * 5, 2);
  assert.equal(p.depth, 1, "ma may reach depth 1: 1 + height 2 = 3, the max");
  // Dropped onto dp it lands BELOW dp, so nesting right nests under dp.
  assert.equal(p.parentId, "dp");
}
{
  // Same drag but `pt` also carries height — pretend the dragged node is
  // `pt` itself (height 3): it can only ever sit at the root.
  const list = withoutDescendants(flat, "pt"); // pt, dp
  const p = getProjection(list, "pt", "dp", INDENT_WIDTH * 5, 3);
  assert.equal(p.depth, 0, "a 4-level branch can only live at the root");
  assert.equal(p.parentId, null);
}

// ── projection: floor from the item below ───────────────────────────
{
  // Drop `dp` between `pt` and `ma` with no horizontal push. `ma` sits at
  // depth 1 below it, so dp cannot be shallower than 1 without orphaning.
  const p = getProjection(flat, "dp", "ma", 0, 0);
  assert.ok(p.depth >= 1, `expected depth >= 1, got ${p.depth}`);
}

// ── applyMove rewrites the whole travelling subtree ──────────────────
{
  const list = withoutDescendants(flat, "ma");
  const p = getProjection(list, "ma", "dp", -INDENT_WIDTH * 5, 2); // drag left
  assert.equal(p.depth, 0, "dragged hard left, ma becomes a root");

  const after = applyMove(flat, "ma", p);
  const byId = Object.fromEntries(after.map((f: FlatNode) => [f.id, f]));
  assert.equal(byId.ma.depth, 0);
  assert.equal(byId.ma.parentId, null);
  assert.equal(byId.fu.depth, 1, "descendants shift by the same delta");
  assert.equal(byId.se.depth, 2);
  assert.equal(byId.fu.parentId, "ma", "inner parentIds are untouched");
  assert.equal(after.length, flat.length, "no node lost or duplicated");
}

// ── applyMove keeps depth-first order ───────────────────────────────
{
  const list = withoutDescendants(flat, "ma");
  const p = getProjection(list, "ma", "dp", 0, 2);
  const after = applyMove(flat, "ma", p);
  for (let i = 1; i < after.length; i++) {
    assert.ok(
      after[i].depth <= after[i - 1].depth + 1,
      `depth jumped by more than 1 at ${after[i].id}: ${after
        .map((a: FlatNode) => `${a.id}@${a.depth}`)
        .join(" ")}`,
    );
  }
}

console.log("✓ tree-utils: todas as asserções passaram");
