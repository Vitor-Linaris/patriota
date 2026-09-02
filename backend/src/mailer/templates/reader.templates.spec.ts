import {
  registrationAttemptTemplate,
  resetPasswordTemplate,
  socialAccountNoticeTemplate,
} from './reader.templates';

const CTX = { siteName: 'O Patriota Notícias', siteUrl: 'https://opatriota.pt' };

/**
 * The bug these templates used to cause: a reader who signed up through
 * Google/Facebook has no password. Telling them "não se recorda da
 * palavra-passe?" is a question that does not apply, and a link
 * promising to reset one used to be a dead end regardless of the
 * wording (see ReaderAuthService.forgotPassword). These tests lock the
 * copy that distinguishes the two cases, so the branch cannot be
 * flipped back by accident.
 *
 * The fix does NOT let a social-only reader set a password through this
 * site — that was tried and reverted: if they forgot the password to
 * Google or Facebook, that password belongs to Google or Facebook, and
 * only those services can reset it. All this site can do is say so.
 */
describe('registrationAttemptTemplate', () => {
  it('offers to reset, for an account that already has a password', () => {
    const mail = registrationAttemptTemplate(CTX, {
      name: 'Ana',
      hasPassword: true,
      providers: [],
    });

    expect(mail.html).toContain('não se recorda da palavra-passe');
    expect(mail.html).toContain('Repor a palavra-passe');
  });

  it('names the provider and sends to login, never to a reset link', () => {
    const mail = registrationAttemptTemplate(CTX, {
      name: 'Ana',
      hasPassword: false,
      providers: ['GOOGLE'],
    });

    expect(mail.html).toContain('Google');
    expect(mail.html).not.toContain('não se recorda da palavra-passe');
    // No path back to a password-setting flow — the whole point.
    expect(mail.html).not.toContain('Definir');
    expect(mail.html).not.toContain('/conta/recuperar');
    expect(mail.html).toContain('/conta/entrar');
    expect(mail.html).toContain('Iniciar sessão');
  });

  it('names both providers when both are linked', () => {
    const mail = registrationAttemptTemplate(CTX, {
      name: null,
      hasPassword: false,
      providers: ['GOOGLE', 'FACEBOOK'],
    });

    expect(mail.html).toContain('Google ou Facebook');
  });

  it('always says plainly that nothing was created and nothing changed', () => {
    for (const hasPassword of [true, false]) {
      const mail = registrationAttemptTemplate(CTX, {
        name: null,
        hasPassword,
        providers: ['GOOGLE'],
      });
      expect(mail.html).toContain('Não foi criada nenhuma');
    }
  });
});

describe('resetPasswordTemplate', () => {
  it('offers to define a new password, with a working link', () => {
    const mail = resetPasswordTemplate(CTX, { name: 'Ana', token: 'tok' });

    expect(mail.subject).toContain('Repor a palavra-passe');
    expect(mail.html).toContain(
      'https://opatriota.pt/conta/nova-palavra-passe?token=tok',
    );
  });
});

describe('socialAccountNoticeTemplate', () => {
  it('sends no link back to this site — there is nothing here to reset', () => {
    const mail = socialAccountNoticeTemplate(CTX, {
      name: 'Ana',
      providers: ['GOOGLE'],
    });

    expect(mail.html).not.toContain('/conta/nova-palavra-passe');
    expect(mail.html).not.toContain('/conta/recuperar');
    expect(mail.html).not.toMatch(/<a\s/);
  });

  it('names the provider and points the reader back at it', () => {
    const mail = socialAccountNoticeTemplate(CTX, {
      name: 'Ana',
      providers: ['FACEBOOK'],
    });

    expect(mail.html).toContain('Facebook');
    expect(mail.subject).toContain('Facebook');
    expect(mail.html).toMatch(/nunca teve\s+uma palavra-passe/);
  });

  it('names both providers when both are linked', () => {
    const mail = socialAccountNoticeTemplate(CTX, {
      name: null,
      providers: ['GOOGLE', 'FACEBOOK'],
    });

    expect(mail.html).toContain('Google ou Facebook');
  });
});
