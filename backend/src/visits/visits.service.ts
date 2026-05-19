import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const NINETY_DAYS = 60 * 60 * 24 * 90;

function dayKey(date: Date): string {
  return `patriota:visits:${date.toISOString().slice(0, 10)}:visitors`;
}

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Record a unique visitor for today. `visitorHash` is a stable hash of
   * the visitor's IP + User-Agent (computed in the frontend middleware so
   * the raw IP never leaves the edge process). Adding the same hash
   * multiple times in the same day is a no-op — Redis SET semantics.
   */
  async track(visitorHash: string): Promise<void> {
    if (!visitorHash) return;
    const key = dayKey(new Date());
    try {
      await this.redis
        .getClient()
        .multi()
        .sadd(key, visitorHash)
        .expire(key, NINETY_DAYS)
        .exec();
    } catch (err) {
      this.logger.warn(
        `track() failed (key=${key}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Returns unique-visitor counts for today, last 7 days, last 30 days
   * by SCARD-ing one SET per day. SCARDs are pipelined in a single
   * round-trip.
   */
  async getCounts(): Promise<{
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
      const pipeline = this.redis.getClient().pipeline();
      for (const k of keys) pipeline.scard(k);
      const results = (await pipeline.exec()) ?? [];
      const values = results.map(([err, val]) =>
        err || typeof val !== 'number' ? 0 : val,
      );
      const todayCount = values[0] ?? 0;
      const week = values.slice(0, 7).reduce((a, b) => a + b, 0);
      const month = values.reduce((a, b) => a + b, 0);
      return { today: todayCount, week, month };
    } catch (err) {
      this.logger.warn(`getCounts() failed: ${(err as Error).message}`);
      return { today: 0, week: 0, month: 0 };
    }
  }
}
