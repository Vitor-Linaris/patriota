/**
 * Ad data shapes + mapping shared between server and client. This
 * module deliberately has no "use client" directive so it can be
 * imported from server components (page.tsx, layout.tsx, etc.) —
 * AdContext.tsx (the client provider) re-exports the type aliases
 * for its own consumers.
 */

export type AdTypeApi = "EMPTY" | "IMAGE" | "HTML";
export type AdType = "empty" | "image" | "html";

export interface Ad {
  id: string;
  name: string;
  page: string;
  position: string;
  /** "970×90" (px, unicode multiplication sign). */
  size: string;
  sizeLabel: string;
  type: AdType;
  enabled: boolean;
  imageUrl?: string;
  linkUrl?: string;
  linkTarget?: "_blank" | "_self";
  altText?: string;
  htmlCode?: string;
  label?: string;
  updatedAt?: string;
}

export interface AdApi {
  id: string;
  name: string;
  page: string;
  position: string;
  size: string;
  sizeLabel: string;
  type: AdTypeApi;
  enabled: boolean;
  imageUrl: string | null;
  linkUrl: string | null;
  linkTarget: string | null;
  altText: string | null;
  htmlCode: string | null;
  updatedAt: string;
}

const TYPE_API_TO_UI: Record<AdTypeApi, AdType> = {
  EMPTY: "empty",
  IMAGE: "image",
  HTML: "html",
};

export const TYPE_UI_TO_API: Record<AdType, AdTypeApi> = {
  empty: "EMPTY",
  image: "IMAGE",
  html: "HTML",
};

export function mapApiAdToUi(api: AdApi): Ad {
  return {
    id: api.id,
    name: api.name,
    page: api.page,
    position: api.position,
    size: api.size,
    sizeLabel: api.sizeLabel,
    type: TYPE_API_TO_UI[api.type],
    enabled: api.enabled,
    imageUrl: api.imageUrl ?? undefined,
    linkUrl: api.linkUrl ?? undefined,
    linkTarget:
      api.linkTarget === "_blank" || api.linkTarget === "_self"
        ? api.linkTarget
        : undefined,
    altText: api.altText ?? undefined,
    htmlCode: api.htmlCode ?? undefined,
    updatedAt: api.updatedAt,
  };
}

/**
 * Parse "970×90" / "970x90" / "970 × 90" into numeric width/height.
 * Returns null if the string doesn't match — the caller should then
 * skip the max-width constraint and let the slot fill its parent.
 */
export function parseAdSize(
  size: string,
): { width: number; height: number } | null {
  const m = size.trim().match(/^(\d+)\s*[×x]\s*(\d+)$/i);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}
