import { NextResponse } from "next/server";
import { forward, readJson } from "../../_forward";

/**
 * Starts a Stripe Checkout for one pacote.
 *
 * The slug travels in the BODY, both here and on to the API, so the
 * forwarded path stays a constant with nothing interpolated into it —
 * the rule stated in _forward.ts, and the reason there is no catch-all
 * in this folder.
 *
 * It is validated anyway, against the same shape the API's DTO accepts.
 * Not because it is going into a path (it is not), but because a 400 from
 * here is cheaper than a round-trip to be told the same thing.
 *
 * Note what is NOT accepted: any amount. The price comes from the pacote
 * row and the charged total comes back from Stripe.
 */
export async function POST(req: Request) {
  const body = await readJson<{ slug?: string }>(req);
  const slug = body?.slug;

  if (typeof slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ message: "Pacote inválido." }, { status: 400 });
  }

  return forward("/reader/packages/checkout", {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
}
