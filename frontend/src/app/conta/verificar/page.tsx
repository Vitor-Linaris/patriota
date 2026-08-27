import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiBaseUrl } from "@/lib/api-base";
import { FEATURES } from "@/lib/features";
import { READER_COOKIE } from "@/lib/reader-api";
import { AuthShell } from "../AuthShell";

export const metadata = {
  title: "Confirmar e-mail — O Patriota Notícias",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the verification link sent by e-mail.
 *
 * The token is consumed in a Server Action triggered by a button, not on
 * page load. Mail clients, link scanners and corporate security proxies
 * prefetch GET URLs, and a single-use token burned by a scanner would
 * leave the reader with a dead link and no way back. One click costs
 * nothing and makes the flow deterministic.
 */
export default async function VerificarPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (!FEATURES.readerArea) notFound();

  const { token } = await searchParams;

  async function confirm(formData: FormData) {
    "use server";

    const raw = String(formData.get("token") ?? "");
    if (!raw) redirect("/conta/verificar?erro=1");

    let accessToken: string | undefined;
    try {
      const res = await fetch(`${apiBaseUrl()}/public/reader/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: raw }),
        cache: "no-store",
      });
      if (!res.ok) redirect("/conta/verificar?erro=1");
      accessToken = ((await res.json()) as { accessToken?: string }).accessToken;
    } catch {
      redirect("/conta/verificar?erro=1");
    }

    if (!accessToken) redirect("/conta/verificar?erro=1");

    // Verification returns a session, so the reader lands logged in
    // rather than being asked to type their password again.
    const store = await cookies();
    store.set(READER_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/conta");
  }

  if (!token) {
    return (
      <AuthShell
        title="Ligação inválida"
        subtitle="Esta ligação de confirmação não é válida ou já foi utilizada. Peça uma nova a partir do início de sessão."
        footer={
          <Link
            href="/conta/entrar"
            className="font-semibold text-patriota-pure hover:underline"
          >
            ← Ir para o início de sessão
          </Link>
        }
      >
        <div />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Confirmar o seu e-mail"
      subtitle="Falta apenas um passo para activar a sua conta de leitor."
    >
      <form action={confirm}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="h-12 w-full rounded-[10px] bg-patriota-pure text-[14px] font-bold text-white transition hover:brightness-110 active:brightness-95"
        >
          Confirmar e entrar
        </button>
      </form>
    </AuthShell>
  );
}
