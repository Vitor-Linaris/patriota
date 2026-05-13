import { Container } from "../Container";

export function TopBar() {
  return (
    <div className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[12px]">
      <Container className="flex h-9 items-center justify-between">
        <div className="flex items-center gap-4">
          <span>Domingo, 12 de Abril de 2026</span>
          <span aria-hidden className="h-3 w-px bg-slate-300" />
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
              Em atualização
            </span>
          </span>
        </div>
        <nav className="hidden items-center gap-4 sm:flex">
          <a className="hover:text-slate-900" href="#">Pesquisar</a>
          <span aria-hidden className="h-3 w-px bg-slate-300" />
          <a className="hover:text-slate-900" href="#">Newsletter</a>
          <span aria-hidden className="h-3 w-px bg-slate-300" />
          <a className="hover:text-slate-900" href="/admin/login">Login</a>
          <a
            className="rounded-md bg-slate-900 px-3 py-1 text-[12px] font-semibold text-white hover:bg-slate-800"
            href="#"
          >
            Registar
          </a>
        </nav>
      </Container>
    </div>
  );
}
