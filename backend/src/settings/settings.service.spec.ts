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

  /**
   * The cadence list feeds a REQUIRED dropdown on every staff profile.
   * Emptying it would leave the whole newsroom with a mandatory field
   * and nothing to put in it — a screen nobody can save, discovered one
   * journalist at a time.
   */
  describe('redacao › cadências', () => {
    it('refuses to save an empty list', async () => {
      await expect(service.put('redacao', { cadencias: [] })).rejects.toThrow(
        /pelo menos uma/i,
      );
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
    });

    it('refuses a list that is only blanks', async () => {
      await expect(
        service.put('redacao', { cadencias: ['   ', ''] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('trims and de-duplicates what it does save', async () => {
      await service.put('redacao', {
        cadencias: [' Uma vez por semana ', 'Uma vez por semana', 'Diária'],
      });

      expect(prisma.setting.upsert.mock.calls[0][0].create.data).toEqual({
        cadencias: ['Uma vez por semana', 'Diária'],
      });
    });

    it('hands the same cleaned list to whoever asks for the options', async () => {
      // The dropdown and the validation that guards it must read exactly
      // the same list, or a value can be offered and then refused.
      prisma.setting.findUnique.mockResolvedValueOnce({
        section: 'redacao',
        data: { cadencias: ['  Semanal ', 'Semanal', 42, ''] },
      });

      await expect(service.cadences()).resolves.toEqual(['Semanal']);
    });

    it('falls back to the four the newsroom started with', async () => {
      await expect(service.cadences()).resolves.toEqual([
        'Duas vezes por semana',
        'Uma vez por semana',
        'Uma vez por mês',
        'Uma vez a cada 2 meses',
      ]);
    });
  });
});
