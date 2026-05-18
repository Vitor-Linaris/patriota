import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: { setting: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      setting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(SettingsService);
  });

  it('returns defaults when no row exists yet', async () => {
    const all = await service.getAll();
    expect(all.geral.siteName).toBe('O Patriota Notícias');
  });

  it('merges stored values over defaults', async () => {
    prisma.setting.findUnique.mockResolvedValueOnce({
      section: 'geral',
      data: { siteName: 'Outro' },
    });
    const geral = await service.get('geral');
    expect(geral.siteName).toBe('Outro');
    expect(geral.tagline).toBe('Jornalismo independente que faz a diferença.');
  });

  it('rejects unknown sections', async () => {
    await expect(
      service.put('bogus' as never, {}),
    ).rejects.toThrow(BadRequestException);
  });
});
