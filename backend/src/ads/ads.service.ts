import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { AdType } from '../../generated/prisma/enums';

/**
 * Slot catalogue. Sizes follow IAB display standards, which is what
 * Google AdSense and the main ad networks expect:
 *   • Billboard  970×250 — premium top / pre-footer banners
 *   • Leaderboard 728×90 — secondary mid-content horizontal slot
 *   • Medium Rectangle 300×250 — sidebar / column ads (MPU)
 *   • Large Rectangle 336×280 — in-article body
 * Reference: https://iabtechlab.com/standards/iab-new-ad-portfolio/
 */
export const DEFAULT_ADS = [
  { id: 'homepage-leaderboard', name: 'Homepage — Topo', page: 'Homepage', position: 'Topo da página', size: '970×250', sizeLabel: 'Billboard' },
  { id: 'homepage-mid', name: 'Homepage — Intermédio conteúdo', page: 'Homepage', position: 'Meio da página', size: '728×90', sizeLabel: 'Leaderboard' },
  { id: 'homepage-sidebar', name: 'Homepage — Sidebar', page: 'Homepage', position: 'Coluna lateral', size: '300×250', sizeLabel: 'Medium Rectangle' },
  // Abaixo do quadrado da Newsletter na coluna lateral — vertical de
  // propósito. A coluna em si tem ~300px de largura (o mesmo que o
  // Medium Rectangle logo acima); um formato horizontal como o
  // Leaderboard encolhido a essa largura ficava com uns 37px de
  // altura, quase invisível. Half Page é o tamanho "IAB oficial"
  // pensado exactamente para uma coluna lateral estreita e comprida.
  { id: 'homepage-sidebar-bottom', name: 'Homepage — Sidebar (abaixo da Newsletter)', page: 'Homepage', position: 'Coluna lateral, abaixo da Newsletter', size: '300×600', sizeLabel: 'Half Page' },
  { id: 'homepage-prefooter', name: 'Homepage — Pré-rodapé', page: 'Homepage', position: 'Antes do rodapé', size: '970×250', sizeLabel: 'Billboard' },
  // Fixo no fundo do ecrã, por cima de tudo — ver StickyAdBanner.tsx.
  // Só aparece depois de o leitor já ter respondido ao aviso de
  // cookies, para nunca ficar em cima dele.
  { id: 'homepage-sticky', name: 'Homepage — Banner fixo (rodapé do ecrã)', page: 'Homepage', position: 'Fixo no fundo do ecrã', size: '728×90', sizeLabel: 'Leaderboard' },
  { id: 'article-leaderboard', name: 'Artigo — Topo', page: 'Artigo', position: 'Topo da página', size: '970×250', sizeLabel: 'Billboard' },
  { id: 'article-incontent', name: 'Artigo — Dentro do conteúdo', page: 'Artigo', position: 'Meio do artigo', size: '336×280', sizeLabel: 'Large Rectangle' },
  { id: 'article-sidebar', name: 'Artigo — Sidebar', page: 'Artigo', position: 'Coluna lateral', size: '300×250', sizeLabel: 'Medium Rectangle' },
  { id: 'article-sidebar-bottom', name: 'Artigo — Sidebar (abaixo da Newsletter)', page: 'Artigo', position: 'Coluna lateral, abaixo da Newsletter', size: '300×600', sizeLabel: 'Half Page' },
  { id: 'article-prefooter', name: 'Artigo — Pré-rodapé', page: 'Artigo', position: 'Antes do rodapé', size: '970×250', sizeLabel: 'Billboard' },
  { id: 'article-sticky', name: 'Artigo — Banner fixo (rodapé do ecrã)', page: 'Artigo', position: 'Fixo no fundo do ecrã', size: '728×90', sizeLabel: 'Leaderboard' },
  { id: 'category-leaderboard', name: 'Categoria — Topo', page: 'Categoria', position: 'Topo da página', size: '970×250', sizeLabel: 'Billboard' },
  { id: 'category-sidebar', name: 'Categoria — Sidebar', page: 'Categoria', position: 'Coluna lateral', size: '300×250', sizeLabel: 'Medium Rectangle' },
  { id: 'category-prefooter', name: 'Categoria — Pré-rodapé', page: 'Categoria', position: 'Antes do rodapé', size: '970×250', sizeLabel: 'Billboard' },
];

interface UpdateAdInput {
  type?: AdType;
  enabled?: boolean;
  imageUrl?: string | null;
  linkUrl?: string | null;
  linkTarget?: '_blank' | '_self';
  altText?: string | null;
  htmlCode?: string | null;
}

@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  /**
   * Ensures every slot in DEFAULT_ADS exists. Safe to call on every
   * boot. Existing rows have their metadata refreshed (name, page,
   * position, size, sizeLabel) so changes to the catalogue propagate
   * automatically — but USER-EDITED fields (type, enabled, imageUrl,
   * htmlCode, linkUrl, linkTarget, altText) are deliberately left
   * alone so we never wipe a configured ad on a schema update.
   */
  async ensureDefaults() {
    for (const s of DEFAULT_ADS) {
      await this.prisma.ad.upsert({
        where: { id: s.id },
        update: {
          name: s.name,
          page: s.page,
          position: s.position,
          size: s.size,
          sizeLabel: s.sizeLabel,
        },
        create: { ...s, type: 'EMPTY', enabled: true },
      });
    }
  }

  list() {
    return this.prisma.ad.findMany({ orderBy: { id: 'asc' } });
  }

  listByPage(page: string) {
    return this.prisma.ad.findMany({
      where: { page, enabled: true },
      orderBy: { id: 'asc' },
    });
  }

  async update(id: string, input: UpdateAdInput) {
    try {
      const updated = await this.prisma.ad.update({
        where: { id },
        data: { ...input, updatedAt: new Date() },
      });

      // Make the banner publicly fetchable once the slot is live.
      //
      // This was missing entirely. Ad images were reaching readers only
      // because the serving route's last-resort repair noticed they
      // were live and fixed them one at a time — a safety net doing the
      // main job, with a warning logged for every banner on the site.
      //
      // Checked against the row that came back rather than the input:
      // enabling a slot that already had an image has to promote it,
      // and so does setting an image on a slot that is already on.
      if (updated.enabled && updated.imageUrl) {
        await this.media.promoteForPublication(updated.imageUrl);
      }
      return updated;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Slot não encontrado.');
      }
      throw e;
    }
  }
}
