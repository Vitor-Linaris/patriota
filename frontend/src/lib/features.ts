/**
 * Public-facing feature flags.
 *
 * Values come from NEXT_PUBLIC_* env vars so server + client agree on
 * what is hidden. Default to OFF — features must be opted-in explicitly.
 *
 * IMPORTANT: do NOT use these for security boundaries; they only control
 * UI visibility. Server-side checks must always enforce permissions.
 */
export const FEATURES = {
  /**
   * Master switch for the public reader area (/conta/*). Its backend
   * counterpart is FEATURE_READER_AREA — deliberately WITHOUT the
   * NEXT_PUBLIC_ prefix, because this flag only hides UI: the API is
   * reachable on :8585 directly and does its own gating.
   */
  readerArea: process.env.NEXT_PUBLIC_FEATURE_READER_AREA === "true",

  /**
   * Whether this deployment can take a payment today.
   *
   * Mirrors the presence of STRIPE_SECRET_KEY on the API, which is the
   * real switch — this one only decides whether the reader is offered a
   * "Assinar agora" button or the page that explains what is coming. A
   * button that can only ever produce an error is worse than no button,
   * which is the whole reason this flag exists rather than always
   * showing the checkout.
   */
  billing: process.env.NEXT_PUBLIC_FEATURE_BILLING === "true",

  /**
   * Comments engine (posting, moderation, "Mais comentadas" tab). The
   * backend has no Comment model yet, so the UI is hidden until the
   * module ships.
   */
  comments: process.env.NEXT_PUBLIC_FEATURE_COMMENTS === "true",

  /**
   * Audio reader / "Ouvir artigo" in the article sidebar. Stub UI until
   * a TTS provider is wired up.
   */
  audioReader: process.env.NEXT_PUBLIC_FEATURE_AUDIO === "true",

  /**
   * "Acompanhar tema" follow buttons. Depends on a user-facing account
   * system that does not exist yet.
   */
  topicFollow: process.env.NEXT_PUBLIC_FEATURE_TOPIC_FOLLOW === "true",

  /**
   * Public Login / Registar links in the top bar, pointing at /conta.
   * /admin/login stays internal-only by design and is reachable only by
   * typing the URL — readers and staff are separate account systems.
   */
  publicAuth: process.env.NEXT_PUBLIC_FEATURE_PUBLIC_AUTH === "true",

  /**
   * The "Conteúdo Exclusivo" switch in the article editor.
   *
   * The paywall behind it now exists: findPublicBySlug() withholds the
   * body of a flagged article from anyone whose plan lacks
   * `assinantes.ler_exclusivos`. Two other things still have to be true
   * for marking a piece exclusive to mean anything —
   * FEATURE_PAYWALL=true on the API, and a way for a reader to actually
   * subscribe, which arrives with Stripe. Until then this stays off in
   * production so nobody marks a piece "subscribers only" months before
   * anyone can become one.
   */
  subscriberPublishing:
    process.env.NEXT_PUBLIC_FEATURE_SUBSCRIBER_PUBLISHING === "true",

  /**
   * Pacotes exclusivos: /pacotes, /pacotes/[slug] and "Os meus pacotes".
   *
   * The storefront for sets of articles sold once-off. Its backend
   * counterpart is FEATURE_PACKAGES — again without NEXT_PUBLIC_, and
   * again only the PUBLIC and READER halves: /admin/pacotes is gated by
   * the pacotes.* permissions instead, so a newsroom can build pacotes
   * before the day the storefront opens.
   *
   * Whether a pacote shows a buy button is a separate question, answered
   * by `billing` above plus the pacote actually having a Stripe Price.
   */
  packages: process.env.NEXT_PUBLIC_FEATURE_PACKAGES === "true",
} as const;

export type FeatureFlag = keyof typeof FEATURES;
