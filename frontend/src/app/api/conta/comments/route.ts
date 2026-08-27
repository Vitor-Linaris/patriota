import { NextResponse } from "next/server";
import { forward, readJson } from "../_forward";

/** Post a comment on an article. */
export async function POST(req: Request) {
  const body = await readJson<{ slug?: string; body?: string; parentId?: string }>(
    req,
  );
  if (!body?.slug || !body.body) {
    return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
  }
  return forward(
    `/public/articles/${encodeURIComponent(body.slug)}/comments`,
    {
      method: "POST",
      body: JSON.stringify({
        body: body.body,
        ...(body.parentId ? { parentId: body.parentId } : {}),
      }),
    },
  );
}

/** Edit one of the reader's own comments (15-minute window, server-enforced). */
export async function PATCH(req: Request) {
  const body = await readJson<{ id?: string; body?: string }>(req);
  if (!body?.id || !body.body) {
    return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
  }
  return forward(`/public/comments/${encodeURIComponent(body.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ body: body.body }),
  });
}

export async function DELETE(req: Request) {
  const body = await readJson<{ id?: string }>(req);
  if (!body?.id) {
    return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
  }
  return forward(`/public/comments/${encodeURIComponent(body.id)}`, {
    method: "DELETE",
  });
}
