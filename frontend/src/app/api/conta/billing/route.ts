import { NextResponse } from "next/server";
import { forward, readJson } from "../_forward";

/**
 * Starts a Stripe Checkout or opens the billing portal.
 *
 * Both come through here rather than the browser calling the API
 * directly, for the reason every route in this folder exists: the reader
 * token lives in an httpOnly cookie the client cannot read.
 *
 * One handler with an `action` rather than two routes, because they are
 * the same shape — POST, no payload, answer is a Stripe URL to send the
 * reader to — and the alternative is two near-identical files.
 */
export async function POST(req: Request) {
  const body = await readJson<{ action?: string }>(req);
  const action = body?.action;

  if (action !== "checkout" && action !== "portal") {
    return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
  }

  // Hard-coded paths, never interpolated from the request. Same rule as
  // the rest of this folder: a path built from client input is one
  // missing check away from replaying a reader token against /admin/*.
  return forward(
    action === "checkout" ? "/reader/billing/checkout" : "/reader/billing/portal",
    { method: "POST", body: "{}" },
  );
}
