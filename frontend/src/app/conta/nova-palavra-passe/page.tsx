import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { AuthShell } from "../AuthShell";
import { ResetForm } from "./ResetForm";

export const metadata = {
  title: "Nova palavra-passe — O Patriota Notícias",
  robots: { index: false, follow: false },
};

/**
 * Where the password-reset e-mail lands.
 *
 * The token is consumed by a form submit, never on page load: mail
 * clients and link scanners prefetch GET URLs, and these tokens are
 * single-use, so a scanner would burn it and leave the reader with a
 * dead link and no way back.
 */
export default async function NovaPalavraPassePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (!FEATURES.readerArea) notFound();

  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell
        title="Ligação inválida"
        subtitle="Esta ligação de reposição não é válida ou já foi utilizada. Peça uma nova."
        footer={
          <Link
            href="/conta/recuperar"
            className="font-semibold text-patriota-pure hover:underline"
          >
            Pedir nova ligação
          </Link>
        }
      >
        <div />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Definir nova palavra-passe"
      subtitle="Escolha uma palavra-passe nova. As sessões abertas noutros dispositivos serão terminadas."
      footer={
        <Link
          href="/conta/entrar"
          className="font-semibold text-patriota-pure hover:underline"
        >
          ← Voltar ao início de sessão
        </Link>
      }
    >
      <ResetForm token={token} />
    </AuthShell>
  );
}
