import { Container } from "../Container";

export function TopBar() {
  return (
    <div className="bg-patriota-medium text-[#d0d5dd] text-[12px]">
      <Container className="flex h-9 items-center justify-between">
        <div className="flex items-center gap-4">
          <span>Domingo, 12 de Abril de 2026</span>
          <span aria-hidden className="h-3 w-px bg-white/20" />
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-patriota-accent animate-pulse" />
            <span className="text-[12px] font-medium uppercase tracking-wide text-patriota-accent">
              Em atualização
            </span>
          </span>
        </div>
        <nav className="hidden items-center gap-4 sm:flex">
          <a className="hover:text-white" href="#">Pesquisar</a>
          <span aria-hidden className="h-3 w-px bg-white/20" />
          <a className="hover:text-white" href="#">Newsletter</a>
          <span aria-hidden className="h-3 w-px bg-white/20" />
          <a className="hover:text-white" href="/admin/login">Login</a>
          <a
            className="rounded bg-patriota-accent px-2.5 py-0.5 text-[12px] font-medium text-patriota-medium hover:brightness-105"
            href="#"
          >
            Registar
          </a>
        </nav>
      </Container>
    </div>
  );
}
