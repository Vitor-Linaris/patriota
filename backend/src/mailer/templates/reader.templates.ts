import type { RenderedMail } from '../mailer.types';
import { escapeHtml, renderLayout } from './layout';
import type { ReaderAuthProvider } from '../../../generated/prisma/enums';

/** How a provider is named to a reader, not to a database column. */
const PROVIDER_NAMES: Record<ReaderAuthProvider, string> = {
  GOOGLE: 'Google',
  FACEBOOK: 'Facebook',
};

/** "Google", "Google ou Facebook" — however many are actually linked. */
function providerList(providers: ReaderAuthProvider[]): string {
  const names = providers.map((p) => PROVIDER_NAMES[p]);
  if (names.length === 0) return 'uma rede social';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`;
}

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
/**
 * Answers "esqueci-me da palavra-passe" for an account that never had
 * one — sent when a REQUEST for it lands on a social-only reader.
 *
 * Deliberately no CTA, no link, nothing to click that ends up on this
 * site: there is no password here to reset. If they forgot the
 * password to Google or Facebook, that is a password those companies
 * hold, and only they can reset it.
 */
export function socialAccountNoticeTemplate(
  ctx: TemplateContext,
  data: { name: string | null; providers: ReaderAuthProvider[] },
): RenderedMail {
  const via = providerList(data.providers);
  return {
    subject: `A sua conta usa ${via} — ${ctx.siteName}`,
    html: renderLayout({
      siteName: ctx.siteName,
      preheader: `A sua conta entra por ${via}, não por palavra-passe.`,
      heading: 'A sua conta é de rede social',
      bodyHtml: `
        <p style="margin:0 0 12px;">${greeting(data.name)}</p>
        <p style="margin:0 0 12px;">
          Pediram para repor a palavra-passe desta conta, mas ela foi
          criada com <strong>${escapeHtml(via)}</strong> e nunca teve
          uma palavra-passe em ${escapeHtml(ctx.siteName)} — não há nada
          aqui para repor.
        </p>
        <p style="margin:0;">
          Continue a entrar por ${escapeHtml(via)}, como sempre fez. Se
          esqueceu essa palavra-passe, é a ${escapeHtml(via)} que a pode
          repor, directamente na sua conta.
        </p>`,
      footerHtml:
        'Se não foi você que pediu, ignore esta mensagem: nada mudou na sua conta.',
    }),
    text: [
      greeting(data.name).replace(/<[^>]*>/g, ''),
      '',
      `Pediram para repor a palavra-passe desta conta, mas ela foi criada`,
      `com ${via} e nunca teve uma palavra-passe em ${ctx.siteName}.`,
      '',
      `Continue a entrar por ${via}, como sempre fez. Se esqueceu essa`,
      `palavra-passe, é a ${via} que a pode repor.`,
    ].join('\n'),
  };
}

export function registrationAttemptTemplate(
  ctx: TemplateContext,
  data: { name: string | null; hasPassword: boolean; providers: ReaderAuthProvider[] },
): RenderedMail {
  // Two different accounts, two different pieces of advice. A password
  // account is told it can reset one. A social-only account is told
  // there is nothing to reset — the fix here is "you already logged in
  // this way once", not a password this site has never held.
  const social = !data.hasPassword;
  const via = providerList(data.providers);
  const url = social ? `${ctx.siteUrl}/conta/entrar` : `${ctx.siteUrl}/conta/recuperar`;
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
          este endereço, mas já existe uma${social ? `, criada com ${escapeHtml(via)}` : ''}. <strong>Não foi criada nenhuma
          conta nova e nada mudou</strong> na sua.
        </p>
        <p style="margin:0;">
          ${
            social
              ? `Se foi você: continue a entrar por ${escapeHtml(via)}, como sempre fez.`
              : 'Se foi você e não se recorda da palavra-passe, pode repô-la.'
          }
        </p>`,
      cta: { label: social ? 'Iniciar sessão' : 'Repor a palavra-passe', url },
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
        ? `Se foi você: continue a entrar por ${via}, como sempre fez.`
        : 'Se foi você e não se recorda da palavra-passe:',
      url,
    ].join('\n'),
  };
}
