import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdBanner } from "@/components/home/AdBanner";
import { SiteFooter } from "@/components/home/SiteFooter";
import { CategoryHero } from "@/components/category/CategoryHero";
import { FeaturedArticle } from "@/components/category/FeaturedArticle";
import {
  ArticleListItem,
  type ArticleListItemData,
} from "@/components/category/ArticleListItem";
import { Pagination } from "@/components/category/Pagination";
import { CategorySidebar } from "@/components/category/CategorySidebar";
import { SectionMarker } from "@/components/category/SectionMarker";
import { getCategoryBySlug, getCategories } from "@/lib/categories";

// Pre-render the category routes that we know about at build time.
export async function generateStaticParams() {
  const cats = await getCategories();
  return cats.map((c) => ({ slug: c.slug }));
}

const FILTERS = ["Mais Recentes", "Mais Lidas", "Mais Comentadas"] as const;

const MOCK_ARTICLES: ArticleListItemData[] = [
  {
    number: 1,
    category: "POLÍTICA",
    time: "Há 45 minutos",
    readMinutes: 3,
    title: "PS reage com críticas ao modelo de financiamento proposto pelo executivo",
    excerpt:
      "Partido Socialista considera que o crescimento da despesa não está acompanhado de reformas estruturais.",
    authorInitials: "CM",
    authorName: "Carlos Mendes",
    date: "12 abr 2026",
  },
  {
    number: 2,
    category: "POLÍTICA",
    time: "Há 1 hora",
    readMinutes: 2,
    title: "Presidente da República pede diálogo alargado sobre proposta orçamental",
    excerpt:
      "Marcelo Rebelo de Sousa apelou a que o debate parlamentar seja construtivo e aberto a emendas.",
    authorInitials: "RS",
    authorName: "Rita Sousa",
    date: "12 abr 2026",
  },
  {
    number: 3,
    category: "POLÍTICA",
    time: "Há 3 horas",
    readMinutes: 3,
    title: "Chega anuncia voto contra orçamento sem negociação prévia",
    excerpt:
      "Partido de André Ventura diz que não houve contacto formal por parte do Governo antes da apresentação.",
    authorInitials: "JP",
    authorName: "João Pires",
    date: "11 abr 2026",
  },
  {
    number: 4,
    category: "POLÍTICA",
    time: "Há 4 horas",
    readMinutes: 4,
    title: "Ministra da Saúde garante aumento de 12% no financiamento hospitalar",
    excerpt:
      "Medida integra o pacote orçamental e visa reduzir listas de espera no SNS.",
    authorInitials: "AF",
    authorName: "Ana Ferreira",
    date: "11 abr 2026",
  },
  {
    number: 5,
    category: "POLÍTICA",
    time: "Há 6 horas",
    readMinutes: 5,
    title:
      "Debate parlamentar sobre habitação arranca esta semana com propostas cruzadas",
    excerpt:
      "Oito partidos apresentaram iniciativas legislativas distintas sobre arrendamento e acesso à habitação.",
    authorInitials: "LB",
    authorName: "Luísa Baptista",
    date: "11 abr 2026",
  },
  {
    number: 6,
    category: "POLÍTICA",
    time: "Há 1 dia",
    readMinutes: 6,
    title: "Conselho de Ministros aprova pacote de medidas para combate à corrupção",
    excerpt:
      "Governo reforça mecanismos de fiscalização em contratos públicos e define novas sanções.",
    authorInitials: "RM",
    authorName: "Rui Monteiro",
    date: "10 abr 2026",
  },
  {
    number: 7,
    category: "POLÍTICA",
    time: "Há 2 dias",
    readMinutes: 8,
    title: "Autárquicas 2025: análise aos resultados que moldaram o mapa político local",
    excerpt:
      "Um ano após as eleições municipais, o impacto das mudanças de poder nas câmaras mais populosas.",
    authorInitials: "SA",
    authorName: "Sofia Andrade",
    date: "10 abr 2026",
  },
];

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const articleCount = MOCK_ARTICLES.length + 1; // featured + list

  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <BreakingNews />
      <SiteHeader />
      <SecondaryNav />

      <CategoryHero
        label={category.label}
        description={category.description}
        subtopics={category.subtopics}
        articleCount={articleCount}
      />

      <AdBanner
        letter="M"
        title="Millennium BCP — Conta Ordenado sem comissões"
        description="Transfira o seu ordenado e ganhe até 4% de juro. Condições em millenniumbcp.pt"
        cta="Saber mais"
        palette="blue"
      />

      <main className="bg-slate-50 py-10">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Articles column */}
            <div className="col-span-1 lg:col-span-8">
              <SectionMarker title="Artigo em Destaque" />
              <div className="mt-5">
                <FeaturedArticle
                  category="Política"
                  title="Governo apresenta proposta de orçamento com aumento de 3,2% na despesa pública"
                  excerpt="Ministério das Finanças defende que crescimento é sustentável face às projeções de crescimento do PIB."
                  author={{ initials: "AF", name: "Ana Ferreira" }}
                  publishedAt="12 abr 2026"
                  time="Há 12 minutos"
                  readMinutes={4}
                />
              </div>

              {/* List header */}
              <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
                <SectionMarker
                  title="Todos os artigos"
                  trailing={
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">
                      {articleCount} artigos
                    </span>
                  }
                />
                <div
                  role="tablist"
                  aria-label="Ordenar artigos"
                  className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-[13px]"
                >
                  {FILTERS.map((f, i) => (
                    <button
                      key={f}
                      role="tab"
                      aria-selected={i === 0}
                      className={
                        "rounded-md px-3 py-1.5 font-semibold transition " +
                        (i === 0
                          ? "bg-patriota-dark text-white"
                          : "text-slate-600 hover:text-slate-900")
                      }
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* List */}
              <ul className="mt-5 flex flex-col gap-4">
                {MOCK_ARTICLES.map((a) => (
                  <li key={a.number}>
                    <ArticleListItem item={a} />
                  </li>
                ))}
              </ul>

              <Pagination current={1} total={5} />
            </div>

            {/* Sidebar */}
            <div className="col-span-1 lg:col-span-4">
              <CategorySidebar
                currentSlug={category.slug}
                newsletterTitle={`Receba o melhor de ${category.label}`}
              />
            </div>
          </div>
        </Container>
      </main>

      <AdBanner
        letter="V"
        title="Vodafone — Tarifário RED Ilimitado"
        description="Chamadas, SMS e dados ilimitados a partir de 24,99€/mês. Portabilidade grátis."
        cta="Ver tarifário"
        palette="red"
      />

      <SiteFooter />
    </div>
  );
}
