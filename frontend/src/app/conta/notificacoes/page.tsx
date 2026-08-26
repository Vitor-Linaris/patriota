import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { apiBaseUrl } from "@/lib/api-base";
import { FEATURES } from "@/lib/features";
import { AuthShell } from "../AuthShell";

export const metadata = {
  title: "Preferências de notificações — O Patriota Notícias",
  robots: { index: false, follow: false },
};

interface UnsubscribeInfo {
  email: string;
  notifyNewArticles: boolean;
  digestFrequency: string;
  categories: { id: string; slug: string; name: string }[];
}

/**
 * Landing page for the unsubscribe links in the digest e-mails.
 *
 * Deliberately a confirmation, not an action. Mail clients and corporate
 * link scanners prefetch GET URLs, so a page that unsubscribed on load
 * would silently cut readers off from mail they never chose to stop —
 * and they would have no idea why. The GET only describes; the POST in
 * the form below is what mutates.
 *
 * No session required: RFC 8058 needs the List-Unsubscribe target to work
 * with no cookie and no CSRF token, which is why authorisation here is
 * the reader's random unsubscribeToken.
 */
export default async function NotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; categoria?: string; feito?: string }>;
}) {
  if (!FEATURES.readerArea) notFound();

  const { t, categoria, feito } = await searchParams;

  if (feito) {
    return (
      <AuthShell
        title="Preferências actualizadas"
        subtitle={
          feito === "categoria"
            ? "Deixou de receber e-mails sobre essa categoria. Continua a segui-la na sua área de leitor."
            : "Deixou de receber e-mails de notificação. Pode voltar a ligá-los quando quiser."
        }
        footer={
          <Link
            href="/conta/categorias"
            className="font-semibold text-patriota-pure hover:underline"
          >
            Gerir as minhas preferências
          </Link>
        }
      >
        <div />
      </AuthShell>
    );
  }

  if (!t) {
    return (
      <AuthShell
        title="Ligação inválida"
        subtitle="Esta ligação de cancelamento não é válida. Pode gerir as suas preferências a partir da sua conta."
        footer={
          <Link
            href="/conta/entrar"
            className="font-semibold text-patriota-pure hover:underline"
          >
            Iniciar sessão
          </Link>
        }
      >
        <div />
      </AuthShell>
    );
  }

  let info: UnsubscribeInfo | null = null;
  try {
    const res = await fetch(
      `${apiBaseUrl()}/public/reader/unsubscribe?t=${encodeURIComponent(t)}`,
      { cache: "no-store" },
    );
    if (res.ok) info = (await res.json()) as UnsubscribeInfo;
  } catch {
    // Falls through to the invalid-link message below.
  }

  if (!info) {
    return (
      <AuthShell
        title="Ligação inválida ou expirada"
        subtitle="Não conseguimos identificar esta ligação. Inicie sessão para gerir as suas notificações."
        footer={
          <Link
            href="/conta/entrar"
            className="font-semibold text-patriota-pure hover:underline"
          >
            Iniciar sessão
          </Link>
        }
      >
        <div />
      </AuthShell>
    );
  }

  const target = categoria
    ? info.categories.find((c) => c.slug === categoria)
    : undefined;

  async function unsubscribe(formData: FormData) {
    "use server";

    const token = String(formData.get("token") ?? "");
    const categoryId = String(formData.get("categoryId") ?? "");
    const all = formData.get("all") === "1";

    try {
      await fetch(`${apiBaseUrl()}/public/reader/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          ...(all ? { all: true } : { categoryId }),
        }),
        cache: "no-store",
      });
    } catch {
      // Fall through — the redirect below still tells the reader what we
      // intended, and a retry is harmless.
    }

    redirect(`/conta/notificacoes?feito=${all ? "todas" : "categoria"}`);
  }

  return (
    <AuthShell
      title="Cancelar notificações"
      subtitle={`Conta ${info.email}. Escolha o que quer deixar de receber.`}
    >
      <div className="flex flex-col gap-3">
        {target && (
          <form action={unsubscribe}>
            <input type="hidden" name="token" value={t} />
            <input type="hidden" name="categoryId" value={target.id} />
            <button
              type="submit"
              className="h-12 w-full rounded-[10px] bg-patriota-pure text-[14px] font-bold text-white transition hover:brightness-110"
            >
              Deixar de receber sobre {target.name}
            </button>
            <p className="mt-2 text-center text-[12px] text-slate-400">
              Continua a seguir a categoria na sua área de leitor — só param
              os e-mails.
            </p>
          </form>
        )}

        <form action={unsubscribe}>
          <input type="hidden" name="token" value={t} />
          <input type="hidden" name="all" value="1" />
          <button
            type="submit"
            className={
              target
                ? "h-11 w-full rounded-[10px] border border-slate-300 bg-white text-[14px] text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                : "h-12 w-full rounded-[10px] bg-patriota-pure text-[14px] font-bold text-white transition hover:brightness-110"
            }
          >
            Cancelar todos os e-mails de notificação
          </button>
        </form>

        <p className="mt-2 text-center text-[13px] text-slate-500">
          Prefere ajustar em vez de cancelar?{" "}
          <Link
            href="/conta/categorias"
            className="font-semibold text-patriota-pure hover:underline"
          >
            Gerir preferências
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
