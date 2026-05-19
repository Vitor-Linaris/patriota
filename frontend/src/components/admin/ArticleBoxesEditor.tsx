"use client";

import { useState } from "react";

/**
 * Editor for the three "structured boxes" that can decorate an article
 * in addition to the main body:
 *
 *   • Essencial — yellow bordered list of key bullet points
 *   • Contexto — up to 4 labelled columns ("O que aconteceu", "Porque
 *     importa", "Próximo passo", …) of short text
 *   • Citação destacada — pull-quote with `quote` + `cite`
 *
 * The fields are already persisted on Article (Phase N) and already
 * render on the public /artigo/[slug] page. This component just
 * provides admin UI to populate them. Validation matches the backend
 * DTOs (class-validator @ArrayMaxSize / @Length).
 */

export interface ContextColumn {
  label: string;
  body: string;
}

export interface ArticleContextBoxes {
  essentials: string[];
  context: { columns: ContextColumn[] } | null;
  pullQuote: { quote: string; cite: string } | null;
}

const ESSENTIAL_MAX_ITEMS = 8;
const ESSENTIAL_MAX_LEN = 200;
const CONTEXT_MAX_COLUMNS = 4;
const CONTEXT_LABEL_MAX = 60;
const CONTEXT_BODY_MAX = 280;
const PULL_QUOTE_MAX = 500;
const PULL_CITE_MAX = 120;

export function ArticleBoxesEditor({
  value,
  onChange,
}: {
  value: ArticleContextBoxes;
  onChange: (next: ArticleContextBoxes) => void;
}) {
  const [essentialDraft, setEssentialDraft] = useState("");

  const setEssentials = (next: string[]) =>
    onChange({ ...value, essentials: next });
  const setContext = (next: ArticleContextBoxes["context"]) =>
    onChange({ ...value, context: next });
  const setPullQuote = (next: ArticleContextBoxes["pullQuote"]) =>
    onChange({ ...value, pullQuote: next });

  const addEssential = () => {
    const t = essentialDraft.trim();
    if (!t) return;
    if (value.essentials.length >= ESSENTIAL_MAX_ITEMS) return;
    if (value.essentials.includes(t)) return;
    setEssentials([...value.essentials, t.slice(0, ESSENTIAL_MAX_LEN)]);
    setEssentialDraft("");
  };

  const columns = value.context?.columns ?? [];
  const updateColumn = (idx: number, patch: Partial<ContextColumn>) => {
    const next = columns.map((c, i) =>
      i === idx
        ? {
            label: (patch.label ?? c.label).slice(0, CONTEXT_LABEL_MAX),
            body: (patch.body ?? c.body).slice(0, CONTEXT_BODY_MAX),
          }
        : c,
    );
    setContext(next.length > 0 ? { columns: next } : null);
  };
  const addColumn = () => {
    if (columns.length >= CONTEXT_MAX_COLUMNS) return;
    setContext({
      columns: [...columns, { label: "", body: "" }],
    });
  };
  const removeColumn = (idx: number) => {
    const next = columns.filter((_, i) => i !== idx);
    setContext(next.length > 0 ? { columns: next } : null);
  };

  return (
    <div className="space-y-3">
      {/* ── Essencial ─────────────────────────────────────────── */}
      <details
        open={value.essentials.length > 0}
        className="rounded-xl border border-gray-200 bg-white"
      >
        <summary className="cursor-pointer select-none px-5 py-3 text-xs font-black uppercase tracking-wider text-gray-500">
          Essencial
          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            {value.essentials.length}
          </span>
        </summary>
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="mb-3 text-[11px] text-gray-500">
            Lista curta de pontos-chave que aparecem numa caixa amarela
            no início do artigo. Máximo {ESSENTIAL_MAX_ITEMS} itens.
          </p>
          <ul className="mb-3 space-y-1.5">
            {value.essentials.map((item, i) => (
              <li
                key={`${i}-${item}`}
                className="flex items-start gap-2 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2"
              >
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="flex-1 text-sm text-slate-800">{item}</span>
                <button
                  type="button"
                  onClick={() =>
                    setEssentials(value.essentials.filter((_, x) => x !== i))
                  }
                  className="text-xs text-amber-600 hover:text-amber-800"
                  aria-label="Remover"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {value.essentials.length < ESSENTIAL_MAX_ITEMS && (
            <div className="flex gap-2">
              <input
                value={essentialDraft}
                onChange={(e) => setEssentialDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEssential();
                  }
                }}
                maxLength={ESSENTIAL_MAX_LEN}
                placeholder="Ex.: Despesa pública aumenta 3,2% face a 2025"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
              />
              <button
                type="button"
                onClick={addEssential}
                className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600"
              >
                + Adicionar
              </button>
            </div>
          )}
        </div>
      </details>

      {/* ── Contexto ──────────────────────────────────────────── */}
      <details
        open={columns.length > 0}
        className="rounded-xl border border-gray-200 bg-white"
      >
        <summary className="cursor-pointer select-none px-5 py-3 text-xs font-black uppercase tracking-wider text-gray-500">
          Contexto
          <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
            {columns.length}/{CONTEXT_MAX_COLUMNS}
          </span>
        </summary>
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="mb-3 text-[11px] text-gray-500">
            Até {CONTEXT_MAX_COLUMNS} colunas curtas (ex.: &ldquo;O que
            aconteceu&rdquo;, &ldquo;Porque importa&rdquo;,
            &ldquo;Próximo passo&rdquo;).
          </p>
          {columns.length === 0 && (
            <p className="mb-3 text-sm italic text-gray-400">
              Sem colunas de contexto.
            </p>
          )}
          <div className="space-y-3">
            {columns.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-100 bg-slate-50 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={c.label}
                    onChange={(e) => updateColumn(i, { label: e.target.value })}
                    maxLength={CONTEXT_LABEL_MAX}
                    placeholder="Título da coluna"
                    className="flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-[#0F2C6B] focus:border-[#0F2C6B] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeColumn(i)}
                    className="rounded-md border border-red-100 px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </div>
                <textarea
                  value={c.body}
                  onChange={(e) => updateColumn(i, { body: e.target.value })}
                  maxLength={CONTEXT_BODY_MAX}
                  rows={2}
                  placeholder="Texto curto…"
                  className="w-full resize-none rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                />
                <p className="mt-1 text-right text-[10px] text-gray-300">
                  {c.body.length}/{CONTEXT_BODY_MAX}
                </p>
              </div>
            ))}
          </div>
          {columns.length < CONTEXT_MAX_COLUMNS && (
            <button
              type="button"
              onClick={addColumn}
              className="mt-3 rounded-lg border border-[#0F2C6B]/20 px-4 py-2 text-xs font-bold text-[#0F2C6B] hover:bg-[#0F2C6B]/5"
            >
              + Adicionar coluna
            </button>
          )}
        </div>
      </details>

      {/* ── Citação destacada ─────────────────────────────────── */}
      <details
        open={!!value.pullQuote}
        className="rounded-xl border border-gray-200 bg-white"
      >
        <summary className="cursor-pointer select-none px-5 py-3 text-xs font-black uppercase tracking-wider text-gray-500">
          Citação destacada
          {value.pullQuote && (
            <span className="ml-2 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
              activa
            </span>
          )}
        </summary>
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="mb-3 text-[11px] text-gray-500">
            Bloco com uma citação grande e atribuição (&ldquo;— Nome,
            cargo&rdquo;). Aparece no meio do artigo.
          </p>
          {!value.pullQuote ? (
            <button
              type="button"
              onClick={() => setPullQuote({ quote: "", cite: "" })}
              className="rounded-lg border border-[#0F2C6B]/20 px-4 py-2 text-xs font-bold text-[#0F2C6B] hover:bg-[#0F2C6B]/5"
            >
              + Adicionar citação
            </button>
          ) : (
            <div className="space-y-3 rounded-lg border-l-4 border-purple-400 bg-purple-50/30 p-4">
              <textarea
                value={value.pullQuote.quote}
                onChange={(e) =>
                  setPullQuote({
                    quote: e.target.value.slice(0, PULL_QUOTE_MAX),
                    cite: value.pullQuote?.cite ?? "",
                  })
                }
                rows={3}
                maxLength={PULL_QUOTE_MAX}
                placeholder="A citação na íntegra…"
                className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-base italic text-slate-800 focus:border-[#0F2C6B] focus:outline-none"
              />
              <p className="text-right text-[10px] text-gray-300">
                {value.pullQuote.quote.length}/{PULL_QUOTE_MAX}
              </p>
              <input
                value={value.pullQuote.cite}
                onChange={(e) =>
                  setPullQuote({
                    quote: value.pullQuote?.quote ?? "",
                    cite: e.target.value.slice(0, PULL_CITE_MAX),
                  })
                }
                maxLength={PULL_CITE_MAX}
                placeholder="— Nome, cargo"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setPullQuote(null)}
                className="rounded-md border border-red-100 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
              >
                Remover citação
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
