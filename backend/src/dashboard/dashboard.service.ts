import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getStats() {
    const [published, total, draftAndScheduled, users] = await Promise.all([
      this.prisma.article.count({ where: { status: 'PUBLICADO' } }),
      this.prisma.article.count(),
      this.prisma.article.count({
        where: { status: { in: ['RASCUNHO', 'AGENDADO'] } },
      }),
      this.prisma.user.count(),
    ]);

    // Visits counter — best-effort from Redis (incremented elsewhere).
    let visits = 0;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const v = await this.redis.getClient().get(`patriota:visits:${today}`);
      visits = v ? Number(v) : 0;
    } catch {
      visits = 0;
    }

    return {
      articles: { published, total, pending: draftAndScheduled },
      users: { total: users },
      visits: { today: visits },
    };
  }
}
