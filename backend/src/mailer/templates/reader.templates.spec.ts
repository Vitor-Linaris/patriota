import {
  registrationAttemptTemplate,
  resetPasswordTemplate,
} from './reader.templates';

const CTX = { siteName: 'O Patriota Notícias', siteUrl: 'https://opatriota.pt' };

/**
 * The bug these templates used to cause: a reader who signed up through
 * Google/Facebook has no password. Telling them "não se recorda da
 * palavra-passe?" is a question that does not apply, and the reset link
 * underneath it used to be a dead end regardless of the wording (see
 * ReaderAuthService.forgotPassword). These tests lock the copy that
 * distinguishes the two cases, so the branch cannot be flipped back by
 * accident.
 */
describe('registrationAttemptTemplate', () => {
  it('offers to reset, for an account that already has a password', () => {
    const mail = registrationAttemptTemplate(CTX, {
      name: 'Ana',
      hasPassword: true,
    });

    expect(mail.html).toContain('não se recorda da palavra-passe');
    expect(mail.html).not.toContain('rede social');
  });

  it('offers to set one, for a social-only account, and never mentions forgetting', () => {
    const mail = registrationAttemptTemplate(CTX, {
      name: 'Ana',
      hasPassword: false,
    });

    expect(mail.html).toContain('rede social');
    expect(mail.html).not.toContain('não se recorda da palavra-passe');
    expect(mail.html).toContain('Definir palavra-passe');
  });

  it('always says plainly that nothing was created and nothing changed', () => {
    for (const hasPassword of [true, false]) {
      const mail = registrationAttemptTemplate(CTX, { name: null, hasPassword });
      expect(mail.html).toContain('Não foi criada nenhuma');
    }
  });
});

describe('resetPasswordTemplate', () => {
  it('calls it "definir", not "repor", for a first password', () => {
    const mail = resetPasswordTemplate(CTX, {
      name: 'Ana',
      token: 'tok',
      firstPassword: true,
    });

    expect(mail.subject).toContain('Defina uma palavra-passe');
    expect(mail.html).toContain('ainda não tem palavra-passe');
    expect(mail.html).not.toContain('Repor');
  });

  it('keeps the normal "repor" wording otherwise', () => {
    const mail = resetPasswordTemplate(CTX, {
      name: 'Ana',
      token: 'tok',
      firstPassword: false,
    });

    expect(mail.subject).toContain('Repor a palavra-passe');
    expect(mail.html).not.toContain('ainda não tem palavra-passe');
  });

  it('defaults to the normal wording when the flag is omitted', () => {
    const mail = resetPasswordTemplate(CTX, { name: 'Ana', token: 'tok' });
    expect(mail.subject).toContain('Repor a palavra-passe');
  });

  it('the link works the same way in both cases — one token, one route', () => {
    const first = resetPasswordTemplate(CTX, {
      name: null,
      token: 'shared-tok',
      firstPassword: true,
    });
    const normal = resetPasswordTemplate(CTX, {
      name: null,
      token: 'shared-tok',
      firstPassword: false,
    });
    const url = 'https://opatriota.pt/conta/nova-palavra-passe?token=shared-tok';
    expect(first.html).toContain(url);
    expect(normal.html).toContain(url);
  });
});
