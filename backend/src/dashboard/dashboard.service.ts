import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

function dayKey(date: Date): string {
  return `patriota:visits:${date.toISOString().slice(0, 10)}`;
}

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

    const visits = await this.getVisits();

    return {
      articles: { published, total, pending: draftAndScheduled },
      users: { total: users },
      visits,
    };
  }

  /**
   * Reads up to 30 daily counters from Redis in a single MGET and
   * returns today, week (last 7 days), month (last 30 days) totals.
   */
  private async getVisits(): Promise<{
    today: number;
    week: number;
    month: number;
  }> {
    try {
      const today = new Date();
      const keys: string[] = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i);
        keys.push(dayKey(d));
      }
      const raw = await this.redis.getClient().mget(...keys);
      const values = raw.map((v) => (v ? Number(v) : 0));
      const todayCount = values[0] ?? 0;
      const week = values.slice(0, 7).reduce((a, b) => a + b, 0);
      const month = values.reduce((a, b) => a + b, 0);
      return { today: todayCount, week, month };
    } catch {
      return { today: 0, week: 0, month: 0 };
    }
  }
}
