import type { ReaderStatus } from '../../generated/prisma/enums';

/**
 * One place decides whether a reader is banned right now.
 *
 * There were already five checkpoints reading `status === 'SUSPENSO'`
 * directly — the guard, e-mail login, e-mail verification, and two in the
 * OAuth flow. Adding an end date to each of them by hand is how they
 * drift apart, and the one that drifts is the one that lets a banned
 * reader back in. So they all call in here instead.
 *
 * The rule, stated once:
 *
 *   status !== SUSPENSO            → not banned
 *   SUSPENSO, suspendedUntil NULL  → banned, permanently
 *   SUSPENSO, date in the future   → banned until that date
 *   SUSPENSO, date in the past     → NOT banned; the ban lapsed
 *
 * That last line is the whole design. A ban ends because a date passed,
 * not because a scheduled job woke up and flipped the status back. If the
 * process is down on the day a 15-day ban expires, nobody stays banned
 * for an extra week by accident — the next request they make simply lets
 * them in.
 */
export interface SuspensionFields {
  status: ReaderStatus;
  /**
   * `undefined` means the caller's `select` left the column out. Read as
   * NULL — i.e. as a permanent ban — so a forgotten field fails closed.
   * Getting this backwards would turn every missing select into a way
   * out of a suspension.
   */
  suspendedUntil: Date | null | undefined;
}

/** True while the reader is barred. The authoritative check. */
export function isSuspended(
  reader: SuspensionFields,
  now: Date = new Date(),
): boolean {
  if (reader.status !== 'SUSPENSO') return false;
  const until = reader.suspendedUntil ?? null;
  if (until === null) return true;
  return until.getTime() > now.getTime();
}

/**
 * True when the row still SAYS suspended but the date has passed.
 *
 * Nothing depends on this being noticed — {@link isSuspended} has already
 * let the reader through by the time anyone asks. It exists so a
 * checkpoint can tidy the row up in passing, which keeps the admin list
 * honest about who is actually banned rather than showing a stale
 * SUSPENSO next to a date from last month.
 */
export function suspensionLapsed(
  reader: SuspensionFields,
  now: Date = new Date(),
): boolean {
  const until = reader.suspendedUntil ?? null;
  return (
    reader.status === 'SUSPENSO' &&
    until !== null &&
    until.getTime() <= now.getTime()
  );
}

/**
 * What a lapsed suspension should leave behind.
 *
 * Not unconditionally ATIVO: someone banned before they ever confirmed
 * their address must come back still unconfirmed, or a ban would have
 * quietly done the verifying for them.
 */
export function statusAfterLapse(reader: {
  emailVerifiedAt: Date | null;
}): ReaderStatus {
  return reader.emailVerifiedAt === null ? 'PENDENTE_VERIFICACAO' : 'ATIVO';
}

/** The write that clears a lapsed suspension. Shared so it stays uniform. */
export function lapseData(reader: { emailVerifiedAt: Date | null }) {
  return {
    status: statusAfterLapse(reader),
    suspendedUntil: null,
    suspensionReason: null,
    suspendedById: null,
  };
}

/**
 * What we tell the reader.
 *
 * Told plainly, and told with the date. Until now every refusal on this
 * path said "Conta indisponível.", which a banned reader reads as a bug
 * and answers by opening a support ticket or making a second account.
 * The reason is included because it is written to be read by them — a
 * moderator typing it knows it will be quoted back.
 */
export function suspensionMessage(reader: {
  suspendedUntil: Date | null | undefined;
  suspensionReason: string | null | undefined;
}): string {
  const head =
    (reader.suspendedUntil ?? null) === null
      ? 'A sua conta foi suspensa definitivamente por incumprimento das regras de comentários.'
      : `A sua conta está suspensa até ${formatDate(reader.suspendedUntil!)}, por incumprimento das regras de comentários.`;

  return reader.suspensionReason
    ? `${head} Motivo: ${reader.suspensionReason}`
    : head;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * The durations a moderator may choose.
 *
 * A closed list rather than a free-form number of days: the point of the
 * feature is a consistent policy, and "banned for 4000 days" is a
 * permanent ban that nobody labelled as one.
 */
export const SUSPENSION_DURATIONS = {
  DIAS_15: 15,
  DIAS_30: 30,
  PERMANENTE: null,
} as const;

export type SuspensionDuration = keyof typeof SUSPENSION_DURATIONS;

/** The end date for a duration, or null for permanent. */
export function suspensionEndsAt(
  duration: SuspensionDuration,
  from: Date = new Date(),
): Date | null {
  const days = SUSPENSION_DURATIONS[duration];
  if (days === null) return null;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
