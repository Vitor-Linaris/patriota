"use client";

import { useState } from "react";
import { AdProvider, useAds, type Ad, type AdType } from "@/contexts/AdContext";

const pageGroups = ["Homepage", "Artigo", "Categoria"];

const typeIcons: Record<AdType, string> = {
  empty: "▣",
  image: "◈",
  html: "</>",
};
const typeColors: Record<AdType, string> = {
  empty: "bg-gray-100 text-gray-400",
  image: "bg-blue-100 text-blue-700",
  html: "bg-purple-100 text-purple-700",
};

function PreviewPanel({ ad }: { ad: Ad }) {
  const isLeaderboard = ad.size.startsWith("970") || ad.size.startsWith("728");
  const isSidebar = ad.size.startsWith("300");
  const heightClass = isLeaderboard ? "h-[72px]" : isSidebar ? "h-[200px]" : "h-[180px]";

  if (ad.type === "html" && ad.htmlCode) {
    return (
      <div
        className={`w-full ${heightClass} overflow-hidden rounded-lg border border-gray-200 bg-white`}
        dangerouslySetInnerHTML={{ __html: ad.htmlCode }}
      />
    );
  }
  if (ad.type === "image" && ad.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ad.imageUrl}
        alt={ad.altText || "Preview"}
        className={`w-full ${heightClass} rounded-lg border border-gray-200 object-cover`}
      />
    );
  }
  return (
    <div
      className={`flex w-full ${heightClass} flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50`}
    >
      <span className="text-2xl text-gray-300">▣</span>
      <span className="text-xs font-semibold text-gray-300">{ad.size}</span>
      <span className="text-[10px] text-gray-200">Sem conteúdo configurado</span>
    </div>
  );
}

function AdsInner() {
  const { ads, updateAd } = useAds();
  const [editing, setEditing] = useState<Ad | null>(null);
  const [editTab, setEditTab] = useState<"image" | "html" | "settings">("image");
  const [draft, setDraft] = useState<Partial<Ad>>({});
  const [saved, setSaved] = useState(false);
  const [filterPage, setFilterPage] = useState<string>("Todos");

  const openEdit = (ad: Ad) => {
    setEditing(ad);
    setDraft({
      type: ad.type,
      enabled: ad.enabled,
      imageUrl: ad.imageUrl ?? "",
      linkUrl: ad.linkUrl ?? "",
      linkTarget: ad.linkTarget ?? "_blank",
      altText: ad.altText ?? "",
      htmlCode: ad.htmlCode ?? "",
    });
    setEditTab(ad.type === "html" ? "html" : "image");
    setSaved(false);
  };

  const handleSave = () => {
    if (!editing) return;
    updateAd(editing.id, draft);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setEditing(null);
    }, 1200);
  };

  const handleToggle = (id: string, enabled: boolean) => {
    updateAd(id, { enabled });
  };

  const filtered =
    filterPage === "Todos" ? ads : ads.filter((a) => a.page === filterPage);

  const stats = {
    total: ads.length,
    active: ads.filter((a) => a.enabled && a.type !== "empty").length,
    empty: ads.filter((a) => a.type === "empty").length,
    disabled: ads.filter((a) => !a.enabled).length,
  };

  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* EDIT MODAL */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-100 px-6 pb-4 pt-6">
              <div>
                <h2 className="text-lg font-black text-[#0F2C6B]">{editing.name}</h2>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {editing.page} · {editing.position}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="font-mono text-xs text-gray-400">
                    {editing.size}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{editing.sizeLabel}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="mt-1 text-xl leading-none text-gray-300 hover:text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-2">
              {/* LEFT: FORM */}
              <div>
                <div className="mb-5 flex rounded-xl bg-gray-100 p-1">
                  {(
                    [
                      { key: "image", label: "Imagem + Link", icon: "◈" },
                      { key: "html", label: "Código / Embed", icon: "</>" },
                      { key: "settings", label: "Opções", icon: "⊙" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setEditTab(t.key)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${editTab === t.key ? "bg-white text-[#0F2C6B] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      <span>{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>

                {editTab === "image" && (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        URL da imagem
                      </label>
                      <input
                        value={draft.imageUrl ?? ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            imageUrl: e.target.value,
                            type: "image" as AdType,
                          }))
                        }
                        placeholder="https://exemplo.com/banner.jpg"
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
                      />
                      <p className="mt-1 text-[10px] text-gray-400">
                        Recomendado: PNG ou JPG, proporção {editing.size}
                      </p>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        URL de destino (clique)
                      </label>
                      <input
                        value={draft.linkUrl ?? ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, linkUrl: e.target.value }))
                        }
                        placeholder="https://anunciante.pt/oferta"
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                          Abrir em
                        </label>
                        <select
                          value={draft.linkTarget ?? "_blank"}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              linkTarget: e.target.value as "_blank" | "_self",
                            }))
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                        >
                          <option value="_blank">Nova janela</option>
                          <option value="_self">Mesma janela</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                          Texto alt (acessibilidade)
                        </label>
                        <input
                          value={draft.altText ?? ""}
                          onChange={(e) =>
                            setDraft((p) => ({ ...p, altText: e.target.value }))
                          }
                          placeholder="Ex: Oferta banco XYZ"
                          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {editTab === "html" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                      <p className="mb-1 text-xs font-bold text-purple-700">
                        Código HTML / Embed
                      </p>
                      <p className="text-[10px] leading-relaxed text-purple-500">
                        Cole aqui o código do Google AdSense, banner HTML
                        personalizado, iframe ou qualquer embed de rede
                        publicitária. O código será renderizado directamente.
                      </p>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        Código HTML / Script
                      </label>
                      <textarea
                        value={draft.htmlCode ?? ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            htmlCode: e.target.value,
                            type: "html" as AdType,
                          }))
                        }
                        placeholder={'<ins class="adsbygoogle"\n  style="display:block"\n  data-ad-client="ca-pub-XXXXX"\n  data-ad-slot="XXXXX"\n  data-ad-format="auto">\n</ins>'}
                        rows={10}
                        className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-xs focus:border-[#0F2C6B] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-0.5 text-[10px] text-gray-400">
                      <p>• Google AdSense: copie o bloco &lt;ins&gt; do painel AdSense</p>
                      <p>• Taboola / Outbrain: cole o script de widget</p>
                      <p>• HTML personalizado: imagem + link em HTML puro</p>
                    </div>
                  </div>
                )}

                {editTab === "settings" && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
                      <div>
                        <p className="text-sm font-bold text-gray-800">
                          Anúncio activo
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          Se desactivado, o espaço não é mostrado ao leitor.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({ ...p, enabled: !p.enabled }))
                        }
                        className={`relative h-6 w-12 rounded-full transition-colors ${draft.enabled ? "bg-[#0F2C6B]" : "bg-gray-200"}`}
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${draft.enabled ? "translate-x-7" : "translate-x-1"}`}
                        />
                      </button>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        Tipo de conteúdo
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["empty", "image", "html"] as AdType[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setDraft((p) => ({ ...p, type: t }))}
                            className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-xs font-bold transition-all ${draft.type === t ? "border-[#0F2C6B] bg-[#0F2C6B]/5 text-[#0F2C6B]" : "border-gray-100 text-gray-400 hover:border-gray-200"}`}
                          >
                            <span className="text-base">{typeIcons[t]}</span>
                            {t === "empty" ? "Vazio" : t === "image" ? "Imagem" : "Código"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {editing.updatedAt && (
                      <p className="text-xs text-gray-400">
                        Última edição: {editing.updatedAt}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT: PREVIEW */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                  Pré-visualização
                </p>
                <PreviewPanel ad={{ ...editing, ...draft } as Ad} />
                <div className="mt-4 space-y-1.5 rounded-xl bg-[#F7F8FA] p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-400">Espaço</span>
                    <span className="text-gray-600">{editing.sizeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-400">Dimensões</span>
                    <span className="font-mono text-gray-600">
                      {editing.size} px
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-400">Página</span>
                    <span className="text-gray-600">{editing.page}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-400">Posição</span>
                    <span className="text-gray-600">{editing.position}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="flex items-center justify-between rounded-b-2xl border-t border-gray-100 bg-[#F7F8FA] px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  updateAd(editing.id, {
                    type: "empty",
                    imageUrl: "",
                    htmlCode: "",
                    linkUrl: "",
                  });
                  setEditing(null);
                }}
                className="text-xs font-semibold text-gray-400 transition-colors hover:text-red-500"
              >
                Limpar anúncio
              </button>
              <div className="flex items-center gap-3">
                {saved && (
                  <span className="text-sm font-semibold text-green-600">
                    ✓ Guardado!
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-lg bg-[#0F2C6B] px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
                >
                  Guardar anúncio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAGE HEADER */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">
            Gestão de Publicidade
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {stats.total} espaços publicitários · {stats.active} activos ·{" "}
            {stats.empty} por configurar
          </p>
        </div>
      </div>

      {/* STATS */}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Total de espaços", value: stats.total, color: "text-[#0F2C6B]", bg: "bg-white border-gray-100" },
          { label: "Com anúncio activo", value: stats.active, color: "text-green-600", bg: "bg-green-50 border-green-100" },
          { label: "Por configurar", value: stats.empty, color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
          { label: "Desactivados", value: stats.disabled, color: "text-gray-400", bg: "bg-gray-50 border-gray-100" },
        ].map((s) => (
          <div
            key={s.label}
            className={`flex items-center gap-3 rounded-xl border p-4 ${s.bg}`}
          >
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs font-semibold leading-snug text-gray-500">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="mb-5 flex items-center gap-2">
        {["Todos", ...pageGroups].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilterPage(p)}
            className={`rounded-xl border px-4 py-2 text-xs font-bold transition-all ${filterPage === p ? "border-[#0F2C6B] bg-[#0F2C6B] text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-400"}`}
          >
            {p}
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] ${filterPage === p ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}
            >
              {p === "Todos"
                ? ads.length
                : ads.filter((a) => a.page === p).length}
            </span>
          </button>
        ))}
      </div>

      {/* SLOTS GRID */}
      <div className="space-y-8">
        {(filterPage === "Todos" ? pageGroups : [filterPage]).map((page) => {
          const slots = filtered.filter((a) => a.page === page);
          if (slots.length === 0) return null;
          return (
            <div key={page}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-[#0F2C6B]">
                <span className="inline-block h-0.5 w-5 bg-[#FFCC66]" />
                {page}
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {slots.map((ad) => (
                  <div
                    key={ad.id}
                    className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${!ad.enabled ? "opacity-60" : ""}`}
                  >
                    <div className="border-b border-gray-50 bg-gray-50/50 p-3">
                      <PreviewPanel ad={ad} />
                    </div>

                    <div className="p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold leading-snug text-gray-800">
                            {ad.name}
                          </p>
                          <p className="mt-0.5 text-[10px] text-gray-400">
                            {ad.position} ·{" "}
                            <span className="font-mono">{ad.size}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggle(ad.id, !ad.enabled)}
                          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${ad.enabled ? "bg-[#0F2C6B]" : "bg-gray-200"}`}
                          title={ad.enabled ? "Desactivar" : "Activar"}
                        >
                          <span
                            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${ad.enabled ? "translate-x-4" : "translate-x-0.5"}`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${typeColors[ad.type]}`}
                        >
                          <span>{typeIcons[ad.type]}</span>
                          {ad.type === "empty"
                            ? "Sem conteúdo"
                            : ad.type === "image"
                              ? "Imagem"
                              : "Código HTML"}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEdit(ad)}
                          className="rounded-lg border border-[#0F2C6B]/20 px-3 py-1.5 text-xs font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5"
                        >
                          {ad.type === "empty" ? "Configurar" : "Editar"}
                        </button>
                      </div>

                      {ad.updatedAt && (
                        <p className="mt-2 text-[9px] text-gray-300">
                          Actualizado em {ad.updatedAt}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* INSTRUCTIONS */}
      <div className="mt-8 grid gap-5 rounded-2xl bg-[#0F2C6B] p-6 md:grid-cols-3">
        <div>
          <div className="mb-1.5 text-sm font-black text-[#FFCC66]">
            ◈ Imagem + Link
          </div>
          <p className="text-xs leading-relaxed text-white/60">
            Cole o URL de uma imagem (PNG/JPG/GIF) e o link de destino. Ideal
            para banners simples, patrocinadores e campanhas directas.
          </p>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-black text-[#FFCC66]">
            &lt;/&gt; Código HTML / Embed
          </div>
          <p className="text-xs leading-relaxed text-white/60">
            Cole o código do Google AdSense, Taboola, Outbrain, ou qualquer rede
            publicitária. Suporta JavaScript e iframes.
          </p>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-black text-[#FFCC66]">
            ⊙ Activar / Desactivar
          </div>
          <p className="text-xs leading-relaxed text-white/60">
            Cada espaço pode ser ligado ou desligado individualmente sem perder
            a configuração. As alterações são aplicadas imediatamente.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function AdminAdsClient({
  initialAds,
}: {
  initialAds: Ad[];
}) {
  return (
    <AdProvider initialAds={initialAds}>
      <AdsInner />
    </AdProvider>
  );
}
