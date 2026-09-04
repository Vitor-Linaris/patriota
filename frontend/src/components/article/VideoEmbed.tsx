/**
 * A partner's video, embedded from a raw URL an editor pasted.
 *
 * Three shapes come in, and they need three different players:
 *
 *   - A direct file (.mp4/.webm/.ogg/.m3u8) — plays in a plain <video>.
 *     This is what you get from most partner CDNs when you open their
 *     player's network tab and copy the actual media URL rather than the
 *     page it's embedded in.
 *   - YouTube or Vimeo — the normal watch/share URL is rewritten to
 *     that provider's embeddable player URL. Pasting a youtube.com/watch
 *     link would otherwise just iframe their whole site, which most
 *     providers block from framing anyway (X-Frame-Options).
 *   - Anything else — a partner's own article/player page, which is
 *     usually what you actually have (see the naminhaterra.com example
 *     this was built for). Framed as a best-effort generic <iframe>,
 *     with a plain link alongside: some sites refuse to be framed at
 *     all, and there is no reliable way to detect that from here before
 *     trying — the iframe just renders blank if so, and the link is the
 *     fallback that always works.
 *
 * None of this transcodes or proxies anything — it only recognises the
 * URL's shape and picks a player. A partner CDN link is often signed or
 * tied to a live event and can stop working on its own; that is a
 * property of the URL a moderator pasted, not something this component
 * can fix.
 */

const FILE_EXTENSIONS = /\.(mp4|webm|ogv|ogg|m3u8)(\?|#|$)/i;

function youTubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.slice(1) || null;
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const shorts = url.pathname.match(/^\/shorts\/([^/]+)/);
    if (shorts) return shorts[1];
    const embed = url.pathname.match(/^\/embed\/([^/]+)/);
    if (embed) return embed[1];
  }
  return null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const match = url.pathname.match(/(\d{6,})/);
  return match ? match[1] : null;
}

export function VideoEmbed({ url }: { url: string }) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (FILE_EXTENSIONS.test(parsed.pathname)) {
    return (
      <figure className="mt-8">
        <video
          controls
          preload="metadata"
          className="aspect-video w-full rounded-lg bg-black"
        >
          <source src={url} />
        </video>
      </figure>
    );
  }

  const yt = youTubeId(parsed);
  if (yt) {
    return (
      <figure className="mt-8">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${yt}`}
          title="Vídeo incorporado"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full rounded-lg"
        />
      </figure>
    );
  }

  const vimeo = vimeoId(parsed);
  if (vimeo) {
    return (
      <figure className="mt-8">
        <iframe
          src={`https://player.vimeo.com/video/${vimeo}`}
          title="Vídeo incorporado"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full rounded-lg"
        />
      </figure>
    );
  }

  // Generic fallback: the partner's own page, framed as-is. Some sites
  // refuse this (X-Frame-Options/CSP) with no client-visible error — the
  // link below is what still works when that happens.
  return (
    <figure className="mt-8">
      <iframe
        src={url}
        title="Vídeo incorporado"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full rounded-lg bg-slate-100"
      />
      <figcaption className="mt-2 text-xs text-slate-400">
        O vídeo não aparece?{" "}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#0F2C6B] hover:underline"
        >
          Abrir na fonte original ↗
        </a>
      </figcaption>
    </figure>
  );
}
