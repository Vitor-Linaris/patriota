import {
  effectivePlan,
  lapsedPlanData,
  planActive,
  planLapsed,
} from './reader-entitlement';

const NOW = new Date('2026-06-15T12:00:00Z');
const PAST = new Date('2026-06-01T12:00:00Z');
const FUTURE = new Date('2026-07-01T12:00:00Z');

describe('reader entitlement', () => {
  describe('planActive', () => {
    it('is false on the free plan whatever the date says', () => {
      expect(planActive({ plan: 'GRATIS', planRenewsAt: FUTURE }, NOW)).toBe(false);
    });

    it('is true with no end date', () => {
      expect(planActive({ plan: 'PREMIUM', planRenewsAt: null }, NOW)).toBe(true);
    });

    it('is true up to the end date and false after it', () => {
      expect(planActive({ plan: 'PREMIUM', planRenewsAt: FUTURE }, NOW)).toBe(true);
      expect(planActive({ plan: 'PREMIUM', planRenewsAt: PAST }, NOW)).toBe(false);
    });

    it('reads a missing column as no end date, not as cancelled', () => {
      // The opposite default to isSuspended(), and deliberately so. A
      // forgotten `select` here would otherwise cancel every
      // subscription in the database at once. The two failure modes are
      // not comparable: this one is a support ticket, the other is a
      // chargeback.
      expect(planActive({ plan: 'PREMIUM', planRenewsAt: undefined }, NOW)).toBe(
        true,
      );
    });
  });

  describe('effectivePlan', () => {
    it('downgrades a lapsed subscription to GRATIS', () => {
      expect(effectivePlan({ plan: 'PREMIUM', planRenewsAt: PAST }, NOW)).toBe(
        'GRATIS',
      );
      expect(effectivePlan({ plan: 'PREMIUM', planRenewsAt: FUTURE }, NOW)).toBe(
        'PREMIUM',
      );
    });
  });

  describe('planLapsed', () => {
    it('spots a row still claiming a plan whose date has passed', () => {
      expect(planLapsed({ plan: 'PREMIUM', planRenewsAt: PAST }, NOW)).toBe(true);
      expect(planLapsed({ plan: 'PREMIUM', planRenewsAt: FUTURE }, NOW)).toBe(false);
      expect(planLapsed({ plan: 'PREMIUM', planRenewsAt: null }, NOW)).toBe(false);
      expect(planLapsed({ plan: 'GRATIS', planRenewsAt: PAST }, NOW)).toBe(false);
    });
  });

  describe('lapsedPlanData', () => {
    it('clears the plan but keeps nothing that identifies the customer', () => {
      const data = lapsedPlanData();
      expect(data.plan).toBe('GRATIS');
      expect(data.planRenewsAt).toBeNull();
      expect(data.planSource).toBeNull();
      // stripeCustomerId is NOT in here on purpose: they are still the
      // same customer, and dropping the id would orphan their billing
      // history and mint a second one if they ever came back.
      expect('stripeCustomerId' in data).toBe(false);
    });
  });
});
