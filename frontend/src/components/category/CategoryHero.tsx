import { Container } from "../Container";

interface CategoryHeroProps {
  label: string;
  description: string;
  subtopics: string[];
  articleCount: number;
}

export function CategoryHero({
  label,
  description,
  subtopics,
  articleCount,
}: CategoryHeroProps) {
  return (
    <section className="bg-patriota-medium text-white">
      <Container className="py-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="font-bold uppercase tracking-[1.2px] text-patriota-accent">
                Rubrica
              </span>
              <span aria-hidden className="text-white/30">/</span>
              <span className="text-white/60">O Patriota Notícias</span>
            </nav>
            <h1 className="mt-3 text-[40px] font-black leading-[1] tracking-[-1.2px] md:text-[48px]">
              {label}
            </h1>
            <p className="mt-3 max-w-[520px] text-[16px] leading-[26px] text-white/60">
              {description}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[36px] font-black leading-none text-patriota-accent">
              {articleCount}
            </p>
            <p className="mt-1 text-[12px] text-white/50">
              artigos publicados
            </p>
            <p className="text-[12px] text-white/30">nesta edição</p>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap gap-2">
          {subtopics.map((t) => (
            <button
              key={t}
              type="button"
              className="rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-[12px] font-medium text-white/80 transition hover:bg-white/15 hover:text-white"
            >
              {t}
            </button>
          ))}
        </div>
      </Container>
    </section>
  );
}
