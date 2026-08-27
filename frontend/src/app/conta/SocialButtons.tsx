import { apiBaseUrl } from "@/lib/api-base";

/**
 * Providers with credentials actually configured on the backend.
 *
 * Asked at render time rather than mirrored into NEXT_PUBLIC_ flags: the
 * backend is the only place that knows whether a client secret is
 * present, and a second copy of that truth in the frontend env would
 * drift — showing a Google button that 404s, or hiding one that works.
 *
 * Failure is silent and means "no buttons": a social login that cannot
 * be reached should be invisible, not an error on the login page.
 */
async function configuredProviders(): Promise<string[]> {
  try {
    const res = await fetch(`${apiBaseUrl()}/public/reader/auth/providers`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { providers?: string[] };
    return data.providers ?? [];
  } catch {
    return [];
  }
}

const BUTTON =
  "flex h-[46px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-slate-300 bg-white text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-400";

/** Inline SVG — no third-party script, so nothing new for the cookie banner. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
      />
    </svg>
  );
}

/**
 * Sign-in buttons. Plain links, not fetch: OAuth needs a top-level
 * navigation so the provider can show its own consent screen and set
 * its own cookies.
 *
 * `next` rides as a query param and is sanitised server-side before it
 * is stored in the Redis state — it never round-trips through the
 * provider.
 */
export async function SocialButtons({ next = "/conta" }: { next?: string }) {
  const providers = await configuredProviders();
  if (providers.length === 0) return null;

  // NOT apiBaseUrl(): that resolves to INTERNAL_API_URL (http://api:8585)
  // on the server, which the browser cannot reach. OAuth needs a real
  // top-level navigation, so the href must be the public origin.
  const publicApi = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8585"
  ).replace(/[/]+$/, "");

  const href = (provider: string) =>
    `${publicApi}/public/reader/auth/${provider}?next=${encodeURIComponent(next)}`;

  return (
    <div className="flex flex-col gap-2.5">
      {providers.includes("GOOGLE") && (
        <a href={href("google")} className={BUTTON}>
          <GoogleMark />
          Continuar com Google
        </a>
      )}
      {providers.includes("FACEBOOK") && (
        <a href={href("facebook")} className={BUTTON}>
          <FacebookMark />
          Continuar com Facebook
        </a>
      )}

      <div className="my-1 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] uppercase tracking-wider text-slate-400">
          ou
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}
