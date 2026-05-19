"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  updateAdAction,
  type AdTypeApi,
} from "@/app/admin/publicidade/actions";

export type AdType = "empty" | "image" | "html";

export interface Ad {
  id: string;
  name: string;
  page: string;
  position: string;
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

const TYPE_API_TO_UI: Record<AdTypeApi, AdType> = {
  EMPTY: "empty",
  IMAGE: "image",
  HTML: "html",
};

const TYPE_UI_TO_API: Record<AdType, AdTypeApi> = {
  empty: "EMPTY",
  image: "IMAGE",
  html: "HTML",
};

interface AdContextValue {
  ads: Ad[];
  updateAd: (id: string, patch: Partial<Ad>) => void;
  getAd: (id: string) => Ad | undefined;
  saving: boolean;
}

const AdContext = createContext<AdContextValue | null>(null);

export function AdProvider({
  initialAds,
  children,
}: {
  initialAds: Ad[];
  children: ReactNode;
}) {
  const [ads, setAds] = useState<Ad[]>(initialAds);
  const [saving, startTransition] = useTransition();

  const updateAd = useCallback((id: string, patch: Partial<Ad>) => {
    // Optimistic update for snappy UI.
    setAds((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              ...patch,
              updatedAt: new Date().toLocaleString("pt-PT"),
            }
          : a,
      ),
    );
    startTransition(async () => {
      const payload: Parameters<typeof updateAdAction>[1] = {};
      if (patch.type !== undefined) payload.type = TYPE_UI_TO_API[patch.type];
      if (patch.enabled !== undefined) payload.enabled = patch.enabled;
      if (patch.imageUrl !== undefined) payload.imageUrl = patch.imageUrl || null;
      if (patch.linkUrl !== undefined) payload.linkUrl = patch.linkUrl || null;
      if (patch.linkTarget !== undefined)
        payload.linkTarget = patch.linkTarget || null;
      if (patch.altText !== undefined) payload.altText = patch.altText || null;
      if (patch.htmlCode !== undefined) payload.htmlCode = patch.htmlCode || null;

      const res = await updateAdAction(id, payload);
      if (!res.ok) {
        console.error("Ad update failed:", res.error);
      }
    });
  }, []);

  const getAd = useCallback((id: string) => ads.find((a) => a.id === id), [ads]);

  return (
    <AdContext.Provider value={{ ads, updateAd, getAd, saving }}>
      {children}
    </AdContext.Provider>
  );
}

export function useAds() {
  const ctx = useContext(AdContext);
  if (!ctx) throw new Error("useAds must be used inside AdProvider");
  return ctx;
}

export function mapApiAdToUi(api: {
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
}): Ad {
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
