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
   * Public Login / Registar links in the top bar. The /admin/login
   * page is internal-only by design; reaching it requires typing the
   * URL directly.
   */
  publicAuth: process.env.NEXT_PUBLIC_FEATURE_PUBLIC_AUTH === "true",
} as const;

export type FeatureFlag = keyof typeof FEATURES;
