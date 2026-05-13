import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdBanner } from "@/components/home/AdBanner";
import { HeroGrid } from "@/components/home/HeroGrid";
import { LatestNews } from "@/components/home/LatestNews";
import { InvestigationSection } from "@/components/home/InvestigationSection";
import { Sidebar } from "@/components/home/Sidebar";
import { SiteFooter } from "@/components/home/SiteFooter";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      {/* Full-width chrome */}
      <TopBar />
      <BreakingNews />
      <SiteHeader />
      <SecondaryNav />

      {/* Top ad */}
      <AdBanner
        letter="M"
        title="Millennium BCP — Conta Ordenado sem comissões"
        description="Transfira o seu ordenado e ganhe até 4% de juro. Condições em millenniumbcp.pt"
        cta="Saber mais"
        palette="blue"
      />

      {/* Main content */}
      <main className="bg-slate-50 py-8">
        <Container>
          <HeroGrid />

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="col-span-1 flex flex-col gap-10 lg:col-span-8">
              <LatestNews />

              <AdInline />

              <InvestigationSection />
            </div>
            <div className="col-span-1 lg:col-span-4">
              <Sidebar />
            </div>
          </div>
        </Container>
      </main>

      {/* Bottom ad */}
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

/**
 * Inline ad sitting between Latest News and Investigation — kept inside the
 * left column so it shares the same width.
 */
function AdInline() {
  return (
    <div className="relative flex items-center gap-5 rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white text-2xl font-black text-emerald-600 shadow-sm">
        C
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-slate-900">
          CGD Caixa Empreender — Crédito para o seu negócio
        </p>
        <p className="truncate text-[13px] text-slate-600">
          Financiamento até 500.000€ com condições especiais para PME.
          Candidate-se online.
        </p>
      </div>
      <a
        href="#"
        className="hidden shrink-0 rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 md:inline-flex"
      >
        Candidatar
      </a>
      <span className="absolute right-2 top-2 text-[10px] uppercase tracking-wider text-slate-400">
        Publicidade
      </span>
    </div>
  );
}
