import { Container } from "../Container";

const HEADLINES = [
  "Assembleia da República aprova nova lei do arrendamento",
  "TAP regista lucro operacional pelo segundo trimestre consecutivo",
  "Conselho de Ministros reúne hoje para aprovar pacote habitacional",
];

export function BreakingNews() {
  return (
    <div className="bg-gradient-to-b from-patriota-dark via-patriota-medium to-patriota-dark">
      <Container className="flex h-10 items-center gap-6">
        <span className="rounded bg-patriota-accent px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-patriota-medium">
          Última hora
        </span>
        <div className="flex flex-1 items-center gap-7 overflow-hidden text-[14px]">
          {HEADLINES.map((h, i) => (
            <a
              key={i}
              href="#"
              className={`whitespace-nowrap transition hover:text-white ${
                i === 0 ? "text-white" : "text-white/60 hidden lg:inline"
              }`}
            >
              {h}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          <span className="h-2 w-5 rounded-full bg-patriota-accent" />
          <span className="h-2 w-2 rounded-full bg-white/30" />
          <span className="h-2 w-2 rounded-full bg-white/30" />
        </div>
      </Container>
    </div>
  );
}
