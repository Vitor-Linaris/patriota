import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdSlot } from "@/components/ads/AdSlot";
import { HeroGrid } from "@/components/home/HeroGrid";
import { LatestNews } from "@/components/home/LatestNews";
import { InvestigationSection } from "@/components/home/InvestigationSection";
import { Sidebar } from "@/components/home/Sidebar";
import { SiteFooter } from "@/components/home/SiteFooter";
import { getAdsByPage, getHomepage, listBreaking } from "@/lib/public-api";

export default async function HomePage() {
  const [home, breaking, ads] = await Promise.all([
    getHomepage(),
    listBreaking(3),
    getAdsByPage("Homepage"),
  ]);
  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      {/* Full-width chrome */}
      <TopBar />
      <BreakingNews
        items={breaking.map((a) => ({ slug: a.slug, title: a.title }))}
      />
      <SiteHeader />
      <SecondaryNav />

      {/* Top leaderboard (970×90). Collapses if the admin hasn't
          configured an ad or the slot is disabled. */}
      <AdSlot ad={ads["homepage-leaderboard"]} />

      {/* Main content */}
      <main className="bg-slate-50 py-8">
        <Container>
          <HeroGrid featured={home.featured} side={home.side} />

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="col-span-1 flex flex-col gap-10 lg:col-span-8">
              <LatestNews items={home.latest} />

              {/* Inline mid-content banner (970×60). The "none" variant
                  drops the section padding so it sits flush in the
                  left column. */}
              <AdSlot ad={ads["homepage-mid"]} variant="none" />

              <InvestigationSection items={home.investigation} />
            </div>
            <div className="col-span-1 lg:col-span-4">
              <Sidebar />
            </div>
          </div>
        </Container>
      </main>

      {/* Pre-footer leaderboard (970×90). */}
      <AdSlot ad={ads["homepage-prefooter"]} />

      <SiteFooter />
    </div>
  );
}
