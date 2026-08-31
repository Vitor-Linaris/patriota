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
} as const;

export type FeatureFlag = keyof typeof FEATURES;
