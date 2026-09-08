/**
 * The one rule that pacotes add to the paywall, kept pure.
 *
 * Same shape as paywall.ts next door: a decision with no Prisma and no
 * Nest in it, so the truth table can be tested directly instead of
 * through four layers of mocks. PackageAccessService does the queries and
 * calls this.
 */

/**
 * Whether this article's pacote membership REVOKES the subscription's
 * right to read it.
 *
 * The inversion. Normally `assinantes.ler_exclusivos` is the last word on
 * an exclusive: hold the permission, read the article. A pacote with
 * includedInSubscription = false says otherwise — it is sold separately,
 * and a PREMIUM subscriber has to buy it like anybody else.
 *
 * The test is "EVERY published pacote containing it excludes the
 * subscription", not "any". Entitlements are additive here on purpose: if
 * the article ALSO sits in a pacote that is part of the subscription, the
 * subscriber keeps it. The restrictive reading would mean one editor
 * dropping an already-published article into a new pacote silently
 * deleted it from every subscriber's account, with no warning and nothing
 * on screen to explain it.
 *
 * An empty list — the article is in no published pacote at all — is
 * false. That is the case for the entire archive, and it has to stay
 * cheap and boring.
 *
 * Callers must pass ONLY memberships of `PUBLICADO` pacotes. A draft
 * pacote must never be able to lock a live article; enforcing that in the
 * query rather than here keeps this function a single expression.
 */
export function subscriptionExcluded(
  memberships: readonly { includedInSubscription: boolean }[],
): boolean {
  return (
    memberships.length > 0 &&
    memberships.every((m) => !m.includedInSubscription)
  );
}
