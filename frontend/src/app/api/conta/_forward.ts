import { NextResponse } from "next/server";
import { readerApiFetch } from "@/lib/reader-api";

/**
 * Shared plumbing for the reader BFF routes.
 *
 * These exist because the reader token lives in an httpOnly cookie and
 * the API is a different origin (:8585 vs :3005), so client components
 * cannot call the backend directly. Each route handler runs server-side,
 * attaches the bearer, and forwards.
 *
 * Deliberately one small handler PER endpoint rather than a
 * `[...path]` catch-all. A catch-all that forwards an arbitrary path with
 * a bearer attached is one missing prefix check away from letting a
 * reader token be replayed against /admin/*, and a catch-all that read
 * patriota_session would be a full SSRF into the admin API. The paths
 * below are hard-coded on purpose — do not "generalise" them.
 */
export async function forward(
  path: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  const res = await readerApiFetch(path, init);

  if (!res) {
    return NextResponse.json({ message: "Sem sessão." }, { status: 401 });
  }

  const body = await res.text();
  return new NextResponse(body || null, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Reads a JSON body, tolerating an empty one. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
