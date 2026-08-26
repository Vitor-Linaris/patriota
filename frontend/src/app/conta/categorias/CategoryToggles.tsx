"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface FollowedCategory {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  notify: boolean;
  since: string;
}

/**
 * Muting e-mails is deliberately separate from unfollowing: a reader may
 * want a category on their dashboard without the notifications, so each
 * row carries both a switch and a remove.
 */
export function CategoryToggles({ initial }: { initial: FollowedCategory[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function setNotify(cat: FollowedCategory, notify: boolean) {
    setBusy(cat.id);
    setItems((prev) => prev.map((c) => (c.id === cat.id ? { ...c, notify } : c)));
    try {
      const res = await fetch("/api/conta/favorites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "category", id: cat.id, notify }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      // Put the switch back where it was rather than leaving the UI
      // claiming something the server never accepted.
      setItems((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, notify: !notify } : c)),
      );
    } finally {
      setBusy(null);
    }
  }

  async function unfollow(cat: FollowedCategory) {
    setBusy(cat.id);
    const snapshot = items;
    setItems((prev) => prev.filter((c) => c.id !== cat.id));
    try {
      const res = await fetch("/api/conta/favorites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "category", id: cat.id }),
      });
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setItems(snapshot);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((c) => (
        <li
          key={c.id}
          className="flex flex-wrap items-center gap-3 rounded-[12px] border border-slate-200 bg-white px-4 py-3"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px]"
            style={{ backgroundColor: `${c.color}1a`, color: c.color }}
          >
            {c.icon}
          </span>

          <Link
            href={`/categoria/${c.slug}`}
            className="min-w-0 flex-1 text-[15px] font-bold text-slate-900 transition hover:text-patriota-pure"
          >
            {c.name}
          </Link>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-600">
            <input
              type="checkbox"
              checked={c.notify}
              disabled={busy === c.id}
              onChange={(e) => void setNotify(c, e.target.checked)}
              className="h-4 w-4 accent-patriota-pure"
            />
            E-mails
          </label>

          <button
            type="button"
            disabled={busy === c.id}
            onClick={() => void unfollow(c)}
            className="rounded-[8px] border border-slate-300 px-3 py-1.5 text-[13px] text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-50"
          >
            Deixar de seguir
          </button>
        </li>
      ))}
    </ul>
  );
}
