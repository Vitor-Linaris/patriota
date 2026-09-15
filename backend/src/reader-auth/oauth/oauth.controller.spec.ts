import { OAuthController } from './oauth.controller';
import { ReaderFeatureGuard } from '../reader-feature.guard';
import { GoogleOAuthGuard, FacebookOAuthGuard } from './oauth.guards';
import { OAUTH_BINDING_COOKIE } from './oauth-binding.cookie';
import type { OAuthService } from './oauth.service';
import type { OAuthStateStore } from './oauth-state.store';

/** Nest's own metadata key for @UseGuards. */
const GUARDS = '__guards__';

function guardsOn(method: keyof OAuthController): unknown[] {
  return (
    (Reflect.getMetadata(
      GUARDS,
      OAuthController.prototype[method] as object,
    ) as unknown[]) ?? []
  );
}

describe('OAuthController — guard order', () => {
  /**
   * Nest appends each @UseGuards() to what is already on the handler,
   * and decorators evaluate bottom-up — so @ReaderPublic() written above
   * @UseGuards(GoogleOAuthGuard) put passport FIRST. On the initiate leg
   * passport ends the request with a 302 to Google, so the feature guard
   * never ran: with FEATURE_READER_AREA=false the button still sent
   * readers to a consent screen for an account system that was switched
   * off, and only the return leg noticed.
   */
  it.each([
    ['google', GoogleOAuthGuard],
    ['googleCallback', GoogleOAuthGuard],
    ['facebook', FacebookOAuthGuard],
    ['facebookCallback', FacebookOAuthGuard],
  ] as const)(
    'runs the feature guard before passport on %s',
    (method, passport) => {
      expect(guardsOn(method)).toEqual([ReaderFeatureGuard, passport]);
    },
  );
});

describe('OAuthController — the callback tail', () => {
  let controller: OAuthController;
  let oauth: { signIn: jest.Mock };
  let state: { consumeState: jest.Mock; issueCode: jest.Mock };
  let res: { redirect: jest.Mock; clearCookie: jest.Mock };

  const profile = { provider: 'GOOGLE', providerAccountId: 'g1' };

  function request(over: { cookie?: string; state?: string } = {}) {
    return {
      user: { ...profile },
      protocol: 'https',
      query: { state: over.state ?? 'st-1' },
      headers: over.cookie === undefined ? {} : { cookie: over.cookie },
    } as never;
  }

  beforeEach(() => {
    oauth = { signIn: jest.fn().mockResolvedValue({ accessToken: 'jwt' }) };
    state = {
      consumeState: jest.fn().mockResolvedValue({ next: '/conta' }),
      issueCode: jest.fn().mockResolvedValue('code-1'),
    };
    res = { redirect: jest.fn(), clearCookie: jest.fn() };
    controller = new OAuthController(
      oauth as unknown as OAuthService,
      state as unknown as OAuthStateStore,
    );
  });

  it('checks the state against the binding cookie, not on its own', async () => {
    await controller.googleCallback(
      request({ cookie: `outra=x; ${OAUTH_BINDING_COOKIE}=segredo-abc` }),
      res as never,
    );

    expect(state.consumeState).toHaveBeenCalledWith('st-1', 'segredo-abc');
  });

  it('passes undefined when the browser brought no cookie at all', async () => {
    await controller.googleCallback(request(), res as never);

    expect(state.consumeState).toHaveBeenCalledWith('st-1', undefined);
  });

  it('clears the binding cookie whether the login worked or not', async () => {
    await controller.googleCallback(
      request({ cookie: `${OAUTH_BINDING_COOKIE}=s` }),
      res as never,
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      OAUTH_BINDING_COOKIE,
      expect.objectContaining({ httpOnly: true, path: '/public/reader/auth' }),
    );

    res.clearCookie.mockClear();
    state.consumeState.mockResolvedValueOnce(null);
    await controller.googleCallback(
      request({ cookie: `${OAUTH_BINDING_COOKIE}=s` }),
      res as never,
    );
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('sends nothing but a fixed marker back on failure', async () => {
    // `?erro=` used to carry the thrown message, and the login page
    // printed it verbatim in its error banner — free text, on the
    // genuine origin, under the real domain.
    oauth.signIn.mockRejectedValueOnce(
      new Error('Ligue já para o 800 000 000 e confirme os seus dados'),
    );

    await controller.googleCallback(
      request({ cookie: `${OAUTH_BINDING_COOKIE}=s` }),
      res as never,
    );

    const target = res.redirect.mock.calls[0]![0] as string;
    expect(target).toContain('?erro=1');
    expect(target).not.toContain('800 000 000');
    expect(target).not.toContain('800%20000%20000');
  });

  it('still completes a good round trip with a one-time code', async () => {
    await controller.googleCallback(
      request({ cookie: `${OAUTH_BINDING_COOKIE}=s` }),
      res as never,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('code=code-1'),
    );
  });
});
