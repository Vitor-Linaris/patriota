import type { RenderedMail } from '../mailer/mailer.types';
import { escapeHtml, renderLayout } from '../mailer/templates/layout';
import type { TemplateContext } from '../mailer/templates/reader.templates';

export interface WeeklyReportStats {
  windowDays: number;
  articles: {
    publishedThisWeek: number;
    pendingReview: number;
    totalPublished: number;
  };
  visits: { today: number; week: number; month: number };
  subscriptions: {
    active: number;
    free: number;
    newRecently: number;
    newWindowDays: number;
    cancelledRecently: number;
    cancelledWindowDays: number;
  };
  packages: { createdThisWeek: number; publishedThisWeek: number };
  staff: { total: number };
  permissions: { rolesChangedThisWeek: number };
}

function row(label: string, value: string | number): string {
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #eef1f6;
                 font-size:14px;color:#334155;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #eef1f6;
                 font-size:14px;font-weight:700;color:#0a1629;text-align:right;">
        ${escapeHtml(String(value))}
      </td>
    </tr>`;
}

function section(title: string, rows: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin-bottom:22px;">
      <tr>
        <td colspan="2" style="padding-bottom:8px;font-size:11px;font-weight:700;
                   letter-spacing:1px;text-transform:uppercase;color:#2a467e;">
          ${escapeHtml(title)}
        </td>
      </tr>
      ${rows}
    </table>`;
}

/**
 * "Relatório semanal" — só para EDITOR_CHEFE e SUPER_ADMIN (ver
 * `canSeeReports` no frontend), disparado toda segunda-feira às 8h.
 *
 * Newsletter fica de fora de propósito: sendCampaign() ainda não chama o
 * mailer nenhuma vez, e as colunas opens/clicks/openRate/clickRate nunca
 * são escritas — reportar essa parte hoje seria inventar números.
 */
export function weeklyReportTemplate(
  ctx: TemplateContext,
  data: { name: string | null; stats: WeeklyReportStats },
): RenderedMail {
  const s = data.stats;

  const bodyHtml =
    section(
      'Artigos',
      row('Publicados esta semana', s.articles.publishedThisWeek) +
        row('Aguardam revisão agora', s.articles.pendingReview) +
        row('Total publicado', s.articles.totalPublished),
    ) +
    section(
      'Visitas',
      row('Hoje', s.visits.today) +
        row('Últimos 7 dias', s.visits.week) +
        row('Últimos 30 dias', s.visits.month),
    ) +
    section(
      'Assinaturas',
      row('Activas agora', s.subscriptions.active) +
        row('Leitores gratuitos', s.subscriptions.free) +
        row(
          `Novas (${s.subscriptions.newWindowDays} dias)`,
          s.subscriptions.newRecently,
        ) +
        row(
          `Cancelaram (${s.subscriptions.cancelledWindowDays} dias)`,
          s.subscriptions.cancelledRecently,
        ),
    ) +
    section(
      'Pacotes',
      row('Criados esta semana', s.packages.createdThisWeek) +
        row('Publicados esta semana', s.packages.publishedThisWeek),
    ) +
    section(
      'Equipa e permissões',
      row('Contas activas', s.staff.total) +
        row('Papéis alterados esta semana', s.permissions.rolesChangedThisWeek),
    );

  const heading = 'O resumo da semana';
  const preheader = `${s.articles.publishedThisWeek} artigos publicados, ${s.visits.week} visitas nos últimos 7 dias.`;

  return {
    subject: `Resumo semanal — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader,
      heading,
      bodyHtml,
      cta: { label: 'Abrir o backoffice', url: `${ctx.siteUrl}/admin` },
    }),
    text: [
      data.name?.trim() ? `Olá ${data.name.trim()},` : 'Olá,',
      '',
      heading + ':',
      '',
      `Artigos publicados esta semana: ${s.articles.publishedThisWeek}`,
      `A aguardar revisão agora: ${s.articles.pendingReview}`,
      `Total publicado: ${s.articles.totalPublished}`,
      '',
      `Visitas hoje: ${s.visits.today}`,
      `Visitas nos últimos 7 dias: ${s.visits.week}`,
      `Visitas nos últimos 30 dias: ${s.visits.month}`,
      '',
      `Assinaturas activas: ${s.subscriptions.active}`,
      `Leitores gratuitos: ${s.subscriptions.free}`,
      `Novas assinaturas (${s.subscriptions.newWindowDays} dias): ${s.subscriptions.newRecently}`,
      `Cancelaram (${s.subscriptions.cancelledWindowDays} dias): ${s.subscriptions.cancelledRecently}`,
      '',
      `Pacotes criados esta semana: ${s.packages.createdThisWeek}`,
      `Pacotes publicados esta semana: ${s.packages.publishedThisWeek}`,
      '',
      `Contas de equipa activas: ${s.staff.total}`,
      `Papéis com permissões alteradas esta semana: ${s.permissions.rolesChangedThisWeek}`,
      '',
      `Abrir o backoffice: ${ctx.siteUrl}/admin`,
    ].join('\n'),
  };
}
