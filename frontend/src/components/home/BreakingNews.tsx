import { Container } from "../Container";

const HEADLINES = [
  "Assembleia da República aprova nova lei do arrendamento",
  "TAP regista lucro operacional pelo segundo trimestre consecutivo",
  "Conselho de Ministros reúne hoje para aprovar pacote habitacional",
];

export function BreakingNews() {
  return (
    <div className="bg-white border-b border-slate-200">
      <Container className="flex h-10 items-center gap-6">
        <span className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
          Última hora
        </span>
        <div className="flex flex-1 items-center gap-8 overflow-hidden text-[13px] text-slate-700">
          {HEADLINES.map((h, i) => (
            <a
              key={i}
              href="#"
              className={`whitespace-nowrap hover:text-slate-900 ${
                i > 0 ? "hidden lg:inline" : ""
              }`}
            >
              {h}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          <span className="h-1.5 w-5 rounded-full bg-slate-900" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        </div>
      </Container>
    </div>
  );
}
