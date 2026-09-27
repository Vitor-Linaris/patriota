import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WeeklyReportService } from './weekly-report.service';

/**
 * NOTE: this module must NOT call ScheduleModule.forRoot() — it is
 * already registered in ArticlesModule, and @Cron here is picked up by
 * that single root. Same note as SocialScheduler and
 * ReaderNotificationsScheduler.
 *
 * Toda segunda-feira às 8h, hora de Lisboa — não UTC, para não deslizar
 * uma hora com o horário de Verão.
 */
@Injectable()
export class WeeklyReportScheduler {
  private readonly logger = new Logger(WeeklyReportScheduler.name);

  constructor(private readonly weeklyReport: WeeklyReportService) {}

  @Cron('0 8 * * 1', { timeZone: 'Europe/Lisbon' })
  async tick(): Promise<void> {
    try {
      const sent = await this.weeklyReport.send();
      this.logger.log(`Relatório semanal enviado a ${sent} destinatário(s).`);
    } catch (err) {
      this.logger.error(
        `Relatório semanal falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
