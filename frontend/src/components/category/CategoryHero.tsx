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
    <section
      style={{
        background:
          "linear-gradient(180deg, #36C -71.25%, #1E2C4D 212.5%)",
      }}
      className="text-white"
    >
      <Container className="py-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-[13px] text-white/60"
            >
              <span>Rubrica</span>
              <span aria-hidden>/</span>
              <span className="text-white/80">O Patriota Notícias</span>
            </nav>
            <h1 className="mt-3 text-[40px] font-black leading-tight md:text-[48px]">
              {label}
            </h1>
            <p className="mt-2 max-w-[520px] text-[15px] text-white/70">
              {description}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[36px] font-black leading-none text-patriota-accent">
              {articleCount}
            </p>
            <p className="text-[12px] uppercase tracking-wide text-white/60">
              artigos publicados
            </p>
            <p className="text-[12px] uppercase tracking-wide text-white/60">
              nesta edição
            </p>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap gap-2">
          {subtopics.map((t) => (
            <button
              key={t}
              type="button"
              className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[12px] font-medium text-white/85 transition hover:border-patriota-accent/70 hover:text-patriota-accent"
            >
              {t}
            </button>
          ))}
        </div>
      </Container>
    </section>
  );
}
