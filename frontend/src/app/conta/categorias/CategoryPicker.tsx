"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface PickableCategory {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  following: boolean;
  /** Only meaningful while following. */
  notify: boolean;
  since: string | null;
  /**
   * Still on offer. False on a section the reader follows that the
   * newsroom has since withdrawn — kept on screen so they can turn it
   * off, which is the one thing they would otherwise be unable to do.
   */
  available: boolean;
}

/**
 * The whole catalogue, with a switch on each row.
 *
 * Replaces a page that listed only what somebody already followed and,
 * to anybody following nothing, said "use the Seguir button on an
 * article" — sending the reader away to discover the feature by
 * accident. Here is the paper; pick.
 *
 * Top-level sections only — the backend (listFollowableCategories())
 * only returns depth 0 rows. Subsections used to be listed too, each
 * with its own follow button, which offered a choice that never
 * existed: following "Portugal › Madeira" was the same subscription as
 * following "Portugal", registered on a different node. Flattening the
 * list to sections a reader can actually subscribe to on their own is
 * the fix, not a missing indent.
 *
 * Following and e-mail are separate switches on purpose: a reader may
 * want a section on their account without a message every time it
 * publishes.
 */
export function CategoryPicker({ initial }: { initial: PickableCategory[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyFollowed, setOnlyFollowed] = useState(false);

  const followedCount = items.filter((c) => c.following).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (onlyFollowed && !c.following) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q);
    });
  }, [items, query, onlyFollowed]);

  /** Applies a change locally, then asks the server; rolls back on no. */
  async function change(
    cat: PickableCategory,
    next: { following: boolean; notify: boolean },
  ) {
    setBusy(cat.id);
    setFailed(null);
    const before = items;
    setItems((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, ...next } : c)),
    );

    try {
      const res = next.following
        ? await fetch("/api/conta/favorites", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "category",
              id: cat.id,
              notify: next.notify,
            }),
          })
        : await fetch("/api/conta/favorites", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "category", id: cat.id }),
          });
      if (!res.ok) throw new Error("failed");
    } catch {
      // Put it back rather than leaving the page claiming something the
      // server never accepted.
      setItems(before);
      setFailed(cat.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Procurar secção…"
          aria-label="Procurar secção"
          className="min-w-0 flex-1 rounded-[10px] border border-slate-200 px-3 py-2 text-[14px] text-slate-800 outline-none transition focus:border-patriota-pure"
        />
        <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[13px] text-slate-600">
          <input
            type="checkbox"
            checked={onlyFollowed}
            onChange={(e) => setOnlyFollowed(e.target.checked)}
            className="h-4 w-4 accent-patriota-pure"
          />
          Só as que sigo ({followedCount})
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-8 text-center text-[14px] text-slate-500">
          {onlyFollowed && followedCount === 0
            ? "Ainda não segue nenhuma secção. Desmarque a caixa para ver todas."
            : "Nenhuma secção corresponde a essa procura."}
        </p>
      ) : (
        // Grelha, não uma lista vertical — só há 22 secções de topo hoje,
        // mas cada uma que a redacção abrir alonga uma lista de uma só
        // coluna até virar um scroll infindável. Três colunas no
        // desktop encaixam o mesmo número de secções em um terço da
        // altura; menos colunas conforme o ecrã estreita, uma coluna só
        // no telemóvel, onde três cartões espremidos ficariam
        // ilegíveis.
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <li
              key={c.id}
              className={`flex flex-col gap-3 rounded-[12px] border bg-white p-4 ${
                c.following ? "border-patriota-pure/40" : "border-slate-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px]"
                  style={{ backgroundColor: `${c.color}1a`, color: c.color }}
                >
                  {c.icon}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/categoria/${c.slug}`}
                    className="block truncate text-[15px] font-bold text-slate-900 transition hover:text-patriota-pure"
                  >
                    {c.name}
                  </Link>
                  {!c.available && (
                    <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      já não é oferecida
                    </span>
                  )}
                </div>
              </div>

              {failed === c.id && (
                <p className="text-[12px] font-semibold text-red-600">
                  Não foi possível guardar. Tente de novo.
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                {/* E-mail only makes sense while following, so it appears
                    with the follow rather than sitting there greyed out
                    on every card of the catalogue. */}
                {c.following ? (
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={c.notify}
                      disabled={busy === c.id}
                      onChange={(e) =>
                        void change(c, {
                          following: true,
                          notify: e.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-patriota-pure"
                    />
                    E-mails
                  </label>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  disabled={busy === c.id}
                  onClick={() =>
                    void change(c, {
                      following: !c.following,
                      // Following from here opts into e-mail, which is
                      // what somebody ticking "seguir" on a news site
                      // expects; the switch beside it turns that off
                      // without giving up the section.
                      notify: !c.following,
                    })
                  }
                  className={`shrink-0 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                    c.following
                      ? "border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900"
                      : "bg-patriota-pure text-white hover:brightness-110"
                  }`}
                >
                  {busy === c.id
                    ? "…"
                    : c.following
                      ? "A seguir"
                      : "Seguir"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
