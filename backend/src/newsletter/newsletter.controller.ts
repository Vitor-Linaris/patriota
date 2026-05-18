import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  listSubscribers(@Query() query: PageQueryDto) {
    return this.service.listSubscribers(query);
  }

  @Public()
  @Post('public/newsletter/subscribe')
  subscribe(@Body() dto: SubscribeDto) {
    return this.service.subscribe(dto.email, dto.name);
  }
}
