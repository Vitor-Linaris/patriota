import {
  isSuspended,
  lapseData,
  suspensionEndsAt,
  suspensionLapsed,
  suspensionMessage,
} from './reader-suspension';

const NOW = new Date('2026-06-15T12:00:00Z');
const PAST = new Date('2026-06-01T12:00:00Z');
const FUTURE = new Date('2026-07-01T12:00:00Z');

describe('reader suspension', () => {
  describe('isSuspended', () => {
    it('is false for anyone not marked SUSPENSO', () => {
      for (const status of ['ATIVO', 'PENDENTE_VERIFICACAO', 'ANONIMIZADO'] as const) {
        expect(isSuspended({ status, suspendedUntil: FUTURE }, NOW)).toBe(false);
      }
    });

    it('is true with no end date — that is what permanent means', () => {
      expect(isSuspended({ status: 'SUSPENSO', suspendedUntil: null }, NOW)).toBe(true);
    });

    it('is true up to the end date and false after it', () => {
      expect(isSuspended({ status: 'SUSPENSO', suspendedUntil: FUTURE }, NOW)).toBe(true);
      expect(isSuspended({ status: 'SUSPENSO', suspendedUntil: PAST }, NOW)).toBe(false);
    });

    it('treats the exact end instant as over', () => {
      expect(isSuspended({ status: 'SUSPENSO', suspendedUntil: NOW }, NOW)).toBe(false);
    });

    it('fails closed when the column was not selected', () => {
      // undefined means a caller forgot `suspendedUntil: true`. Reading
      // that as "no ban" would turn every missing select into an escape
      // hatch, so it reads as permanent instead.
      expect(isSuspended({ status: 'SUSPENSO', suspendedUntil: undefined }, NOW)).toBe(
        true,
      );
    });
  });

  describe('suspensionLapsed', () => {
    it('spots a row that still says banned after the date passed', () => {
      expect(suspensionLapsed({ status: 'SUSPENSO', suspendedUntil: PAST }, NOW)).toBe(
        true,
      );
    });

    it('is false for a live ban, a permanent one, and a clean account', () => {
      expect(suspensionLapsed({ status: 'SUSPENSO', suspendedUntil: FUTURE }, NOW)).toBe(
        false,
      );
      expect(suspensionLapsed({ status: 'SUSPENSO', suspendedUntil: null }, NOW)).toBe(
        false,
      );
      expect(suspensionLapsed({ status: 'ATIVO', suspendedUntil: PAST }, NOW)).toBe(false);
    });
  });

  describe('lapseData', () => {
    it('returns a confirmed account to ATIVO', () => {
      expect(lapseData({ emailVerifiedAt: PAST })).toEqual({
        status: 'ATIVO',
        suspendedUntil: null,
        suspensionReason: null,
        suspendedById: null,
      });
    });

    it('leaves an unconfirmed account unconfirmed', () => {
      // Otherwise serving a ban would have verified their address for
      // them, which is a strange reward.
      expect(lapseData({ emailVerifiedAt: null }).status).toBe('PENDENTE_VERIFICACAO');
    });
  });

  describe('suspensionEndsAt', () => {
    it('counts 15 and 30 days forward, and gives permanent no date', () => {
      expect(suspensionEndsAt('DIAS_15', NOW)!.toISOString()).toBe(
        '2026-06-30T12:00:00.000Z',
      );
      expect(suspensionEndsAt('DIAS_30', NOW)!.toISOString()).toBe(
        '2026-07-15T12:00:00.000Z',
      );
      expect(suspensionEndsAt('PERMANENTE', NOW)).toBeNull();
    });
  });

  describe('suspensionMessage', () => {
    it('names the date on a temporary ban', () => {
      const msg = suspensionMessage({
        suspendedUntil: new Date('2026-07-01T12:00:00Z'),
        suspensionReason: null,
      });
      expect(msg).toContain('julho');
      expect(msg).toContain('2026');
    });

    it('says definitivamente when there is no date', () => {
      expect(
        suspensionMessage({ suspendedUntil: null, suspensionReason: null }),
      ).toContain('definitivamente');
    });

    it('quotes the reason back, because it was written to be read', () => {
      expect(
        suspensionMessage({ suspendedUntil: null, suspensionReason: 'Spam.' }),
      ).toContain('Motivo: Spam.');
    });
  });
});
