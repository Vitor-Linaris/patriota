import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  PageQueryDto,
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';

export interface CreateMediaInput {
  url: string;
  name?: string;
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async list(query: PageQueryDto): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const [items, total] = await Promise.all([
      this.prisma.media.findMany({
        skip,
        take,
        orderBy: { uploadedAt: 'desc' },
      }),
      this.prisma.media.count(),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async create(input: CreateMediaInput, userId: string) {
    if (!/^https?:\/\//i.test(input.url)) {
      throw new BadRequestException('URL inválido (http(s) requerido).');
    }
    const fallbackName =
      input.url.split('/').pop()?.split('?')[0] ?? 'imagem.jpg';
    const created = await this.prisma.media.create({
      data: {
        url: input.url,
        name: input.name ?? fallbackName,
        mimeType: input.mimeType,
        size: input.size,
        width: input.width,
        height: input.height,
        uploadedById: userId,
      },
    });
    void this.activity.record({
      userId,
      action: 'uploaded',
      targetType: 'media',
      targetId: created.id,
      targetLabel: created.name,
    });
    return created;
  }

  async remove(id: string, userId: string) {
    try {
      const deleted = await this.prisma.media.delete({ where: { id } });
      void this.activity.record({
        userId,
        action: 'deleted',
        targetType: 'media',
        targetId: deleted.id,
        targetLabel: deleted.name,
      });
      return { ok: true };
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Imagem não encontrada.');
      }
      throw e;
    }
  }
}
