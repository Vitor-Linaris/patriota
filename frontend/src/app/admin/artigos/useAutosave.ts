"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Quiet time after the last keystroke before a save fires. */
const IDLE_MS = 3000;
/**
 * Hard ceiling between saves while someone types without ever pausing.
 * Without it, a journalist in full flow could go many minutes with
 * nothing on the server — exactly the person this feature exists for.
 */
const MAX_INTERVAL_MS = 30_000;

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

export interface AutosaveResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Saves a draft in the background while the author writes.
 *
 * Two clocks, because one is not enough. The idle timer covers the
 * common case — you stop, it saves. The ceiling covers the case the
 * idle timer never fires: someone typing continuously for ten minutes
 * would otherwise never hit a pause, and never be saved.
 *
 * Concurrency is handled by refusing to overlap rather than by
 * cancelling. Server Actions are not abortable the way a fetch is, and
 * the codebase has no AbortController anywhere, so instead: at most one
 * request in flight; anything that changes while it is in flight raises
 * a "dirty" flag and runs the moment it lands. A generation counter
 * makes a late response from a superseded save unable to overwrite
 * newer state.
 */
export function useAutosave({
  enabled,
  data,
  onSave,
  paused,
}: {
  /** False while the form is not yet worth saving (no title, no category). */
  enabled: boolean;
  /** Anything that should trigger a save when it changes. */
  data: unknown;
  /** Performs the save. Returns the id so a create can become a patch. */
  onSave: () => Promise<AutosaveResult>;
  /** True while a manual save/publish owns the article — see below. */
  paused: boolean;
}) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ceilingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const dirtyWhileInFlight = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);

  // Latest props, read from inside the timers. A setTimeout closes over
  // the values it saw when scheduled, and those are seconds stale by the
  // time it runs. Written in an effect, never during render.
  const latest = useRef({ enabled, paused, onSave });
  useEffect(() => {
    latest.current = { enabled, paused, onSave };
  });

  // Lets a timer call the newest `run` without `run` referring to
  // itself while it is still being declared.
  const runRef = useRef<() => void>(() => {});

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (ceilingTimer.current) clearTimeout(ceilingTimer.current);
    idleTimer.current = null;
    ceilingTimer.current = null;
  }, []);

  const run = useCallback(async () => {
    const { enabled: on, paused: held, onSave: save } = latest.current;
    if (!alive.current || !on || held) return;

    if (inFlight.current) {
      // Someone kept typing while the previous save was travelling.
      // Remember, and pick it up when that one returns.
      dirtyWhileInFlight.current = true;
      return;
    }

    clearTimers();
    inFlight.current = true;
    const mine = ++generation.current;
    setStatus({ kind: "saving" });

    let result: AutosaveResult;
    try {
      result = await save();
    } catch {
      result = { ok: false, error: "Sem ligação." };
    }

    inFlight.current = false;

    // A newer save started after this one — its outcome is the truth,
    // so this stale response says nothing about the current state.
    if (!alive.current || mine !== generation.current) return;

    if (result.ok) {
      setStatus({ kind: "saved", at: new Date() });
      // The ceiling restarts from the last SUCCESSFUL save, not from
      // the last attempt, so a run of failures cannot quietly stretch
      // the gap between real saves.
      ceilingTimer.current = setTimeout(
        () => runRef.current(),
        MAX_INTERVAL_MS,
      );
    } else {
      setStatus({
        kind: "error",
        message: result.error ?? "Não foi possível guardar.",
      });
    }

    if (dirtyWhileInFlight.current) {
      dirtyWhileInFlight.current = false;
      idleTimer.current = setTimeout(() => runRef.current(), IDLE_MS);
    }
  }, [clearTimers]);

  useEffect(() => {
    runRef.current = () => void run();
  }, [run]);

  // The idle clock. Restarts on every change to `data`.
  useEffect(() => {
    if (!enabled || paused) return;
    const handle = setTimeout(() => runRef.current(), IDLE_MS);
    idleTimer.current = handle;
    return () => clearTimeout(handle);
  }, [data, enabled, paused]);

  // The ceiling clock, armed once the form first becomes saveable.
  useEffect(() => {
    if (!enabled || paused) return;
    const handle = setTimeout(() => runRef.current(), MAX_INTERVAL_MS);
    ceilingTimer.current = handle;
    return () => clearTimeout(handle);
  }, [enabled, paused]);

  useEffect(() => {
    alive.current = true;
    return () => {
      // Closing the editor must leave nothing behind: no timer about to
      // fire, and no late response allowed to touch state.
      alive.current = false;
    };
  }, []);

  /**
   * Called by the manual save/publish buttons so a pending autosave
   * cannot fire underneath them and re-send stale content.
   */
  const cancelPending = useCallback(() => {
    clearTimers();
    dirtyWhileInFlight.current = false;
    generation.current += 1;
  }, [clearTimers]);

  return { status, cancelPending };
}
