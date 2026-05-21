import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { NewsletterService } from './newsletter.service';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { PageQueryDto } from '../common/dto/pagination.dto';

class CampaignDto {
  @IsString()
  @Length(2, 200)
  subject!: string;

  @IsOptional() @IsString() preview?: string;
  @IsOptional() @IsString() segment?: string;
  @IsOptional() @IsString() header?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() ctaText?: string;
  @IsOptional() @IsString() ctaUrl?: string;
  @IsOptional() @IsString() footer?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

class SubscribeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  name?: string;
}

/**
 * Extends PageQueryDto with the free-text filter used by the
 * subscribers list. We can't use a TS intersection (`PageQueryDto &
 * { q?: string }`) because Nest's ValidationPipe reads the
 * decorator metadata off the concrete class — an intersection loses
 * that and the `@Type(() => Number)` transform silently stops
 * running, so `pageSize` arrives as a string and Prisma rejects it.
 */
class ListSubscribersQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}

@Controller()
export class NewsletterController {
  constructor(private readonly service: NewsletterService) {}

  @Get('admin/newsletters/campaigns')
  @RequirePermissions('newsletter.listas')
  listCampaigns(@Query() query: PageQueryDto) {
    return this.service.listCampaigns(query);
  }

  @Post('admin/newsletters/campaigns')
  @RequirePermissions('newsletter.enviar')
  createCampaign(@Body() dto: CampaignDto) {
    return this.service.createCampaign(dto);
  }

  @Patch('admin/newsletters/campaigns/:id')
  @RequirePermissions('newsletter.enviar')
  updateCampaign(@Param('id') id: string, @Body() dto: CampaignDto) {
    return this.service.updateCampaign(id, dto);
  }

  @Post('admin/newsletters/campaigns/:id/send')
  @RequirePermissions('newsletter.enviar')
  send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.sendCampaign(id, user.id);
  }

  @Get('admin/newsletters/subscribers')
  @RequirePermissions('newsletter.listas')
  listSubscribers(@Query() query: ListSubscribersQueryDto) {
    return this.service.listSubscribers(query);
  }

  @Get('admin/newsletters/subscribers/stats')
  @RequirePermissions('newsletter.listas')
  subscriberStats() {
    return this.service.subscriberStats();
  }

  /**
   * UTF-8 CSV with BOM so Excel detects the encoding and Portuguese
   * accents render correctly. Plain comma-separated; columns wrapped
   * in quotes only when they contain a comma or quote.
   */
  @Get('admin/newsletters/subscribers/export.csv')
  @RequirePermissions('newsletter.listas')
  async exportCsv(@Res() res: Response): Promise<void> {
    const subs = await this.service.listAllSubscribers();
    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Email', 'Nome', 'Estado', 'Segmento', 'Subscrito em'];
    const rows = subs.map((s) => [
      s.email,
      s.name,
      s.status,
      s.segment,
      s.joinedAt.toISOString(),
    ]);
    const csv =
      '﻿' +
      [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="subscritores-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  /** XLSX with column widths and header styling so the export opens
   *  cleanly in Excel / Numbers / LibreOffice. */
  @Get('admin/newsletters/subscribers/export.xlsx')
  @RequirePermissions('newsletter.listas')
  async exportXlsx(@Res() res: Response): Promise<void> {
    const subs = await this.service.listAllSubscribers();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'O Patriota';
    wb.created = new Date();
    const ws = wb.addWorksheet('Subscritores');
    ws.columns = [
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Nome', key: 'name', width: 25 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Segmento', key: 'segment', width: 14 },
      { header: 'Subscrito em', key: 'joinedAt', width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F2C6B' },
    };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (const s of subs) {
      ws.addRow({
        email: s.email,
        name: s.name,
        status: s.status,
        segment: s.segment,
        joinedAt: s.joinedAt,
      });
    }
    ws.getColumn('joinedAt').numFmt = 'yyyy-mm-dd';
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="subscritores-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    res.send(Buffer.from(buf));
  }

  @Public()
  @Post('public/newsletter/subscribe')
  subscribe(@Body() dto: SubscribeDto) {
    return this.service.subscribe(dto.email, dto.name);
  }
}
