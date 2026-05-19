import { Container } from "../Container";

interface BreakingItem {
  slug: string;
  title: string;
}

export function BreakingNews({ items }: { items: BreakingItem[] }) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #36C -71.25%, #1E2C4D 212.5%)",
      }}
    >
      <Container className="flex h-10 items-center gap-6">
        <span className="rounded bg-patriota-accent px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-patriota-medium">
          Última hora
        </span>
        <div className="flex flex-1 items-center gap-7 overflow-hidden text-[14px]">
          {items.map((item, i) => (
            <a
              key={item.slug}
              href={`/artigo/${item.slug}`}
              className={`whitespace-nowrap transition hover:text-white ${
                i === 0 ? "text-white" : "text-white/60 hidden lg:inline"
              }`}
            >
              {item.title}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          {items.slice(0, 3).map((_, i) => (
            <span
              key={i}
              className={
                i === 0
                  ? "h-2 w-5 rounded-full bg-patriota-accent"
                  : "h-2 w-2 rounded-full bg-white/30"
              }
            />
          ))}
        </div>
      </Container>
    </div>
  );
}
