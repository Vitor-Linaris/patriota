import { NextResponse } from "next/server";
import { forward, readJson } from "../_forward";

interface Payload {
  type: "article" | "category";
  id: string;
  notify?: boolean;
}

/**
 * Toggle a favourite. The `type` is validated against a closed set and
 * the path is built here, never taken from the client — see the note in
 * _forward.ts about why there is no catch-all.
 */
function pathFor(body: Payload | null): string | null {
  if (!body?.id || typeof body.id !== "string") return null;
  if (body.type === "article") {
    return `/reader/favorites/articles/${encodeURIComponent(body.id)}`;
  }
  if (body.type === "category") {
    return `/reader/favorites/categories/${encodeURIComponent(body.id)}`;
  }
  return null;
}

export async function PUT(req: Request) {
  const body = await readJson<Payload>(req);
  const path = pathFor(body);
  if (!path) {
    return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
  }
  return forward(path, {
    method: "PUT",
    body: JSON.stringify(
      body!.type === "category" && body!.notify !== undefined
        ? { notify: body!.notify }
        : {},
    ),
  });
}

export async function DELETE(req: Request) {
  const body = await readJson<Payload>(req);
  const path = pathFor(body);
  if (!path) {
    return NextResponse.json({ message: "Pedido inválido." }, { status: 400 });
  }
  return forward(path, { method: "DELETE" });
}
