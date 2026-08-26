import type { RenderedMail } from '../mailer.types';
import { escapeHtml, renderLayout } from './layout';

export interface TemplateContext {
  siteName: string;
  /** Absolute base for links — PUBLIC_SITE_URL, not CORS_ORIGIN (a list). */
  siteUrl: string;
}

function greeting(name: string | null): string {
  return name?.trim() ? `Olá ${escapeHtml(name.trim())},` : 'Olá,';
}

export function verifyEmailTemplate(
  ctx: TemplateContext,
  data: { name: string | null; token: string },
): RenderedMail {
  const url = `${ctx.siteUrl}/conta/verificar?token=${encodeURIComponent(data.token)}`;
  return {
    subject: `Confirme o seu e-mail — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader: 'Falta um passo para activar a sua conta de leitor.',
      heading: 'Confirme o seu e-mail',
      bodyHtml: `
        <p style="margin:0 0 12px;">${greeting(data.name)}</p>
        <p style="margin:0 0 12px;">
          Obrigado por criar conta em ${escapeHtml(ctx.siteName)}. Confirme
          o seu endereço para poder comentar, guardar notícias e seguir os
          temas que lhe interessam.
        </p>
        <p style="margin:0;">Esta ligação expira dentro de 24 horas.</p>`,
      cta: { label: 'Confirmar e-mail', url },
      footerHtml:
        'Se não foi você que criou esta conta, ignore esta mensagem — ' +
        'nada acontece sem confirmação.',
    }),
    text: [
      greeting(data.name).replace(/<[^>]*>/g, ''),
      '',
      `Confirme o seu e-mail para activar a conta em ${ctx.siteName}:`,
      url,
      '',
      'A ligação expira dentro de 24 horas.',
      'Se não foi você que criou esta conta, ignore esta mensagem.',
    ].join('\n'),
  };
}

export function resetPasswordTemplate(
  ctx: TemplateContext,
  data: { name: string | null; token: string },
): RenderedMail {
  const url = `${ctx.siteUrl}/conta/nova-palavra-passe?token=${encodeURIComponent(data.token)}`;
  return {
    subject: `Repor a palavra-passe — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader: 'Ligação para definir uma nova palavra-passe.',
      heading: 'Repor a palavra-passe',
      bodyHtml: `
        <p style="margin:0 0 12px;">${greeting(data.name)}</p>
        <p style="margin:0 0 12px;">
          Recebemos um pedido para repor a palavra-passe da sua conta.
          Use o botão abaixo para definir uma nova.
        </p>
        <p style="margin:0;">
          Esta ligação expira dentro de <strong>1 hora</strong> e só pode
          ser usada uma vez.
        </p>`,
      cta: { label: 'Definir nova palavra-passe', url },
      footerHtml:
        'Se não foi você que pediu, ignore esta mensagem: a palavra-passe ' +
        'actual continua válida e ninguém teve acesso à sua conta.',
    }),
    text: [
      greeting(data.name).replace(/<[^>]*>/g, ''),
      '',
      'Recebemos um pedido para repor a palavra-passe da sua conta.',
      url,
      '',
      'A ligação expira dentro de 1 hora e só pode ser usada uma vez.',
      'Se não foi você que pediu, ignore esta mensagem.',
    ].join('\n'),
  };
}

/**
 * Sent when somebody tries to register with an address that already has an
 * account.
 *
 * This is the other half of the non-enumeration rule: registration always
 * answers 202, so the response tells an attacker nothing — but the real
 * owner still deserves to know, and to be pointed at password recovery in
 * case it was them, forgetting.
 */
export function registrationAttemptTemplate(
  ctx: TemplateContext,
  data: { name: string | null },
): RenderedMail {
  const url = `${ctx.siteUrl}/conta/recuperar`;
  return {
    subject: `Já existe uma conta com este e-mail — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader: 'Alguém tentou criar conta com o seu endereço.',
      heading: 'Já tem conta connosco',
      bodyHtml: `
        <p style="margin:0 0 12px;">${greeting(data.name)}</p>
        <p style="margin:0 0 12px;">
          Alguém tentou criar uma conta em ${escapeHtml(ctx.siteName)} com
          este endereço, mas já existe uma. <strong>Não foi criada nenhuma
          conta nova e nada mudou</strong> na sua.
        </p>
        <p style="margin:0;">
          Se foi você e não se recorda da palavra-passe, pode repô-la.
        </p>`,
      cta: { label: 'Repor a palavra-passe', url },
      footerHtml:
        'Se não foi você, pode ignorar esta mensagem em segurança.',
    }),
    text: [
      greeting(data.name).replace(/<[^>]*>/g, ''),
      '',
      `Alguém tentou criar uma conta em ${ctx.siteName} com este endereço,`,
      'mas já existe uma. Não foi criada nenhuma conta nova e nada mudou.',
      '',
      'Se foi você e não se recorda da palavra-passe:',
      url,
    ].join('\n'),
  };
}
