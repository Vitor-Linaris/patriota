"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "./login/actions";

interface Props {
  name: string;
  email: string;
  roleLabel: string;
  initials: string;
}

const ROLE_PILL: Record<string, string> = {
  "Super Admin": "bg-red-100 text-red-700",
  "Editor-Chefe": "bg-purple-100 text-purple-700",
  Editor: "bg-blue-100 text-blue-700",
  Jornalista: "bg-green-100 text-green-700",
  Revisor: "bg-amber-100 text-amber-700",
  Moderador: "bg-orange-100 text-orange-700",
  Analista: "bg-gray-100 text-gray-600",
};

export function UserDropdown({ name, email, roleLabel, initials }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-gray-400">Sessão como</span>
      <span
        className={`rounded-full px-2.5 py-1 font-bold ${ROLE_PILL[roleLabel] ?? "bg-gray-100 text-gray-600"}`}
      >
        {roleLabel}
      </span>

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F2C6B] text-xs font-black text-[#FFCC66] transition-all hover:ring-2 hover:ring-[#FFCC66]/40"
        >
          {initials}
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-xs font-bold text-gray-800">{name}</p>
              <p className="truncate text-xs text-gray-400">{email}</p>
            </div>
            <Link
              href="/admin/perfil"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <span>◎</span> Ver perfil
            </Link>
            <Link
              href="/admin/configuracoes"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <span>⊙</span> Configurações
            </Link>
            <form action={logoutAction} className="border-t border-gray-100">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-50"
              >
                <span>⎋</span> Terminar sessão
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
