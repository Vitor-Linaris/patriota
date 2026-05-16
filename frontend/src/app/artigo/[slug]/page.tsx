import Link from "next/link";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdBanner } from "@/components/home/AdBanner";
import { SiteFooter } from "@/components/home/SiteFooter";
import { EssentialBox } from "@/components/article/EssentialBox";
import { ContextBox } from "@/components/article/ContextBox";
import { Blockquote } from "@/components/article/Blockquote";
import { AuthorBio } from "@/components/article/AuthorBio";
import { ArticleSidebar } from "@/components/article/ArticleSidebar";

/**
 * Article detail page. Currently renders mock data so the layout matches
 * the Figma frame (15022:777). When the backend articles endpoint is in
 * place, replace the const below with a `apiFetch(`/articles/${slug}`)`.
 */
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // The slug is accepted but not yet used — mock data below.
  await params;

  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <BreakingNews />
      <SiteHeader />
      <SecondaryNav />

      <AdBanner
        letter="M"
        title="Millennium BCP — Conta Ordenado sem comissões"
        description="Transfira o seu ordenado e ganhe até 4% de juro. Condições em millenniumbcp.pt"
        cta="Saber mais"
        palette="blue"
      />

      <main className="bg-white py-10">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Article column */}
            <article className="col-span-1 lg:col-span-8">
              {/* Breadcrumb */}
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-[13px] text-slate-500"
              >
                <Link href="/" className="hover:text-slate-900">
                  Início
                </Link>
                <span aria-hidden>/</span>
                <Link href="#" className="hover:text-slate-900">
                  Política
                </Link>
                <span aria-hidden>/</span>
                <span className="text-slate-700">Orçamento do Estado</span>
              </nav>

              {/* Category + topic */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                  Política
                </span>
                <span aria-hidden className="text-slate-400">·</span>
                <span className="text-[13px] font-semibold text-slate-700">
                  Orçamento do Estado 2026
                </span>
              </div>

              {/* Headline */}
              <h1 className="mt-4 text-[32px] font-black leading-[1.15] text-slate-900 md:text-[42px] md:leading-[1.1]">
                Governo apresenta proposta de orçamento com aumento de 3,2% na
                despesa pública
              </h1>

              {/* Lead */}
              <p className="mt-6 border-l-4 border-patriota-accent pl-5 text-[18px] leading-relaxed text-slate-700">
                Ministério das Finanças defende que crescimento é sustentável
                face às projeções de crescimento do PIB para 2026, mas oposição
                questiona sustentabilidade fiscal.
              </p>

              {/* Author + share */}
              <div className="mt-8 flex flex-wrap items-center gap-4 border-y border-slate-200 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-medium text-[13px] font-bold text-white">
                  AF
                </span>
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-slate-900">
                    Ana Ferreira
                  </p>
                  <p className="text-[12px] text-slate-500">
                    Correspondente Parlamentar
                  </p>
                </div>
                <div className="text-right text-[12px] leading-relaxed text-slate-500">
                  <p>12 abr 2026, 14h22</p>
                  <p>Atualizado 16h05 · 4 min leitura</p>
                </div>
                <div className="flex gap-2">
                  <ShareButton aria="Partilhar no Facebook" glyph="f" />
                  <ShareButton aria="Partilhar no X" glyph="𝕏" />
                  <ShareButton aria="Copiar link" glyph="🔗" />
                </div>
              </div>

              {/* Essential */}
              <div className="mt-8">
                <EssentialBox
                  items={[
                    "Despesa pública aumenta 3,2% face ao orçamento de 2025",
                    "Investimento em saúde e educação sobe 5,4%",
                    "Défice previsto de 1,8% do PIB, dentro dos limites europeus",
                    "Oposição critica falta de reformas estruturais",
                  ]}
                />
              </div>

              {/* Hero image (placeholder) */}
              <figure className="mt-8">
                <div className="flex aspect-[16/9] w-full flex-col items-center justify-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                  <span className="text-5xl" aria-hidden>
                    🏛️
                  </span>
                  <span className="mt-3 text-[14px] font-semibold">
                    Assembleia da República, Lisboa
                  </span>
                </div>
                <figcaption className="mt-2 text-[12px] text-slate-500">
                  Vista da sala de plenário durante a apresentação do orçamento.
                  Foto: Lusa
                </figcaption>
              </figure>

              {/* Body paragraph 1 */}
              <p className="mt-8 text-[16px] leading-relaxed text-slate-800">
                O Governo apresentou esta segunda-feira na Assembleia da
                República a proposta de Orçamento do Estado para 2026, prevendo
                um aumento de 3,2% na despesa pública em relação ao ano
                anterior, num documento que o Ministério das Finanças descreve
                como &ldquo;responsável e orientado para o crescimento
                sustentável&rdquo;.
              </p>

              {/* Context */}
              <div className="mt-8">
                <ContextBox
                  columns={[
                    {
                      label: "O que aconteceu",
                      body: "Governo entregou proposta de OE2026 na Assembleia da República",
                    },
                    {
                      label: "Porque importa",
                      body: "Define a política fiscal e social para os próximos 12 meses",
                    },
                    {
                      label: "Próximo passo",
                      body: "Debate na generalidade previsto para 28 de abril",
                    },
                  ]}
                />
              </div>

              {/* Body paragraphs */}
              <p className="mt-8 text-[16px] leading-relaxed text-slate-800">
                A proposta inclui um aumento de 5,4% no investimento em saúde
                e educação, áreas consideradas prioritárias pelo executivo. O
                défice orçamental está previsto em 1,8% do PIB, abaixo do
                limite de 3% estabelecido pelo Pacto de Estabilidade e
                Crescimento da União Europeia.
              </p>
              <p className="mt-6 text-[16px] leading-relaxed text-slate-800">
                A oposição reagiu com críticas à falta de reformas estruturais.
                &ldquo;Este orçamento não responde aos desafios de longo prazo
                do país&rdquo;, afirmou o líder parlamentar do PS,
                acrescentando que o crescimento da despesa não está
                acompanhado de medidas de eficiência.
              </p>

              {/* Blockquote */}
              <div className="mt-8">
                <Blockquote
                  quote="Apresentamos um orçamento que investe no futuro sem comprometer a estabilidade que os portugueses merecem."
                  cite="— Ministro das Finanças, conferência de imprensa"
                />
              </div>

              {/* Inline ad (Renault) */}
              <div className="mt-8 flex items-center gap-5 rounded-lg border border-rose-100 bg-gradient-to-r from-rose-50 to-amber-50 px-5 py-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-2xl font-black text-rose-600 shadow-sm">
                  R
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-slate-900">
                    Renault — Novo Mégane E-Tech Eléctrico
                  </p>
                  <p className="truncate text-[12px] text-slate-600">
                    Autonomia até 470 km. Test drive gratuito na sua cidade.
                  </p>
                </div>
                <a
                  href="#"
                  className="hidden shrink-0 rounded-md bg-rose-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-rose-700 md:inline-flex"
                >
                  Agendar test drive
                </a>
                <span className="absolute right-3 top-2 text-[10px] uppercase tracking-wider text-slate-400">
                  Publicidade
                </span>
              </div>

              {/* Final paragraph */}
              <p className="mt-8 text-[16px] leading-relaxed text-slate-800">
                O documento será debatido na generalidade no final do mês, com
                votação final global prevista para meados de maio. Os partidos
                de esquerda já anunciaram reservas, enquanto a direita
                moderada mantém posição de análise.
              </p>

              {/* Transparency notice */}
              <div className="mt-10 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-[13px] leading-relaxed text-amber-900">
                <strong className="font-bold">
                  Política de transparência:
                </strong>{" "}
                este artigo segue as orientações editoriais do Patriota.
                Quaisquer correcções relevantes são registadas no rodapé.
              </div>

              {/* Author bio */}
              <div className="mt-10">
                <AuthorBio
                  initials="AF"
                  name="Ana Ferreira"
                  role="Correspondente Parlamentar · O Patriota Notícias"
                  bio="Jornalista com 12 anos de experiência a cobrir política nacional. Distinguida com o Prémio de Jornalismo Parlamento 2023."
                />
              </div>
            </article>

            {/* Sidebar */}
            <div className="col-span-1 lg:col-span-4">
              <ArticleSidebar />
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

function ShareButton({ aria, glyph }: { aria: string; glyph: string }) {
  return (
    <button
      type="button"
      aria-label={aria}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-[14px] text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
    >
      {glyph}
    </button>
  );
}
