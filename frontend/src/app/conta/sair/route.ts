import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { READER_COOKIE } from "@/lib/reader-api";

/**
 * Logout. POST only, on purpose: a GET here would be triggered by any
 * link prefetch or corporate mail scanner, silently signing readers out.
 */
export async function POST(req: Request) {
  const store = await cookies();
  store.delete(READER_COOKIE);
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
