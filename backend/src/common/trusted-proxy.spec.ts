import { trustedProxyHops } from './trusted-proxy';

describe('trustedProxyHops()', () => {
  it('defaults to one proxy — Caddy or Nginx alone', () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops('')).toBe(1);
    expect(trustedProxyHops('  ')).toBe(1);
  });

  it('reads the number of proxies', () => {
    expect(trustedProxyHops('2')).toBe(2);
    expect(trustedProxyHops(' 0 ')).toBe(0);
  });

  it('refuses to boot on a value it would have to guess about', () => {
    // Too few lumps every visitor into one bucket; too many lets a forged
    // header through. Guessing picks one of those silently.
    for (const bad of ['abc', '1.5', '-1', '6', 'true']) {
      expect(() => trustedProxyHops(bad)).toThrow(/TRUSTED_PROXY_HOPS/);
    }
  });
});
