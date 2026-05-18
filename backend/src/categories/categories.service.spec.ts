import { Test } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

function makePrismaMock() {
  return {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subtopic: {
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  describe('create()', () => {
    it('auto-generates a slug from the name when none is provided', async () => {
      prisma.category.create.mockResolvedValueOnce({ id: 'c1' });
      await service.create({
        name: 'Tecnologia & Saúde',
        description: 'd',
        icon: '◆',
        color: '#000',
      });
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'tecnologia-saude' }),
      });
    });

    it('respects an explicit slug when provided', async () => {
      prisma.category.create.mockResolvedValueOnce({ id: 'c1' });
      await service.create({
        name: 'Cultura',
        slug: 'my-custom-slug',
        description: '',
        icon: '◆',
        color: '#000',
      });
      expect(prisma.category.create.mock.calls[0][0].data.slug).toBe(
        'my-custom-slug',
      );
    });

    it('throws ConflictException when the slug already exists', async () => {
      const err = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
      });
      prisma.category.create.mockRejectedValueOnce(err);
      await expect(
        service.create({ name: 'X', description: '', icon: '◆', color: '#000' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove()', () => {
    it('throws NotFoundException when the category does not exist', async () => {
      const err = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });
      prisma.category.delete.mockRejectedValueOnce(err);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPublic()', () => {
    it('returns only visible categories with article counts', async () => {
      prisma.category.findMany.mockResolvedValueOnce([]);
      await service.listPublic();
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { visible: true },
          orderBy: { order: 'asc' },
          include: expect.objectContaining({
            subtopics: expect.any(Object),
          }),
        }),
      );
    });
  });
});
