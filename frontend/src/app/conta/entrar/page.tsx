import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { safeNext } from "@/lib/reader-api";
import { AuthShell } from "../AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Iniciar sessão — O Patriota Notícias",
  // Auth pages have no business in search results.
  robots: { index: false, follow: false },
};

export default async function ReaderLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!FEATURES.readerArea) notFound();

  const { next } = await searchParams;

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
      <LoginForm next={safeNext(next)} />
    </AuthShell>
  );
}
