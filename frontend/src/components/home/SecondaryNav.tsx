import { Container } from "../Container";

const ITEMS = [
  "Portugal",
  "Mundo",
  "Justiça",
  "Tecnologia",
  "Saúde",
  "Cultura",
  "Desporto",
];

export function SecondaryNav() {
  return (
    <div className="bg-[#f0f2f7]">
      <Container className="flex h-9 items-center gap-6 overflow-x-auto text-[12px] font-medium text-[#667085]">
        {ITEMS.map((it) => (
          <a
            key={it}
            href="#"
            className="whitespace-nowrap transition hover:text-slate-900"
          >
            {it}
          </a>
        ))}
      </Container>
    </div>
  );
}
