"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface StaffNotificationRow {
  id: string;
  type: string;
  title: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const TIME = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The bell. Polls its own unread count every 30s — cheap (one indexed
 * count query) and the same cadence used elsewhere in this admin for
 * things nobody is staring at continuously (the redes sociais queue).
 *
 * A badge with a number, not a dot: the client asked specifically for
 * "1, 2, sobe até 5" — the count itself is the point, not just "there is
 * something new".
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<StaffNotificationRow[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    () =>
      fetch("/api/admin/notificacoes?limit=20", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { items: StaffNotificationRow[]; unread: number } | null) => {
          if (!data) return;
          setItems(data.items);
          setUnread(data.unread);
        })
        .catch(() => {
          /* the badge just stays at whatever it last knew */
        }),
    [],
  );

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function markRead(id: string) {
    try {
      await fetch(`/api/admin/notificacoes/${id}/ler`, { method: "POST" });
    } catch {
      /* the next refresh will reconcile either way */
    }
    void refresh();
  }

  async function markAllRead() {
    try {
      await fetch("/api/admin/notificacoes/marcar-todas-lidas", {
        method: "POST",
      });
    } catch {
      /* ditto */
    }
    void refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Notificações — ${unread} por ler`
            : "Notificações"
        }
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <span aria-hidden className="text-[18px]">
          🔔
        </span>
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <p className="text-xs font-bold text-gray-800">Notificações</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="cursor-pointer text-[11px] font-semibold text-patriota-medium hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                A carregar…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                Sem notificações.
              </p>
            ) : (
              items.map((n) => {
                const body = (
                  <div
                    className={`px-4 py-2.5 text-xs leading-snug transition-colors hover:bg-gray-50 ${
                      n.readAt ? "text-gray-500" : "bg-blue-50/50 text-gray-800"
                    }`}
                  >
                    <p className={n.readAt ? "" : "font-semibold"}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      {TIME.format(new Date(n.createdAt))}
                    </p>
                  </div>
                );
                return (
                  <div key={n.id} className="border-b border-gray-50 last:border-0">
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => {
                          setOpen(false);
                          if (!n.readAt) void markRead(n.id);
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.readAt) void markRead(n.id);
                        }}
                        className="w-full cursor-pointer text-left"
                      >
                        {body}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
