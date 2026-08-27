import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiBaseUrl } from "@/lib/api-base";
import { FEATURES } from "@/lib/features";
import { READER_COOKIE, safeNext } from "@/lib/reader-api";
import { AuthShell } from "../AuthShell";

export const metadata = {
  title: "A entrar… — O Patriota Notícias",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the OAuth callback.
 *
 * The backend redirects here carrying a ONE-TIME CODE, never the session
 * token: a JWT in a redirect URL ends up in browser history, in the
 * Referer of every subsequent request, and in the access log of every
 * proxy in between. This page trades the code for the token server-side
 * and writes the httpOnly cookie, so the token never reaches the URL bar.
 *
 * The exchange runs during render rather than behind a button, unlike
 * /conta/verificar. That is deliberate and safe here: the code lives 60
 * seconds, it only exists because the reader just completed a consent
 * screen, and there is no e-mail for a scanner to prefetch.
 */
export default async function OAuthLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string; erro?: string }>;
}) {
  if (!FEATURES.readerArea) notFound();

  const { code, next, erro } = await searchParams;

  if (!erro && code) {
    let accessToken: string | undefined;

    try {
      const res = await fetch(`${apiBaseUrl()}/public/reader/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store",
      });
      if (res.ok) {
        accessToken = ((await res.json()) as { accessToken?: string })
          .accessToken;
      }
    } catch {
      // Falls through to the failure card below.
    }

    if (accessToken) {
      const store = await cookies();
      store.set(READER_COOKIE, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        // "lax", not "strict": this render IS the landing of a
        // cross-site top-level redirect from the provider, and a strict
        // cookie set here would not be sent on the redirect that follows.
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      redirect(safeNext(next));
    }
  }

  // Everything else — a spent code, an expired one, a refused link, or
  // the reader hitting Back onto this URL.
  return (
    <AuthShell
      title="Não foi possível entrar"
      subtitle={
        erro && erro !== "1"
          ? decodeURIComponent(erro)
          : "A ligação expirou ou já foi utilizada. Tente iniciar sessão novamente."
      }
      footer={
        <Link
          href="/conta/entrar"
          className="font-semibold text-patriota-pure hover:underline"
        >
          ← Voltar ao início de sessão
        </Link>
      }
    >
      <div />
    </AuthShell>
  );
}
