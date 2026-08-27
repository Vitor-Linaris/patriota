import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { AuthShell } from "../AuthShell";
import { RegisterForm } from "./RegisterForm";
import { SocialButtons } from "../SocialButtons";

export const metadata = {
  title: "Criar conta — O Patriota Notícias",
  robots: { index: false, follow: false },
};

export default function ReaderRegisterPage() {
  if (!FEATURES.readerArea) notFound();

  return (
    <AuthShell
      title="Criar conta gratuita"
      subtitle="Guarde notícias, siga as categorias que lhe interessam e participe nos comentários."
      footer={
        <>
          Já tem conta?{" "}
          <Link
            href="/conta/entrar"
            className="font-semibold text-patriota-pure hover:underline"
          >
            Iniciar sessão
          </Link>
        </>
      }
    >
      {/* Signing up with a provider skips e-mail verification entirely,
          so it goes first. */}
      <SocialButtons />
      <RegisterForm />
    </AuthShell>
  );
}
