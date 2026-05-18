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

@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @RequirePermissions('configuracoes.aceder')
  getAll() {
    return this.service.getAll();
  }

  @Get(':section')
  @RequirePermissions('configuracoes.aceder')
  get(@Param('section') section: string) {
    if (!VALID_SECTIONS.includes(section as SectionName)) {
      throw new BadRequestException('Secção inválida.');
    }
    return this.service.get(section as SectionName);
  }

  @Put(':section')
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
