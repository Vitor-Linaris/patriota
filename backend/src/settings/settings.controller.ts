import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { SettingsService, VALID_SECTIONS, type SectionName } from './settings.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Public } from '../auth/public.decorator';

/**
 * Sections safe to expose unauthenticated. Currently only `redes`
 * (social links shown in the public footer) and `geral` (site name
 * / tagline). NEVER add `email`, `seguranca`, or `newsletter` — they
 * contain credentials and operational policy.
 */
const PUBLIC_SECTIONS: SectionName[] = ['redes', 'geral'];

@Controller()
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Public()
  @Get('public/settings/:section')
  publicGet(@Param('section') section: string) {
    if (!PUBLIC_SECTIONS.includes(section as SectionName)) {
      throw new BadRequestException('Secção não disponível publicamente.');
    }
    return this.service.get(section as SectionName);
  }

  @Get('admin/settings')
  @RequirePermissions('configuracoes.aceder')
  getAll() {
    return this.service.getAll();
  }

  @Get('admin/settings/:section')
  @RequirePermissions('configuracoes.aceder')
  get(@Param('section') section: string) {
    if (!VALID_SECTIONS.includes(section as SectionName)) {
      throw new BadRequestException('Secção inválida.');
    }
    return this.service.get(section as SectionName);
  }

  @Put('admin/settings/:section')
  @RequirePermissions('configuracoes.editar')
  put(
    @Param('section') section: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!VALID_SECTIONS.includes(section as SectionName)) {
      throw new BadRequestException('Secção inválida.');
    }
    return this.service.put(section as SectionName, body);
  }
}
