import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { AuthShell } from "../AuthShell";
import { RegisterForm } from "./RegisterForm";

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
      <RegisterForm />
    </AuthShell>
  );
}
