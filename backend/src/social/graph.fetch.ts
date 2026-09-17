/**
 * One POST to the Meta Graph API.
 *
 * No HTTP client library: this repository already talks to Brevo and
 * Resend with bare `fetch` and nothing else, and one integration is not
 * a reason to add a dependency the other three would not use.
 *
 * What IS added, and what the mail drivers are missing, is a timeout.
 * These calls run inside a cron tick; a request that hangs with no
 * AbortController hangs the tick, and the next tick starts anyway — so
 * the failure mode of "Meta is slow today" would be an ever-growing pile
 * of stuck requests rather than a retry tomorrow.
 */
const TIMEOUT_MS = 20_000;

export class GraphError extends Error {
  constructor(
    message: string,
    /** Meta's own code, when it sent one. Worth keeping: 190 is an
     *  expired token and reads very differently from a rate limit. */
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
  };
}

export async function graphPost<T>(
  url: string,
  params: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      // Form encoding, not JSON: the Graph API accepts both, but the
      // access_token travels in the BODY here rather than the query
      // string, which keeps it out of any proxy or access log between
      // here and Meta.
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GraphError(
        `Sem resposta da Meta ao fim de ${TIMEOUT_MS / 1000}s.`,
      );
    }
    throw new GraphError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new GraphError(
      `Resposta ilegível da Meta (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }

  if (!res.ok) {
    const e = (body as GraphErrorBody).error;
    // error_user_msg first: when Meta sends it, it is the sentence
    // written for a human, and it is what the newsroom will read in the
    // admin queue.
    const message = e?.error_user_msg ?? e?.message ?? `HTTP ${res.status}`;
    throw new GraphError(message, e?.code, e?.error_subcode);
  }

  return body as T;
}

export async function graphGet<T>(
  url: string,
  params: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const qs = new URLSearchParams(params).toString();

  try {
    const res = await fetch(`${url}?${qs}`, { signal: controller.signal });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const e = (body as GraphErrorBody).error;
      throw new GraphError(
        e?.error_user_msg ?? e?.message ?? `HTTP ${res.status}`,
        e?.code,
        e?.error_subcode,
      );
    }
    return body as T;
  } catch (err) {
    if (err instanceof GraphError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GraphError(
        `Sem resposta da Meta ao fim de ${TIMEOUT_MS / 1000}s.`,
      );
    }
    throw new GraphError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}
