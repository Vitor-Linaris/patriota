import Image from "next/image";
import { Container } from "../Container";

const COLUMNS = [
  {
    title: "Editorial",
    items: ["Estatuto", "Equipa", "Política de Correções", "Transparência"],
  },
  {
    title: "Rubricas",
    items: ["Investigação A21", "Entrelinhas", "Ringue", "Vox Pop"],
  },
  {
    title: "Contacto",
    items: ["Redação", "Publicidade", "Assinatura", "Imprensa"],
  },
  {
    title: "Legal",
    items: ["Termos de Uso", "Privacidade", "Cookies", "ERC"],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-patriota-dark text-white">
      <Container className="py-12">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <a href="/" aria-label="O Patriota" className="inline-flex">
            <Image
              src="/brand/Logo-footer.svg"
              alt="O Patriota"
              width={89}
              height={37}
            />
          </a>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h4 className="text-[12px] font-bold uppercase tracking-wider text-patriota-accent">
                  {col.title}
                </h4>
                <ul className="mt-3 flex flex-col gap-2 text-[13px] text-white/70">
                  {col.items.map((it) => (
                    <li key={it}>
                      <a className="hover:text-white" href="#">
                        {it}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-[12px] text-white/50 md:flex-row md:items-center md:justify-between">
          <span>© 2026 O Patriota Notícias. Todos os direitos reservados.</span>
          <span>www.opatriota.pt</span>
        </div>
      </Container>
    </footer>
  );
}
