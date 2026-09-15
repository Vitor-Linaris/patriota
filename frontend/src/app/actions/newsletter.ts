"use server";

import { apiBaseUrl } from "@/lib/api-base";
import { clientIpHeaders } from "@/lib/client-ip";

function validateEmail(email: string):
  | { ok: true; email: string }
  | { ok: false; error: string } {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Indique um e-mail." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "E-mail inválido." };
  }
  return { ok: true, email: trimmed };
}

export async function publicSubscribeAction(email: string, name?: string) {
  const v = validateEmail(email);
  if (!v.ok) return { ok: false as const, error: v.error };
  try {
    const res = await fetch(`${apiBaseUrl()}/public/newsletter/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Per-visitor rate limiting; see lib/client-ip.ts.
        ...(await clientIpHeaders()),
      },
      body: JSON.stringify({ email: v.email, name: name?.trim() }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      return {
        ok: false as const,
        error: body.message ?? "Falha ao subscrever.",
      };
    }
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "Não foi possível contactar o servidor.",
    };
  }
}

export async function publicUnsubscribeAction(email: string) {
  const v = validateEmail(email);
  if (!v.ok) return { ok: false as const, error: v.error };
  try {
    const res = await fetch(`${apiBaseUrl()}/public/newsletter/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: v.email }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      return {
        ok: false as const,
        error: body.message ?? "Falha ao cancelar a subscrição.",
      };
    }
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "Não foi possível contactar o servidor.",
    };
  }
}

/**
 * The three token endpoints behind /newsletter/gerir.
 *
 * The token is the authorisation on all of them, and it only ever
 * reaches the inbox that owns the address — which is the whole point:
 * an e-mail typed into a public form proves nothing about who typed it,
 * and cancelling a subscription used to run on exactly that.
 */
async function postToken(path: string, token: string) {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false as const, error: "A ligação já não é válida." };
    }
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "Não foi possível contactar o servidor.",
    };
  }
}

export async function newsletterUnsubscribeByTokenAction(token: string) {
  return postToken("/public/newsletter/manage/unsubscribe", token);
}

export async function newsletterForgetAction(token: string) {
  return postToken("/public/newsletter/manage/forget", token);
}
