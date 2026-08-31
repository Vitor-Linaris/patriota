"use client";

import type { AutosaveStatus } from "./useAutosave";

/**
 * The "it is being saved" reassurance, next to the save buttons.
 *
 * Ambient, not an alert: the whole point of autosave is that the author
 * keeps writing, so this never takes focus, never blocks and never
 * shouts. Even the failure state is a quiet amber line — the next tick
 * retries on its own, and a red banner over a half-written sentence
 * would cost more attention than the problem is worth.
 */
export function AutosaveIndicator({
  status,
  isLive,
}: {
  status: AutosaveStatus;
  /**
   * The article is on the public site. "Saved" then means saved ASIDE —
   * readers still see the old version — and saying just "Guardado" would
   * let someone walk away believing their correction is live.
   */
  isLive: boolean;
}) {
  if (status.kind === "idle") return null;

  if (status.kind === "saving") {
    return (
      <span
        role="status"
        className="whitespace-nowrap text-[11px] font-semibold text-gray-400"
      >
        A guardar…
      </span>
    );
  }

  if (status.kind === "saved") {
    const at = status.at.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (isLive) {
      return (
        <span
          role="status"
          title="A versão publicada continua no ar. Carregue em Publicar para as alterações ficarem visíveis."
          className="whitespace-nowrap text-[11px] font-semibold text-blue-600"
        >
          ✓ Alterações guardadas às {at} — por publicar
        </span>
      );
    }
    return (
      <span
        role="status"
        className="whitespace-nowrap text-[11px] font-semibold text-green-600"
      >
        ✓ Guardado às {at}
      </span>
    );
  }

  return (
    <span
      role="status"
      title={status.message}
      className="whitespace-nowrap text-[11px] font-semibold text-amber-600"
    >
      Não guardado — a tentar de novo
    </span>
  );
}
