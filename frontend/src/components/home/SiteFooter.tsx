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
          <a href="/" className="flex items-end gap-[3px]" aria-label="O Patriota">
            <Image
              src="/brand/patriota-o.svg"
              alt=""
              width={12}
              height={12}
              className="mb-[8px] brightness-200"
            />
            <div className="flex flex-col">
              <Image
                src="/brand/patriota.svg"
                alt="O Patriota"
                width={80}
                height={26}
                className="brightness-200"
              />
              <Image
                src="/brand/patriota-noticias.svg"
                alt=""
                width={28}
                height={6}
                className="ml-[33px] mt-[1px] brightness-200"
              />
            </div>
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
