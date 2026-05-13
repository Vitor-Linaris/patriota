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
    <div className="bg-white border-b border-slate-200">
      <Container className="flex h-9 items-center gap-7 overflow-x-auto text-[13px] text-slate-600">
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
