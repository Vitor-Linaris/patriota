import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdType } from '../../generated/prisma/enums';

const DEFAULT_ADS = [
  { id: 'homepage-leaderboard', name: 'Homepage — Leaderboard topo', page: 'Homepage', position: 'Topo da página', size: '970×90', sizeLabel: 'Leaderboard' },
  { id: 'homepage-mid', name: 'Homepage — Intermédio conteúdo', page: 'Homepage', position: 'Meio da página', size: '970×60', sizeLabel: 'Banner horizontal' },
  { id: 'homepage-sidebar', name: 'Homepage — Sidebar', page: 'Homepage', position: 'Coluna lateral', size: '300×250', sizeLabel: 'Rectangle' },
  { id: 'homepage-prefooter', name: 'Homepage — Pré-rodapé', page: 'Homepage', position: 'Antes do rodapé', size: '970×90', sizeLabel: 'Leaderboard' },
  { id: 'article-leaderboard', name: 'Artigo — Leaderboard topo', page: 'Artigo', position: 'Topo da página', size: '970×90', sizeLabel: 'Leaderboard' },
  { id: 'article-incontent', name: 'Artigo — Dentro do conteúdo', page: 'Artigo', position: 'Meio do artigo', size: '336×280', sizeLabel: 'Rectangle médio' },
  { id: 'article-sidebar', name: 'Artigo — Sidebar', page: 'Artigo', position: 'Coluna lateral', size: '300×250', sizeLabel: 'Rectangle' },
  { id: 'article-prefooter', name: 'Artigo — Pré-rodapé', page: 'Artigo', position: 'Antes do rodapé', size: '970×90', sizeLabel: 'Leaderboard' },
  { id: 'category-leaderboard', name: 'Categoria — Leaderboard topo', page: 'Categoria', position: 'Topo da página', size: '970×90', sizeLabel: 'Leaderboard' },
  { id: 'category-sidebar', name: 'Categoria — Sidebar', page: 'Categoria', position: 'Coluna lateral', size: '300×250', sizeLabel: 'Rectangle' },
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

  /** Ensures the 10 default slots exist. Safe to call repeatedly. */
  async ensureDefaults() {
    for (const s of DEFAULT_ADS) {
      await this.prisma.ad.upsert({
        where: { id: s.id },
        update: {},
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
