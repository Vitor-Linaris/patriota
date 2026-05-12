import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

const features = [
  { glyph: "◈", label: "Gestão de artigos e publicações" },
  { glyph: "◆", label: "Controlo de permissões RBAC" },
  { glyph: "◎", label: "Gestão de utilizadores e roles" },
  { glyph: "◉", label: "Analytics e métricas editoriais" },
];

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-patriota-medium lg:flex-row">
      {/* Left panel — institutional */}
      <aside className="relative flex w-full flex-col justify-between border-b border-white/5 bg-patriota-dark px-12 py-12 lg:w-[460px] lg:border-b-0 lg:border-r">
        {/* Logo */}
        <div className="flex items-end gap-[2px]">
          <Image
            src="/brand/patriota-o.svg"
            alt=""
            width={14}
            height={14}
            className="mb-[8px]"
            priority
          />
          <div className="flex flex-col">
            <Image
              src="/brand/patriota.svg"
              alt="O Patriota"
              width={91}
              height={30}
              priority
            />
            <Image
              src="/brand/patriota-noticias.svg"
              alt=""
              width={31}
              height={7}
              className="ml-[37px] mt-[1px]"
              priority
            />
          </div>
        </div>

        {/* Headline + features */}
        <div className="mt-16 lg:mt-0">
          <h1 className="text-[30px] font-black leading-[37.5px] text-white">
            Área de
            <br />
            <span className="text-patriota-accent">Administração</span>
          </h1>

          <p className="mt-4 max-w-[360px] text-sm leading-[22.75px] text-white/40">
            Sistema de gestão editorial. Acesso reservado à equipa de redacção
            e administradores autorizados.
          </p>

          <ul className="mt-6 space-y-3">
            {features.map((f) => (
              <li
                key={f.label}
                className="flex items-center gap-3 text-sm leading-5 text-white/50"
              >
                <span
                  aria-hidden
                  className="inline-flex w-4 justify-center text-base text-patriota-accent/60"
                >
                  {f.glyph}
                </span>
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Reserved-access notice */}
        <div className="mt-12 border-t border-white/5 pt-8 lg:mt-0">
          <div className="rounded-[12px] border border-[rgba(123,51,6,0.4)] bg-[rgba(70,25,1,0.4)] px-4 py-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="text-[18px] leading-[28px] text-[#ffb900]"
              >
                ⚠
              </span>
              <div>
                <p className="text-[12px] font-bold leading-4 text-[#ffd230]">
                  Acesso reservado
                </p>
                <p className="mt-2 text-[10px] leading-[16.25px] text-[rgba(254,230,133,0.55)]">
                  Este sistema é de uso exclusivo da equipa autorizada.
                  Tentativas de acesso não autorizado são registadas e podem
                  ter consequências legais.
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Right panel — form */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
        <div className="flex w-full max-w-[448px] flex-col">
          <header>
            <h2 className="text-2xl font-black leading-8 text-white">
              Autenticação
            </h2>
            <p className="mt-2 text-sm leading-5 text-white/60">
              Introduza as suas credenciais de acesso ao backoffice.
            </p>
          </header>

          <div className="mt-8">
            <LoginForm />
          </div>

          <Link
            href="/"
            className="mt-10 self-center text-xs text-white/40 transition hover:text-white/70"
          >
            ← Voltar ao site público
          </Link>
        </div>
      </main>
    </div>
  );
}
