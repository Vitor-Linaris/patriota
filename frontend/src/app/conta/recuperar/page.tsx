import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { AuthShell } from "../AuthShell";
import { ForgotForm } from "./ForgotForm";

export const metadata = {
  title: "Recuperar palavra-passe — O Patriota Notícias",
  robots: { index: false, follow: false },
};

export default function ReaderForgotPage() {
  if (!FEATURES.readerArea) notFound();

  return (
    <AuthShell
      title="Recuperar palavra-passe"
      subtitle="Indique o e-mail da sua conta e enviamos-lhe uma ligação para definir uma nova palavra-passe."
      footer={
        <Link
          href="/conta/entrar"
          className="font-semibold text-patriota-pure hover:underline"
        >
          ← Voltar ao início de sessão
        </Link>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
