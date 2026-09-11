import { subscriptionExcluded } from './package-access';

const included = { includedInSubscription: true };
const excluded = { includedInSubscription: false };

describe('subscriptionExcluded', () => {
  it('leaves the entire archive alone: no pacote, nothing changes', () => {
    // The common case by a very wide margin. If this ever returns true,
    // every exclusive on the site stops being readable by subscribers.
    expect(subscriptionExcluded([])).toBe(false);
  });

  it('does not touch the subscription for a pacote that is part of it', () => {
    expect(subscriptionExcluded([included])).toBe(false);
  });

  it('takes the article off the subscription when the pacote is sold apart', () => {
    // The inversion this whole file exists for.
    expect(subscriptionExcluded([excluded])).toBe(true);
  });

  it('keeps the article for subscribers when ONE pacote still includes it', () => {
    // Entitlements are additive. Pins the "every" instead of "some":
    // with "some", an editor dropping a published article into a new
    // paid-apart pacote would silently delete it from every
    // subscriber's account, with nothing on screen to explain it.
    expect(subscriptionExcluded([included, excluded])).toBe(false);
    expect(subscriptionExcluded([excluded, included])).toBe(false);
  });

  it('excludes only when every containing pacote excludes', () => {
    expect(subscriptionExcluded([excluded, excluded])).toBe(true);
    expect(subscriptionExcluded([included, included])).toBe(false);
  });
});
