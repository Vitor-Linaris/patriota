import { NextResponse } from "next/server";
import { forward } from "../_forward";

/** Per-reader state for one article: heart, follow toggle, history. */
export async function GET(req: Request) {
  const articleId = new URL(req.url).searchParams.get("articleId");
  if (!articleId) {
    return NextResponse.json({ message: "articleId em falta." }, { status: 400 });
  }
  return forward(`/reader/state?articleId=${encodeURIComponent(articleId)}`);
}
