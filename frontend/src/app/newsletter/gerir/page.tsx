import { apiBaseUrl } from "@/lib/api-base";
import { ManageNewsletterClient } from "./ManageNewsletterClient";

export const metadata = {
  title: "Gerir subscrição — O Patriota Notícias",
  // A page reachable only with a per-subscriber secret in the URL has no
  // business in a search index.
  robots: { index: false, follow: false },
};

interface Subscription {
  email: string;
  name: string;
  status: string;
}

/**
 * Where the link in the newsletter e-mail lands.
 *
 * The token in `?t=` is the authorisation. It exists because the public
 * form could previously cancel any subscription on the strength of a
 * typed address — nothing about that request proved who sent it. This
 * one does, because the link only ever arrives in the inbox that owns
 * the address.
 *
 * The address is shown before anything is done to it: a link with no
 * name on it is a link people click without knowing what it does.
 */
export default async function ManageNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  let subscription: Subscription | null = null;

  if (t) {
    try {
      const res = await fetch(
        `${apiBaseUrl()}/public/newsletter/manage?t=${encodeURIComponent(t)}`,
        { cache: "no-store" },
      );
      if (res.ok) subscription = (await res.json()) as Subscription;
    } catch {
      // Treated the same as an invalid token below: the page says the
      // link did not work, and offers the way back.
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center px-5 py-16">
      <h1 className="text-[26px] font-black leading-tight text-patriota-dark">
        Gerir subscrição
      </h1>

      {subscription ? (
        <ManageNewsletterClient
          token={t!}
          email={subscription.email}
          cancelled={subscription.status === "CANCELADO"}
        />
      ) : (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
          Esta ligação não é válida, ou já foi utilizada. Pode pedir uma nova a
          partir do formulário da newsletter no site.
        </p>
      )}
    </main>
  );
}
