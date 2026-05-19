"use server";

function apiUrl(): string {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://api:8585"
  );
}

export async function publicSubscribeAction(email: string, name?: string) {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false as const, error: "Indique um e-mail." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false as const, error: "E-mail inválido." };
  }
  try {
    const res = await fetch(`${apiUrl()}/public/newsletter/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed, name: name?.trim() }),
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
