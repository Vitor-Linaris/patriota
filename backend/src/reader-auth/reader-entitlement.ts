import type { ReaderPlan } from '../../generated/prisma/enums';

/**
 * Whether a reader's subscription is still worth anything today.
 *
 * Same shape as reader-suspension.ts, and for the same reason: an
 * entitlement that ends on a date must end BY that date passing, not by
 * a job waking up and writing GRATIS. A subscription that outlives its
 * expiry because a cron did not fire is a paywall with a hole in it, and
 * one that dies early because a cron fired twice is a refund request.
 *
 * The rule:
 *
 *   plan GRATIS                    → nothing to check
 *   planRenewsAt NULL              → entitled, no end date
 *   planRenewsAt in the future     → entitled until then
 *   planRenewsAt in the past       → lapsed; reads as GRATIS
 *
 * That last line covers a cancelled Stripe subscription too: cancelling
 * sets the date to the end of the period already paid for, and access
 * simply stops being true when it arrives.
 */
export interface EntitlementFields {
  plan: ReaderPlan | string;
  /**
   * `undefined` means the caller's `select` omitted it. Read as NULL —
   * i.e. no end date — because the alternative is a forgotten field
   * silently cancelling every subscription in the database. The failure
   * modes are not symmetric: this one shows up in a support ticket, the
   * other one shows up in a chargeback.
   */
  planRenewsAt?: Date | null;
}

/** True while the paid plan still applies. */
export function planActive(
  reader: EntitlementFields,
  now: Date = new Date(),
): boolean {
  if (reader.plan === 'GRATIS') return false;
  const until = reader.planRenewsAt ?? null;
  if (until === null) return true;
  return until.getTime() > now.getTime();
}

/**
 * The plan to authorise against.
 *
 * Everything that asks "may this reader do X" should go through here
 * rather than reading `reader.plan`, so a lapsed subscription is
 * indistinguishable from never having had one. The guard puts the result
 * of this on the principal, which means no consumer downstream has to
 * remember.
 */
export function effectivePlan(
  reader: EntitlementFields,
  now: Date = new Date(),
): ReaderPlan {
  return planActive(reader, now) ? (reader.plan as ReaderPlan) : 'GRATIS';
}

/** True when the row still claims a paid plan whose date has passed. */
export function planLapsed(
  reader: EntitlementFields,
  now: Date = new Date(),
): boolean {
  const until = reader.planRenewsAt ?? null;
  return (
    reader.plan !== 'GRATIS' &&
    until !== null &&
    until.getTime() <= now.getTime()
  );
}

/**
 * The write that clears a lapsed plan.
 *
 * `stripeCustomerId` is deliberately NOT cleared: the person is still
 * the same customer, and losing the id would orphan their billing
 * history and make a later resubscription create a second customer.
 */
export function lapsedPlanData() {
  return {
    plan: 'GRATIS' as const,
    planStatus: null,
    planRenewsAt: null,
    planSource: null,
    planGrantedById: null,
    planNote: null,
  };
}
