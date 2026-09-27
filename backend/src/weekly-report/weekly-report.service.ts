import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { ReadersService } from '../readers/readers.service';
import { VisitsService } from '../visits/visits.service';
import { weeklyReportTemplate, type WeeklyReportStats } from './weekly-report.template';

const WINDOW_DAYS = 7;

/**
 * Quem recebe o "Relatório semanal" — a mesma regra de
 * AdminProfileClient's `canSeeReports`: só quem tem a visão de conjunto
 * de toda a redacção, não o resto da equipa.
 */
const RECIPIENT_ROLES = ['SUPER_ADMIN', 'EDITOR_CHEFE'] as const;

/**
 * O resumo semanal por e-mail, disparado toda segunda-feira às 8h
 * (Europe/Lisbon) pelo WeeklyReportScheduler.
 *
 * A newsletter fica de fora deste relatório: sendCampaign() ainda não
 * chama o mailer, e opens/clicks/openRate/clickRate nunca são escritos
 * no schema — mostrar esses números seria inventar dados. Quando o envio
 * real de newsletters existir, essa secção entra aqui.
 */
@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly readers: ReadersService,
    private readonly visits: VisitsService,
  ) {}

  private async gatherStats(now: Date): Promise<WeeklyReportStats> {
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [
      publishedThisWeek,
      pendingReview,
      totalPublished,
      visitCounts,
      readerStats,
      createdThisWeek,
      publishedPackagesThisWeek,
      staffTotal,
      rolesChangedThisWeek,
    ] = await Promise.all([
      this.prisma.article.count({
        where: { status: 'PUBLICADO', publishedAt: { gte: since } },
      }),
      this.prisma.article.count({ where: { status: 'EM_REVISAO' } }),
      this.prisma.article.count({ where: { status: 'PUBLICADO' } }),
      this.visits.getCounts(),
      this.readers.getStats(),
      this.prisma.package.count({ where: { createdAt: { gte: since } } }),
      this.prisma.package.count({
        where: { status: 'PUBLICADO', publishedAt: { gte: since } },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.rolePermissions.count({
        where: { updatedAt: { gte: since } },
      }),
    ]);

    return {
      windowDays: WINDOW_DAYS,
      articles: {
        publishedThisWeek,
        pendingReview,
        totalPublished,
      },
      visits: visitCounts,
      subscriptions: {
        active: readerStats.subscriptions.active,
        free: readerStats.subscriptions.free,
        newRecently: readerStats.subscriptions.newRecently,
        newWindowDays: readerStats.subscriptions.newWindowDays,
        cancelledRecently: readerStats.subscriptions.cancelledRecently,
        cancelledWindowDays: readerStats.subscriptions.cancelledWindowDays,
      },
      packages: {
        createdThisWeek,
        publishedThisWeek: publishedPackagesThisWeek,
      },
      staff: { total: staffTotal },
      permissions: { rolesChangedThisWeek },
    };
  }

  /**
   * Um e-mail por destinatário elegível — SUPER_ADMIN e EDITOR_CHEFE,
   * activos, com `notificationPrefs.weeklyReport !== false` (ausente
   * conta como ligado, o mesmo padrão do sino em StaffNotificationsService).
   */
  async send(now = new Date()): Promise<number> {
    const recipients = await this.prisma.user.findMany({
      where: { role: { in: [...RECIPIENT_ROLES] }, isActive: true },
      select: { id: true, email: true, name: true, notificationPrefs: true },
    });

    const eligible = recipients.filter((r) => {
      const prefs = (r.notificationPrefs ?? {}) as Record<string, unknown>;
      return prefs.weeklyReport !== false;
    });
    if (eligible.length === 0) return 0;

    const stats = await this.gatherStats(now);
    const siteName = await this.mailer.siteName();
    const siteUrl = this.mailer.siteUrl();
    const rendered = weeklyReportTemplate(
      { siteName, siteUrl },
      { name: null, stats },
    );

    let sent = 0;
    for (const r of eligible) {
      try {
        await this.mailer.sendOrThrow({
          to: r.email,
          ...rendered,
          tag: 'weekly-report',
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Relatório semanal falhou para ${r.email}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return sent;
  }
}
