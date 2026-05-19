import { Container } from "../Container";
import { FEATURES } from "@/lib/features";

function formatToday(): string {
  const long = new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return long.charAt(0).toUpperCase() + long.slice(1);
}

export function TopBar() {
  return (
    <div className="bg-patriota-medium text-[#d0d5dd] text-[12px]">
      <Container className="flex h-9 items-center justify-between">
        <div className="flex items-center gap-4">
          <span>{formatToday()}</span>
          <span aria-hidden className="h-3 w-px bg-white/20" />
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-patriota-accent animate-pulse" />
            <span className="text-[12px] font-medium uppercase tracking-wide text-patriota-accent">
              Em atualização
            </span>
          </span>
        </div>
        <nav className="hidden items-center gap-4 sm:flex">
          <a className="hover:text-white" href="#">
            Pesquisar
          </a>
          <span aria-hidden className="h-3 w-px bg-white/20" />
          <a className="hover:text-white" href="#">
            Newsletter
          </a>
          {FEATURES.publicAuth && (
            <>
              <span aria-hidden className="h-3 w-px bg-white/20" />
              <a className="hover:text-white" href="/admin/login">
                Login
              </a>
              <a
                className="rounded bg-patriota-accent px-2.5 py-0.5 text-[12px] font-medium text-patriota-medium hover:brightness-105"
                href="#"
              >
                Registar
              </a>
            </>
          )}
        </nav>
      </Container>
    </div>
  );
}
