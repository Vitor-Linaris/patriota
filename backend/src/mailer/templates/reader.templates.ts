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
  data: { name: string | null; token: string; firstPassword?: boolean },
): RenderedMail {
  const url = `${ctx.siteUrl}/conta/nova-palavra-passe?token=${encodeURIComponent(data.token)}`;
  // Two different moments wearing the same one-time link. "Repor" is
  // wrong for a reader who signed up through Google/Facebook and never
  // had a password to lose — they are DEFINING one for the first time,
  // so they can also log in with an address and a password.
  const first = data.firstPassword === true;
  return {
    subject: first
      ? `Defina uma palavra-passe — ${ctx.siteName}`
      : `Repor a palavra-passe — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader: first
        ? 'Ligação para definir a sua palavra-passe.'
        : 'Ligação para definir uma nova palavra-passe.',
      heading: first ? 'Definir palavra-passe' : 'Repor a palavra-passe',
      bodyHtml: `
        <p style="margin:0 0 12px;">${greeting(data.name)}</p>
        <p style="margin:0 0 12px;">
          ${
            first
              ? 'A sua conta foi criada com uma rede social e ainda não tem palavra-passe. Use o botão abaixo para definir uma — a sua conta e o que já guardou não mudam, passa só a poder também entrar com o e-mail e essa palavra-passe.'
              : 'Recebemos um pedido para repor a palavra-passe da sua conta. Use o botão abaixo para definir uma nova.'
          }
        </p>
        <p style="margin:0;">
          Esta ligação expira dentro de <strong>1 hora</strong> e só pode
          ser usada uma vez.
        </p>`,
      cta: { label: first ? 'Definir palavra-passe' : 'Definir nova palavra-passe', url },
      footerHtml: first
        ? 'Se não foi você que pediu, ignore esta mensagem: a sua conta continua exactamente como estava.'
        : 'Se não foi você que pediu, ignore esta mensagem: a palavra-passe ' +
          'actual continua válida e ninguém teve acesso à sua conta.',
    }),
    text: [
      greeting(data.name).replace(/<[^>]*>/g, ''),
      '',
      first
        ? 'A sua conta foi criada com uma rede social e ainda não tem palavra-passe.'
        : 'Recebemos um pedido para repor a palavra-passe da sua conta.',
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
  data: { name: string | null; hasPassword: boolean },
): RenderedMail {
  const url = `${ctx.siteUrl}/conta/recuperar`;
  // A reader who signed up through Google/Facebook has no password to
  // have forgotten — "não se recorda?" is a question that does not
  // apply to them, and the old copy sent everybody down that phrasing
  // regardless. The button underneath still works for both: the same
  // /conta/recuperar request now issues a first-password link for one
  // and a reset link for the other (see forgotPassword()).
  const social = !data.hasPassword;
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
          este endereço, mas já existe uma${social ? ', criada com uma rede social (Google ou Facebook)' : ''}. <strong>Não foi criada nenhuma
          conta nova e nada mudou</strong> na sua.
        </p>
        <p style="margin:0;">
          ${
            social
              ? 'Se foi você: continue a entrar pela rede social que usou, ou defina uma palavra-passe para também poder entrar com o e-mail.'
              : 'Se foi você e não se recorda da palavra-passe, pode repô-la.'
          }
        </p>`,
      cta: { label: social ? 'Definir palavra-passe' : 'Repor a palavra-passe', url },
      footerHtml:
        'Se não foi você, pode ignorar esta mensagem em segurança.',
    }),
    text: [
      greeting(data.name).replace(/<[^>]*>/g, ''),
      '',
      `Alguém tentou criar uma conta em ${ctx.siteName} com este endereço,`,
      'mas já existe uma. Não foi criada nenhuma conta nova e nada mudou.',
      '',
      social
        ? 'Se foi você: continue a entrar pela rede social que usou, ou defina uma palavra-passe:'
        : 'Se foi você e não se recorda da palavra-passe:',
      url,
    ].join('\n'),
  };
}
