import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api-base";

/**
 * Reader-side counterpart to lib/api.ts.
 *
 * Deliberately NOT a copy of it, in two ways that matter:
 *
 *  1. It reads ONLY `patriota_reader` and never falls back to
 *     `patriota_session`. Both cookies legitimately coexist in one browser
 *     (a journalist reading the site while logged into the backoffice), so
 *     a "convenience" fallback in either direction would hand a reader
 *     token to an admin route handler, or vice versa.
 *  2. readerApiFetch NEVER redirects. apiFetch bounces to /admin/login on a
 *     missing cookie, which is right for a backoffice where every page is
 *     private. Public pages need to render for anonymous visitors, so this
 *     returns null instead and lets the caller decide.
 */
export const READER_COOKIE = "patriota_reader";

export interface ReaderMe {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  status: "PENDENTE_VERIFICACAO" | "ATIVO" | "SUSPENSO" | "ANONIMIZADO";
  plan: "GRATIS" | "PREMIUM";
  displayNamePublic: boolean;
  notifyNewArticles: boolean;
  digestFrequency: "IMEDIATO" | "DIARIO" | "SEMANAL" | "NUNCA";
  createdAt: string;
  lastLoginAt: string | null;
  hasPassword: boolean;
  counts: {
    categorias: number;
    artigos: number;
    comentarios: number;
    historico: number;
  };
}

/** The raw reader token, or null when the visitor is anonymous. */
export async function getReaderToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(READER_COOKIE)?.value ?? null;
}

/**
 * Authenticated fetch against the backend as a reader.
 * Returns null when there is no session — never throws, never redirects.
 */
export async function readerApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const token = await getReaderToken();
  if (!token) return null;

  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // The public site must survive the API being down.
    return null;
  }
}

/**
 * Only accept a same-origin path.
 *
 * `//evil.com` is a protocol-relative URL: it passes a naive
 * startsWith("/") check and the browser happily treats it as absolute.
 * Anything that fails this falls back to the dashboard.
 */
export function safeNext(next: string | undefined): string {
  if (!next) return "/conta";
  return /^\/(?!\/)/.test(next) ? next : "/conta";
}

/**
 * Loads the current reader, or sends them to the login page.
 * Called once in conta/layout.tsx; pages below it can then use
 * readerApiFetch freely without each re-checking.
 */
export async function requireReader(nextPath = "/conta"): Promise<ReaderMe> {
  const res = await readerApiFetch("/reader/me");

  if (!res || !res.ok) {
    redirect(`/conta/entrar?next=${encodeURIComponent(safeNext(nextPath))}`);
  }

  return (await res.json()) as ReaderMe;
}
