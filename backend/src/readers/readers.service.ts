import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CommentsService, type ActingStaff } from '../comments/comments.service';
import {
  isSuspended,
  suspensionEndsAt,
  type SuspensionDuration,
} from '../reader-auth/reader-suspension';

const READER_VIEW = {
  id: true,
  email: true,
  name: true,
  status: true,
  suspendedUntil: true,
  suspensionReason: true,
  suspendedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ReadersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly comments: CommentsService,
  ) {}

  /**
   * Bans a reader for a fixed period, or for good.
   *
   * Nothing schedules the release. `suspendedUntil` is the whole
   * mechanism — every checkpoint compares it against the clock, so the
   * ban ends by the calendar arriving rather than by a job remembering
   * to run. See reader-suspension.ts.
   */
  async suspend(
    readerId: string,
    duration: SuspensionDuration,
    staff: ActingStaff,
    opts: { reason?: string; purgeComments?: boolean } = {},
  ) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: { id: true, email: true, name: true, status: true },
    });
    if (!reader) throw new NotFoundException('Leitor não encontrado.');

    // An anonymised account has no one behind it to punish, and writing
    // SUSPENSO over ANONIMIZADO would undo an erasure we are obliged to
    // honour.
    if (reader.status === 'ANONIMIZADO') {
      throw new BadRequestException('Esta conta já foi anonimizada.');
    }

    const until = suspensionEndsAt(duration);

    const updated = await this.prisma.reader.update({
      where: { id: readerId },
      data: {
        status: 'SUSPENSO',
        suspendedUntil: until,
        suspensionReason: opts.reason?.trim() || null,
        suspendedById: staff.id,
        // Strands every token already issued, so the ban starts now
        // rather than whenever their 30-day cookie happens to expire.
        tokenVersion: { increment: 1 },
      },
      select: READER_VIEW,
    });

    const purged = opts.purgeComments
      ? await this.comments.purgeByReader(readerId, staff)
      : 0;

    const label = until
      ? `até ${until.toISOString().slice(0, 10)}`
      : 'permanente';
    void this.activity.record({
      userId: staff.id,
      action: 'reader_suspended',
      targetType: 'reader',
      targetId: readerId,
      targetLabel:
        `${reader.name ?? reader.email} — ${label}` +
        (purged > 0 ? ` (${purged} comentários eliminados)` : ''),
    });

    return { ...updated, purgedComments: purged };
  }

  /** Lifts a ban early. The lapsed ones lift themselves. */
  async unsuspend(readerId: string, staff: ActingStaff) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: { id: true, email: true, name: true, status: true, emailVerifiedAt: true },
    });
    if (!reader) throw new NotFoundException('Leitor não encontrado.');
    if (reader.status !== 'SUSPENSO') {
      throw new BadRequestException('Este leitor não está suspenso.');
    }

    const updated = await this.prisma.reader.update({
      where: { id: readerId },
      data: {
        // Not unconditionally ATIVO: someone banned before they ever
        // confirmed their address comes back still unconfirmed, or the
        // ban would have done the verifying for them.
        status: reader.emailVerifiedAt === null ? 'PENDENTE_VERIFICACAO' : 'ATIVO',
        suspendedUntil: null,
        suspensionReason: null,
        suspendedById: null,
      },
      select: READER_VIEW,
    });

    void this.activity.record({
      userId: staff.id,
      action: 'reader_unsuspended',
      targetType: 'reader',
      targetId: readerId,
      targetLabel: reader.name ?? reader.email,
    });

    return updated;
  }

  /** The suspension state of one reader, for the moderation panel. */
  async suspensionOf(readerId: string) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: READER_VIEW,
    });
    if (!reader) throw new NotFoundException('Leitor não encontrado.');
    // `status` alone lies once an end date has passed, so answer with the
    // question the caller actually has.
    return { ...reader, suspended: isSuspended(reader) };
  }
}
