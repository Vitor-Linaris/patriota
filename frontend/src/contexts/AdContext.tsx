"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

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

const DEFAULT_ADS: Ad[] = [
  { id: "homepage-leaderboard", name: "Homepage — Leaderboard topo", page: "Homepage", position: "Topo da página", size: "970×90", sizeLabel: "Leaderboard", type: "empty", enabled: true },
  { id: "homepage-mid", name: "Homepage — Intermédio conteúdo", page: "Homepage", position: "Meio da página", size: "970×60", sizeLabel: "Banner horizontal", type: "empty", enabled: true },
  { id: "homepage-sidebar", name: "Homepage — Sidebar", page: "Homepage", position: "Coluna lateral", size: "300×250", sizeLabel: "Rectangle", type: "empty", enabled: true },
  { id: "homepage-prefooter", name: "Homepage — Pré-rodapé", page: "Homepage", position: "Antes do rodapé", size: "970×90", sizeLabel: "Leaderboard", type: "empty", enabled: true },
  { id: "article-leaderboard", name: "Artigo — Leaderboard topo", page: "Artigo", position: "Topo da página", size: "970×90", sizeLabel: "Leaderboard", type: "empty", enabled: true },
  { id: "article-incontent", name: "Artigo — Dentro do conteúdo", page: "Artigo", position: "Meio do artigo", size: "336×280", sizeLabel: "Rectangle médio", type: "empty", enabled: true },
  { id: "article-sidebar", name: "Artigo — Sidebar", page: "Artigo", position: "Coluna lateral", size: "300×250", sizeLabel: "Rectangle", type: "empty", enabled: true },
  { id: "article-prefooter", name: "Artigo — Pré-rodapé", page: "Artigo", position: "Antes do rodapé", size: "970×90", sizeLabel: "Leaderboard", type: "empty", enabled: true },
  { id: "category-leaderboard", name: "Categoria — Leaderboard topo", page: "Categoria", position: "Topo da página", size: "970×90", sizeLabel: "Leaderboard", type: "empty", enabled: true },
  { id: "category-sidebar", name: "Categoria — Sidebar", page: "Categoria", position: "Coluna lateral", size: "300×250", sizeLabel: "Rectangle", type: "empty", enabled: true },
];

interface AdContextValue {
  ads: Ad[];
  updateAd: (id: string, patch: Partial<Ad>) => void;
  getAd: (id: string) => Ad | undefined;
}

const AdContext = createContext<AdContextValue | null>(null);

const STORAGE_KEY = "patriota_ads";

function load(): Ad[] {
  if (typeof window === "undefined") return DEFAULT_ADS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ADS;
    const saved: Ad[] = JSON.parse(raw);
    return DEFAULT_ADS.map((def) => {
      const found = saved.find((s) => s.id === def.id);
      return found ? { ...def, ...found } : def;
    });
  } catch {
    return DEFAULT_ADS;
  }
}

export function AdProvider({ children }: { children: ReactNode }) {
  const [ads, setAds] = useState<Ad[]>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ads));
    } catch {
      /* ignore */
    }
  }, [ads]);

  const updateAd = (id: string, patch: Partial<Ad>) => {
    setAds((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, ...patch, updatedAt: new Date().toLocaleString("pt-PT") }
          : a,
      ),
    );
  };

  const getAd = (id: string) => ads.find((a) => a.id === id);

  return (
    <AdContext.Provider value={{ ads, updateAd, getAd }}>
      {children}
    </AdContext.Provider>
  );
}

export function useAds() {
  const ctx = useContext(AdContext);
  if (!ctx) throw new Error("useAds must be used inside AdProvider");
  return ctx;
}
