import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Uploads a video to the API.
 *
 * A Route Handler and not a Server Action, which is how every other
 * upload in this admin works. The reason is a hard limit rather than a
 * preference: `experimental.serverActions.bodySizeLimit` in
 * next.config.ts is 12 MB, and a body over it does not come back as an
 * error anybody can act on — Next aborts the request and the person
 * uploading sees "an unexpected response was received from the server",
 * with nothing about size in it. A 100 MB video would hit that every
 * single time.
 *
 * Route Handlers have no such limit, so the browser posts here and the
 * request is passed along to the API as a stream. Images keep using
 * `uploadMediaFileAction`; they are small, and it works.
 */
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Forwarded as a stream, with the multipart boundary the browser
  // chose. Re-packing it into a fresh FormData — which is what the
  // image action does — would buffer the whole video in this process
  // twice over, for no gain.
  const contentType = req.headers.get("content-type");
  if (!contentType?.startsWith("multipart/form-data")) {
    return NextResponse.json(
      { message: "Envio inválido." },
      { status: 400 },
    );
  }

  const upstream = await fetch(`${apiBaseUrl()}/admin/media/video`, {
    method: "POST",
    body: req.body,
    // Required by undici for a streaming request body, and inert
    // otherwise. Without it Node refuses to send the stream at all.
    duplex: "half",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
  } as RequestInit & { duplex: "half" });

  // The API's own message is passed through verbatim, and it is worth
  // it: "o vídeo tem 6:12 e o limite é 5:00" tells the person what to
  // do, which is the whole point of the checks on the other side.
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
