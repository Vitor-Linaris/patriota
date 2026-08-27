import { NextResponse } from "next/server";
import { forward, readJson } from "../_forward";

/** Reading-history ping, fired once per article view from the client. */
export async function POST(req: Request) {
  const body = await readJson<{ articleId?: string; progress?: number }>(req);
  if (!body?.articleId) {
    return NextResponse.json({ message: "articleId em falta." }, { status: 400 });
  }
  return forward("/reader/history", {
    method: "POST",
    body: JSON.stringify({
      articleId: body.articleId,
      ...(typeof body.progress === "number" ? { progress: body.progress } : {}),
    }),
  });
}
