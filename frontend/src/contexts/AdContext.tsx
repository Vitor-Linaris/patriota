"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { updateAdAction } from "@/app/admin/publicidade/actions";
import {
  TYPE_UI_TO_API,
  type Ad,
  type AdType,
} from "@/lib/ads";

// Re-export the shared types so existing imports from this file still
// work (the admin client and other consumers).
export type { Ad, AdType, AdTypeApi } from "@/lib/ads";
export { mapApiAdToUi } from "@/lib/ads";

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
