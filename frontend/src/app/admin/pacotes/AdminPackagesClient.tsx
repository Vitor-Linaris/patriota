"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CoverImagePicker } from "@/components/admin/CoverImagePicker";
import { imageVariant } from "@/lib/images";
import { adminMediaUrl } from "@/lib/media-preview";
import { ArticlePicker } from "./ArticlePicker";
import type { CategoryOption } from "@/lib/category-options";
import {
  centsToEuros,
  eurosToCents,
  formatPrice,
  moveItem,
  slugPreview,
} from "./package-utils";
import {
  ARTICLE_STATUS_LABEL,
  type AdminPackage,
  type AdminPackageDetail,
  type PackageMember,
  type PackagePermissions,
  type PackagePurchaseRow,
} from "./types";
import {
  createPackageAction,
  deletePackageAction,
  makeMembersExclusiveAction,
  publishPackageAction,
  publishPendingArticlesAction,
  revokePurchaseAction,
  setPackageArticlesAction,
  unpublishPackageAction,
  updatePackageAction,
} from "./actions";

interface EditorState {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  coverImageUrl: string;
  priceEuros: string;
  includedInSubscription: boolean;
  /** Ordered, and the order the storefront lists in. */
  members: PackageMember[];
  status: AdminPackage["status"];
  stripePriceId: string | null;
  purchaseCount: number;
}

const EMPTY: EditorState = {
  id: null,
  name: "",
  slug: "",
  description: "",
  coverImageUrl: "",
  priceEuros: "",
  includedInSubscription: true,
  members: [],
  status: "RASCUNHO",
  stripePriceId: null,
  purchaseCount: 0,
};

const DRAFT_STATUSES = ["RASCUNHO", "EM_REVISAO"] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminPackagesClient({
  initialPackages,
  initialPurchases,
  categories,
  can,
}: {
  initialPackages: AdminPackage[];
  initialPurchases: PackagePurchaseRow[];
  /** The whole forest, flattened, for the picker's category filter. */
  categories: CategoryOption[];
  can: PackagePermissions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"pacotes" | "compras">("pacotes");
  const [editorOpen, setEditorOpen] = useState(false);
  /** JSON of the form as opened; null when the editor is closed. */
  const [baseline, setBaseline] = useState<string | null>(null);
  const [form, setForm] = useState<EditorState>(EMPTY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (patch: Partial<EditorState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const drafts = form.members.filter((m) =>
    (DRAFT_STATUSES as readonly string[]).includes(m.article.status),
  );
  const liveAndFree = form.members.filter(
    (m) => m.article.status === "PUBLICADO" && !m.article.exclusive,
  );

  /**
   * What publishing is about to do, in words, before the click.
   *
   * Publishing closes EVERY article in the pacote, including ones that
   * are live and free today — a pacote whose articles stay readable at
   * their own URLs is a pacote nobody needs to buy. That is a real
   * consequence for readers who already have those links, so it is
   * named here rather than discovered afterwards.
   */
  const publishConfirmText = () => {
    const price =
      eurosToCents(form.priceEuros) !== null
        ? formatPrice(eurosToCents(form.priceEuros)!)
        : "—";
    const steps: string[] = [];
    if (drafts.length > 0) {
      steps.push(`publicar ${drafts.length} artigo(s) em rascunho`);
    }
    if (liveAndFree.length > 0) {
      steps.push(
        `FECHAR ${liveAndFree.length} artigo(s) que hoje qualquer pessoa lê`,
      );
    }
    const what = steps.length > 0 ? `Vai ${steps.join(" e ")}, e ` : "Vai ";
    return `${what}pôr o pacote à venda por ${price}. Continuar?`;
  };

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setForm(EMPTY);
    setError(null);
    setNotice(null);
    setBaseline(null);
  }, []);

  /**
   * The form exactly as it was opened, serialised.
   *
   * Comparing against it is what tells a stray click on the backdrop
   * apart from one that throws away twenty minutes of typing. Without
   * it, "click outside to close" is a good shortcut attached to a way
   * of losing work silently.
   */
  const dirty = baseline !== null && JSON.stringify(form) !== baseline;

  /**
   * Every way out of the editor except Guardar goes through here:
   * Cancelar, Esc, and a click on the dark area around the panel.
   *
   * A pacote editor is a long form — name, description, cover, price,
   * and a list of articles picked one at a time — so the confirmation
   * is not ceremony. It only appears when something actually changed:
   * opening a pacote to look at it and clicking away closes instantly,
   * which is the common case and the one the shortcut is for.
   */
  const requestCloseEditor = useCallback(() => {
    if (pending) return;
    if (
      dirty &&
      !window.confirm(
        "Tem alterações por guardar neste pacote. Fechar e perdê-las?",
      )
    ) {
      return;
    }
    closeEditor();
  }, [closeEditor, dirty, pending]);

  // Esc closes it, the same way it closes every other panel on the site.
  //
  // …unless something is stacked on top. The article picker and the media
  // library both sit above this panel and neither had an Esc of its own,
  // so without the check a single Esc meant to dismiss the picker would
  // close the editor underneath it as well. `data-modal-top` is how a
  // dialog declares it is the one on top; the two that stack above this
  // one carry it.
  useEffect(() => {
    if (!editorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-modal-top]")) return;
      requestCloseEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorOpen, requestCloseEditor]);

  /** Reloads one pacote's full detail (members carry current status). */
  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/packages/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AdminPackageDetail;
  }, []);

  const openEditor = useCallback(
    async (pkg?: AdminPackage) => {
      setError(null);
      setNotice(null);
      if (!pkg) {
        setForm(EMPTY);
        setBaseline(JSON.stringify(EMPTY));
        setEditorOpen(true);
        return;
      }
      const detail = await loadDetail(pkg.id);
      const opened = {
        id: pkg.id,
        name: pkg.name,
        slug: pkg.slug,
        description: pkg.description,
        coverImageUrl: pkg.coverImageUrl ?? "",
        priceEuros: pkg.priceCents ? centsToEuros(pkg.priceCents) : "",
        includedInSubscription: pkg.includedInSubscription,
        members: detail?.items ?? [],
        status: pkg.status,
        stripePriceId: pkg.stripePriceId,
        purchaseCount: pkg._count.purchases,
      };
      setForm(opened);
      setBaseline(JSON.stringify(opened));
      setEditorOpen(true);
    },
    [loadDetail],
  );

  const save = () => {
    setError(null);
    const priceCents = eurosToCents(form.priceEuros);
    if (form.priceEuros.trim() && priceCents === null) {
      setError('Preço inválido. Use um valor como "9,99".');
      return;
    }
    if (!form.name.trim()) {
      setError("Dê um nome ao pacote.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
      description: form.description,
      coverImageUrl: form.coverImageUrl,
      ...(priceCents !== null ? { priceCents } : {}),
      includedInSubscription: form.includedInSubscription,
    };

    startTransition(async () => {
      const res = form.id
        ? await updatePackageAction(form.id, payload)
        : await createPackageAction(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const id = form.id ?? ("id" in res ? (res.id as string) : null);
      if (id) {
        // The article list is a separate endpoint, and on a brand-new
        // pacote it can only be written once the row exists.
        const articles = await setPackageArticlesAction(
          id,
          form.members.map((m) => m.article.id),
        );
        if (!articles.ok) {
          setError(articles.error);
          return;
        }
      }
      closeEditor();
      router.refresh();
    });
  };

  const runOnPackage = (
    label: string,
    fn: (id: string) => Promise<{ ok: boolean; error?: string }>,
    confirmText?: string,
  ) => {
    if (!form.id) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn(form.id!);
      if (!res.ok) {
        setError(res.error ?? `Falha: ${label}`);
        return;
      }
      const detail = await loadDetail(form.id!);
      if (detail) {
        const fromServer = {
          members: detail.items,
          status: detail.status,
          stripePriceId: detail.stripePriceId,
        };
        set(fromServer);
        // The baseline moves by the SAME delta, because these values
        // came back from the server and are therefore already saved.
        // Without this, publishing a pacote and then clicking outside
        // would ask "tem alterações por guardar?" about changes the
        // server made — and a confirmation that cries wolf is a
        // confirmation people learn to click through.
        //
        // Applying the delta rather than re-snapshotting the whole form
        // keeps any genuine unsaved edit still counted as unsaved.
        setBaseline((b) =>
          b === null
            ? b
            : JSON.stringify({
                ...(JSON.parse(b) as EditorState),
                ...fromServer,
              }),
        );
      }
      setNotice(label);
      router.refresh();
    });
  };

  return (
    <main className="bg-[#f6f7fb] p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">
            Pacotes exclusivos
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-slate-500">
            Conjuntos de artigos vendidos numa compra única. Junte os
            artigos ainda em rascunho e publique o pacote: os artigos são
            publicados e ficam exclusivos de uma só vez.
          </p>
        </div>
        {can.create && (
          <button
            type="button"
            onClick={() => void openEditor()}
            className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-800"
          >
            Novo pacote
          </button>
        )}
      </div>

      {can.seePurchases && (
        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {(["pacotes", "compras"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-semibold transition ${
                tab === t
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "pacotes" ? "Pacotes" : "Compras"}
            </button>
          ))}
        </div>
      )}

      {tab === "pacotes" ? (
        <PackageList
          packages={initialPackages}
          onOpen={(p) => void openEditor(p)}
        />
      ) : (
        <PurchaseList
          purchases={initialPurchases}
          canRevoke={can.revoke}
          pending={pending}
          onRevoke={(id) => {
            if (
              !window.confirm(
                "Revogar esta compra retira o acesso aos artigos. Use apenas depois de um reembolso. Continuar?",
              )
            )
              return;
            startTransition(async () => {
              const res = await revokePurchaseAction(id);
              if (!res.ok) window.alert(res.error);
              router.refresh();
            });
          }}
        />
      )}

      {editorOpen && (
        <div
          /*
            `e.target === e.currentTarget` rather than stopPropagation on
            the panel: this fires only for a click that landed on the dark
            area itself, and it leaves every event inside the panel to
            behave normally — a select, a drag over a text field, a click
            that starts inside and ends out here.
          */
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) requestCloseEditor();
          }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-b border-slate-200 bg-white px-6 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-bold text-slate-900">
                  {form.id ? form.name || "Pacote" : "Novo pacote"}
                </h2>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span
                    className={`rounded px-1.5 py-0.5 font-semibold ring-1 ${
                      form.status === "PUBLICADO"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-amber-50 text-amber-700 ring-amber-200"
                    }`}
                  >
                    {form.status === "PUBLICADO" ? "À venda" : "Rascunho"}
                  </span>
                  {form.purchaseCount > 0 && (
                    <span className="text-slate-500">
                      {form.purchaseCount} compra(s)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={requestCloseEditor}
                  disabled={pending}
                  className="rounded px-3 py-1.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                {can.edit && (
                  <button
                    type="button"
                    onClick={save}
                    disabled={pending}
                    className="rounded-md bg-slate-900 px-4 py-1.5 text-[13px] font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {pending ? "A guardar…" : "Guardar"}
                  </button>
                )}
              </div>
            </div>

            {error && (
              <p className="border-b border-red-100 bg-red-50 px-6 py-2 text-[13px] text-red-700">
                {error}
              </p>
            )}
            {notice && !error && (
              <p className="border-b border-emerald-100 bg-emerald-50 px-6 py-2 text-[13px] text-emerald-800">
                {notice}
              </p>
            )}

            <div className="flex flex-col gap-5 px-6 py-5">
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">
                  Nome
                </span>
                <input
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500"
                  placeholder="Dossiê Habitação 2026"
                />
                {!form.id && form.name && (
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Endereço: /pacotes/{slugPreview(form.name)}
                  </span>
                )}
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">
                  Descrição
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) => set({ description: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500"
                  placeholder="O que o leitor recebe ao comprar este pacote."
                />
              </label>

              <div>
                <span className="text-[12px] font-semibold text-slate-700">
                  Capa
                </span>
                <div className="mt-1">
                  <CoverImagePicker
                    value={form.coverImageUrl}
                    onChange={(url) => set({ coverImageUrl: url })}
                    purpose="EDITORIAL"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700">
                    Preço (IVA incluído)
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      value={form.priceEuros}
                      onChange={(e) => set({ priceEuros: e.target.value })}
                      inputMode="decimal"
                      placeholder="9,99"
                      className="w-28 rounded-md border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500"
                    />
                    <span className="text-[13px] text-slate-500">€</span>
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Mínimo 1,00 €. Alterar o preço cria um preço novo no
                    Stripe; quem já tinha o checkout aberto paga o valor
                    que viu.
                  </span>
                </label>

                <label className="flex cursor-pointer flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.includedInSubscription}
                      onChange={(e) =>
                        set({ includedInSubscription: e.target.checked })
                      }
                      className="h-4 w-4"
                    />
                    <span className="text-[12px] font-semibold text-slate-800">
                      Incluído na assinatura
                    </span>
                  </span>
                  <span className="mt-1.5 text-[11px] leading-snug text-slate-600">
                    Ligado: os assinantes PREMIUM lêem estes artigos sem
                    comprar. Desligado: mesmo os assinantes têm de comprar
                    este pacote.
                  </span>
                </label>
              </div>

              {/* ── artigos ─────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-slate-700">
                    Artigos ({form.members.length})
                  </span>
                  {can.edit && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Escolher artigos
                    </button>
                  )}
                </div>

                {form.status === "PUBLICADO" && form.purchaseCount > 0 && (
                  <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600">
                    {form.purchaseCount} pessoa(s) já compraram este pacote.
                    Continuam a ler o que compraram, aconteça o que
                    acontecer a esta lista — mas <strong>não recebem</strong>{" "}
                    artigos acrescentados agora. Feche o pacote antes de o
                    publicar.
                  </p>
                )}

                {drafts.length > 0 && (
                  <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
                    {drafts.length} artigo(s) em rascunho.{" "}
                    {form.status === "PUBLICADO" ? (
                      <>
                        Os compradores ainda não os vêem.
                        {can.publish && (
                          <>
                            {" "}
                            <button
                              type="button"
                              disabled={pending || !can.publishArticles}
                              onClick={() =>
                                runOnPackage(
                                  "Artigos pendentes publicados.",
                                  publishPendingArticlesAction,
                                )
                              }
                              className="font-bold underline disabled:no-underline disabled:opacity-60"
                            >
                              Publicar artigos pendentes
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      "Serão publicados e tornados exclusivos quando publicar o pacote."
                    )}
                  </p>
                )}

                {liveAndFree.length > 0 && (
                  <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
                    {liveAndFree.length} artigo(s) já publicados e{" "}
                    <strong>livres</strong>: hoje qualquer pessoa os lê.
                    Publicar o pacote <strong>fecha-os</strong> — deixam de
                    estar acessíveis a quem não pagar. Pode fechá-los já:
                    {can.edit && (
                      <>
                        {" "}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            runOnPackage(
                              "Artigos tornados exclusivos.",
                              makeMembersExclusiveAction,
                              `Tornar exclusivos ${liveAndFree.length} artigo(s) já publicados? Deixam de ser legíveis por quem não paga.`,
                            )
                          }
                          className="font-bold underline disabled:no-underline disabled:opacity-60"
                        >
                          Tornar exclusivos ({liveAndFree.length})
                        </button>
                      </>
                    )}
                  </p>
                )}

                <ul className="mt-2 flex flex-col gap-1">
                  {form.members.map((m, i) => {
                    const thumb = m.article.coverImageUrl
                      ? adminMediaUrl(
                          imageVariant(m.article.coverImageUrl, "small"),
                        )
                      : null;
                    return (
                      <li
                        key={m.article.id}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5"
                      >
                        <span className="w-5 shrink-0 text-center text-[11px] font-bold text-slate-400">
                          {i + 1}
                        </span>
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            className="h-8 w-12 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="h-8 w-12 shrink-0 rounded bg-slate-100" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-slate-900">
                            {m.article.title}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {ARTICLE_STATUS_LABEL[m.article.status]}
                            {m.article.exclusive ? " · exclusivo" : " · livre"}
                          </span>
                        </span>
                        {can.edit && (
                          <span className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              aria-label="Subir"
                              disabled={i === 0}
                              onClick={() =>
                                set({ members: moveItem(form.members, i, -1) })
                              }
                              className="rounded px-1.5 py-0.5 text-[13px] text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label="Descer"
                              disabled={i === form.members.length - 1}
                              onClick={() =>
                                set({ members: moveItem(form.members, i, 1) })
                              }
                              className="rounded px-1.5 py-0.5 text-[13px] text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              aria-label="Remover do pacote"
                              onClick={() =>
                                set({
                                  members: form.members.filter(
                                    (x) => x.article.id !== m.article.id,
                                  ),
                                })
                              }
                              className="rounded px-1.5 py-0.5 text-[13px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              ×
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {form.members.length === 0 && (
                  <p className="mt-2 rounded border border-dashed border-slate-300 px-3 py-6 text-center text-[12px] text-slate-500">
                    Ainda sem artigos. Escreva as peças, deixe-as em
                    rascunho, e escolha-as aqui.
                  </p>
                )}
              </div>

              {/* ── publicar ────────────────────────────────────────── */}
              {form.id && can.publish && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[12px] font-semibold text-slate-800">
                    {form.status === "PUBLICADO"
                      ? "Este pacote está à venda"
                      : "Pôr à venda"}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-600">
                    {form.status === "PUBLICADO" ? (
                      <>
                        Preço no Stripe:{" "}
                        {form.stripePriceId ? (
                          <code className="text-[10px]">
                            {form.stripePriceId}
                          </code>
                        ) : (
                          "pagamentos não configurados neste servidor"
                        )}
                        .
                      </>
                    ) : (
                      <>
                        Publicar cria o produto e o preço no Stripe
                        {drafts.length > 0
                          ? ` e publica ${drafts.length} artigo(s) em rascunho, tornando-os exclusivos.`
                          : "."}
                      </>
                    )}
                  </p>
                  {drafts.length > 0 && !can.publishArticles && (
                    <p className="mt-2 text-[11px] font-semibold text-red-700">
                      Não tem permissão para publicar artigos
                      (<code>artigos.publicar</code>), por isso não pode
                      publicar um pacote com rascunhos. Peça a publicação
                      por revisão.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.status === "PUBLICADO" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          runOnPackage(
                            "Pacote retirado de venda.",
                            unpublishPackageAction,
                            "Retirar este pacote de venda? Os artigos continuam publicados e exclusivos, e quem já comprou mantém o acesso.",
                          )
                        }
                        className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Retirar de venda
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          pending ||
                          (drafts.length > 0 && !can.publishArticles)
                        }
                        onClick={() =>
                          runOnPackage(
                            "Pacote publicado.",
                            publishPackageAction,
                            publishConfirmText(),
                          )
                        }
                        className="rounded-md bg-emerald-700 px-4 py-1.5 text-[13px] font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        Publicar pacote
                      </button>
                    )}
                    {can.remove && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          runOnPackage(
                            "Pacote eliminado.",
                            async (id) => {
                              const r = await deletePackageAction(id);
                              if (r.ok) closeEditor();
                              return r;
                            },
                            "Eliminar este pacote? Só é possível se ninguém o tiver comprado.",
                          )
                        }
                        className="ml-auto rounded-md px-3 py-1.5 text-[13px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {pickerOpen && (
        <ArticlePicker
          categories={categories}
          selectedIds={form.members.map((m) => m.article.id)}
          onChange={(ids) => {
            // Keep what is already known about members that survive, and
            // stub in anything newly ticked. The real status/exclusive
            // values arrive on the next detail load; until then the row
            // shows what the picker knew.
            const known = new Map(
              form.members.map((m) => [m.article.id, m] as const),
            );
            set({
              members: ids.map((id, index) => {
                const existing = known.get(id);
                if (existing) return { ...existing, position: index };
                return {
                  position: index,
                  article: {
                    id,
                    slug: "",
                    title: "(artigo escolhido)",
                    status: "RASCUNHO",
                    exclusive: false,
                    coverImageUrl: null,
                    publishedAt: null,
                    category: { name: "" },
                  },
                };
              }),
            });
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </main>
  );
}

function PackageList({
  packages,
  onOpen,
}: {
  packages: AdminPackage[];
  onOpen: (p: AdminPackage) => void;
}) {
  if (packages.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-[13px] text-slate-500">
        Ainda não há pacotes. Crie um, junte artigos (mesmo em rascunho) e
        publique-o.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-semibold">Pacote</th>
            <th className="px-4 py-2 font-semibold">Estado</th>
            <th className="px-4 py-2 font-semibold">Preço</th>
            <th className="px-4 py-2 font-semibold">Artigos</th>
            <th className="px-4 py-2 font-semibold">Compras</th>
            <th className="px-4 py-2 font-semibold">Publicado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {packages.map((p) => (
            <tr
              key={p.id}
              onClick={() => onOpen(p)}
              className="cursor-pointer text-[13px] hover:bg-slate-50"
            >
              <td className="px-4 py-2.5">
                <span className="block font-semibold text-slate-900">
                  {p.name}
                </span>
                <span className="text-[11px] text-slate-500">/{p.slug}</span>
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${
                    p.status === "PUBLICADO"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200"
                  }`}
                >
                  {p.status === "PUBLICADO" ? "À venda" : "Rascunho"}
                </span>
                {!p.includedInSubscription && (
                  <span className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
                    fora da assinatura
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-slate-700">
                {p.priceCents ? formatPrice(p.priceCents, p.currency) : "—"}
              </td>
              <td className="px-4 py-2.5 text-slate-700">{p._count.items}</td>
              <td className="px-4 py-2.5 text-slate-700">
                {p._count.purchases}
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                {fmtDate(p.publishedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseList({
  purchases,
  canRevoke,
  pending,
  onRevoke,
}: {
  purchases: PackagePurchaseRow[];
  canRevoke: boolean;
  pending: boolean;
  onRevoke: (id: string) => void;
}) {
  if (purchases.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-[13px] text-slate-500">
        Ainda não há compras.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-semibold">Leitor</th>
            <th className="px-4 py-2 font-semibold">Pacote</th>
            <th className="px-4 py-2 font-semibold">Estado</th>
            <th className="px-4 py-2 font-semibold">Valor</th>
            <th className="px-4 py-2 font-semibold">Artigos</th>
            <th className="px-4 py-2 font-semibold">Data</th>
            {canRevoke && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {purchases.map((p) => (
            <tr key={p.id} className="text-[13px]">
              <td className="px-4 py-2.5">
                {/* The backend omits name and email for a role that holds
                    pacotes.ver_compras without leitores.ver. Show the row
                    without inventing an identity for it. */}
                {p.reader.email ? (
                  <>
                    <span className="block font-semibold text-slate-900">
                      {p.reader.name ?? "—"}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {p.reader.email}
                    </span>
                  </>
                ) : (
                  <span
                    className="text-[11px] text-slate-400"
                    title="Precisa da permissão leitores.ver para ver quem comprou."
                  >
                    leitor #{p.reader.id.slice(0, 8)}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-slate-700">{p.package.name}</td>
              <td className="px-4 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${
                    p.status === "PAGO"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : p.status === "REEMBOLSADO"
                        ? "bg-red-50 text-red-700 ring-red-200"
                        : "bg-slate-100 text-slate-600 ring-slate-200"
                  }`}
                >
                  {p.status}
                </span>
                {p.source === "MANUAL" && (
                  <span className="ml-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200">
                    oferta
                  </span>
                )}
                {/* A reversal that did NOT revoke — a partial refund, or a
                    dispute still open. The status alone stays PAGO, which
                    is why this used to look like an ordinary paid row and
                    the operator had no way to know a decision was due. */}
                {p.disputedAt && p.status !== "REEMBOLSADO" && (
                  <span className="ml-1 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-orange-200">
                    disputa
                  </span>
                )}
                {p.refundedAt && p.status !== "REEMBOLSADO" && (
                  <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    reembolso parcial
                    {p.refundedAmountCents != null &&
                      ` (${formatPrice(p.refundedAmountCents, p.currency)})`}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-slate-700">
                {formatPrice(p.amountCents, p.currency)}
              </td>
              <td className="px-4 py-2.5 text-slate-700">{p._count.items}</td>
              <td className="px-4 py-2.5 text-slate-500">
                {fmtDate(p.paidAt ?? p.createdAt)}
              </td>
              {canRevoke && (
                <td className="px-4 py-2.5 text-right">
                  {p.status === "PAGO" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onRevoke(p.id)}
                      className="rounded px-2 py-1 text-[12px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Revogar
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
