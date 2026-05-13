import { Container } from "../Container";

export interface AdBannerProps {
  letter: string;
  title: string;
  description: string;
  cta: string;
  /** Background gradient palette (Tailwind shorthand) */
  palette?: "blue" | "green" | "red";
}

const PALETTES: Record<NonNullable<AdBannerProps["palette"]>, string> = {
  blue: "from-blue-50 to-indigo-50 border-blue-100",
  green: "from-emerald-50 to-teal-50 border-emerald-100",
  red: "from-rose-50 to-red-50 border-rose-100",
};

export function AdBanner({
  letter,
  title,
  description,
  cta,
  palette = "blue",
}: AdBannerProps) {
  return (
    <section className="bg-slate-50 py-6">
      <Container>
        <div
          className={`relative flex items-center gap-5 rounded-xl border bg-gradient-to-r px-6 py-4 ${PALETTES[palette]}`}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-2xl font-black text-patriota-dark shadow-sm">
            {letter}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-slate-900">
              {title}
            </p>
            <p className="truncate text-[13px] text-slate-600">{description}</p>
          </div>
          <a
            href="#"
            className="hidden shrink-0 rounded-md bg-patriota-dark px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-patriota-medium md:inline-flex"
          >
            {cta}
          </a>
        </div>
        <p className="mt-2 text-center text-[11px] uppercase tracking-wider text-slate-400">
          Publicidade
        </p>
      </Container>
    </section>
  );
}
