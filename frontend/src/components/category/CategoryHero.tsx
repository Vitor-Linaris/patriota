import Link from "next/link";
import { Container } from "../Container";
import { Breadcrumb, type Crumb } from "../Breadcrumb";
import type { CategoryDef } from "@/lib/categories";

interface CategoryHeroProps {
  label: string;
  description: string;
  /** Root → … → this category. */
  trail: Crumb[];
  /** Direct subsections — the reader's way down. */
  subsections: CategoryDef[];
}

/**
 * The section masthead.
 *
 * Both elements here used to be decorative and are now the primary way
 * down the tree: the breadcrumb said "Rubrica / O Patriota Notícias"
 * without ever naming the category, and the topic chips were `<button>`s
 * with no handler. With four levels and flat URLs, these two are how a
 * reader gets from Portugal to a bairro — Portugal → chips → Funchal →
 * chips → Sé — without a single deep dropdown.
 */
export function CategoryHero({
  label,
  description,
  trail,
  subsections,
}: CategoryHeroProps) {
  return (
    <section className="bg-patriota-medium text-white">
      <Container className="py-9">
        <div className="max-w-3xl">
          <Breadcrumb items={trail} tone="dark" />
          <h1 className="mt-3 text-[40px] font-black leading-[1] tracking-[-1.2px] md:text-[48px]">
            {label}
          </h1>
          {description && (
            <p className="mt-3 max-w-[520px] text-[16px] leading-[26px] text-white/60">
              {description}
            </p>
          )}
        </div>

        {subsections.length > 0 && (
          <nav
            aria-label={`Subsecções de ${label}`}
            className="mt-7 flex flex-wrap gap-2"
          >
            {subsections.map((child) => (
              <Link
                key={child.slug}
                href={`/categoria/${child.slug}`}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-[12px] font-medium text-white/80 transition hover:bg-white/20 hover:text-white"
              >
                {child.label}
              </Link>
            ))}
          </nav>
        )}
      </Container>
    </section>
  );
}
