import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VisitsService } from '../visits/visits.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visits: VisitsService,
  ) {}

  async getStats() {
    const [published, total, draftAndScheduled, users, visits] =
      await Promise.all([
        this.prisma.article.count({ where: { status: 'PUBLICADO' } }),
        this.prisma.article.count(),
        this.prisma.article.count({
          where: { status: { in: ['RASCUNHO', 'AGENDADO'] } },
        }),
        this.prisma.user.count(),
        this.visits.getCounts(),
      ]);

    return {
      articles: { published, total, pending: draftAndScheduled },
      users: { total: users },
      visits,
    };
  }
}
