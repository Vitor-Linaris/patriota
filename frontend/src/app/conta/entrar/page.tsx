import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { safeNext } from "@/lib/reader-api";
import { AuthShell } from "../AuthShell";
import { LoginForm } from "./LoginForm";
import { SocialButtons } from "../SocialButtons";

export const metadata = {
  title: "Iniciar sessão — O Patriota Notícias",
  // Auth pages have no business in search results.
  robots: { index: false, follow: false },
};

export default async function ReaderLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  if (!FEATURES.readerArea) notFound();

  const { next, erro } = await searchParams;

  return (
    <AuthShell
      title="Iniciar sessão"
      subtitle="Aceda à sua área de leitor para guardar notícias, seguir categorias e comentar."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link
            href="/conta/registar"
            className="font-semibold text-patriota-pure hover:underline"
          >
            Criar conta gratuita
          </Link>
        </>
      }
    >
      {/* Where a failed social login lands. Same alert styling as the
          form's own errors below, so a rejected Google sign-in and a
          wrong password read as the same kind of thing. */}
      {erro ? (
        <p
          role="alert"
          className="mb-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700"
        >
          {erro === "1"
            ? "Não foi possível entrar. A ligação expirou ou já foi utilizada — tente novamente."
            : decodeURIComponent(erro)}
        </p>
      ) : null}

      {/* Renders nothing when no provider has credentials configured. */}
      <SocialButtons next={safeNext(next)} />
      <LoginForm next={safeNext(next)} />
    </AuthShell>
  );
}
