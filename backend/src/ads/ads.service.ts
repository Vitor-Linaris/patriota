import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
const DEFAULT_ADS = [
  { id: 'homepage-leaderboard', name: 'Homepage — Topo', page: 'Homepage', position: 'Topo da página', size: '970×250', sizeLabel: 'Billboard' },
  { id: 'homepage-mid', name: 'Homepage — Intermédio conteúdo', page: 'Homepage', position: 'Meio da página', size: '728×90', sizeLabel: 'Leaderboard' },
  { id: 'homepage-sidebar', name: 'Homepage — Sidebar', page: 'Homepage', position: 'Coluna lateral', size: '300×250', sizeLabel: 'Medium Rectangle' },
  { id: 'homepage-prefooter', name: 'Homepage — Pré-rodapé', page: 'Homepage', position: 'Antes do rodapé', size: '970×250', sizeLabel: 'Billboard' },
  { id: 'article-leaderboard', name: 'Artigo — Topo', page: 'Artigo', position: 'Topo da página', size: '970×250', sizeLabel: 'Billboard' },
  { id: 'article-incontent', name: 'Artigo — Dentro do conteúdo', page: 'Artigo', position: 'Meio do artigo', size: '336×280', sizeLabel: 'Large Rectangle' },
  { id: 'article-sidebar', name: 'Artigo — Sidebar', page: 'Artigo', position: 'Coluna lateral', size: '300×250', sizeLabel: 'Medium Rectangle' },
  { id: 'article-prefooter', name: 'Artigo — Pré-rodapé', page: 'Artigo', position: 'Antes do rodapé', size: '970×250', sizeLabel: 'Billboard' },
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
  constructor(private readonly prisma: PrismaService) {}

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
      return await this.prisma.ad.update({
        where: { id },
        data: { ...input, updatedAt: new Date() },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Slot não encontrado.');
      }
      throw e;
    }
  }
}
