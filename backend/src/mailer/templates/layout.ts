/**
 * Shared HTML shell for every outbound message.
 *
 * Tables and inline styles on purpose — Outlook still does not support
 * flexbox or grid, and a <style> block is stripped by several webmail
 * clients. This is ugly by modern standards and correct for e-mail.
 *
 * No template engine: the project has none, and the newsletter module
 * already composes HTML by hand.
 */
const BRAND = '#2a467e';
const INK = '#0a1629';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LayoutOptions {
  siteName: string;
  /** Preview line shown by inboxes next to the subject. */
  preheader: string;
  heading: string;
  /** Already-escaped HTML for the body. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Small print under the divider — unsubscribe links live here. */
  footerHtml?: string;
}

export function renderLayout(opts: LayoutOptions): string {
  const cta = opts.cta
    ? `
      <tr>
        <td style="padding:8px 0 4px;">
          <a href="${opts.cta.url}"
             style="display:inline-block;background:${BRAND};color:#ffffff;
                    text-decoration:none;font-weight:700;font-size:15px;
                    padding:13px 26px;border-radius:8px;">
            ${escapeHtml(opts.cta.label)}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
          Se o botão não funcionar, copie esta ligação para o navegador:<br>
          <span style="color:#64748b;word-break:break-all;">${escapeHtml(opts.cta.url)}</span>
        </td>
      </tr>`
    : '';

  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<!-- Preheader: shown in the inbox list, hidden in the message body. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${escapeHtml(opts.preheader)}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:#f1f5f9;padding:28px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:12px;
                    border:1px solid #e2e8f0;overflow:hidden;">
        <tr>
          <td style="background:${INK};padding:20px 28px;">
            <span style="color:#ffffff;font-family:Georgia,serif;font-size:19px;
                         font-weight:700;letter-spacing:0.3px;">
              ${escapeHtml(opts.siteName)}
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px 28px;
                     font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:21px;font-weight:800;color:${INK};padding-bottom:12px;">
                  ${escapeHtml(opts.heading)}
                </td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.65;color:#334155;padding-bottom:20px;">
                  ${opts.bodyHtml}
                </td>
              </tr>
              ${cta}
            </table>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #e2e8f0;padding:18px 28px;
                     font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                     font-size:12px;line-height:1.7;color:#94a3b8;">
            ${opts.footerHtml ?? `Recebeu esta mensagem porque tem uma conta em ${escapeHtml(opts.siteName)}.`}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
