import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { VisitsService } from './visits.service';

class TrackVisitDto {
  @IsString()
  @Length(8, 128)
  visitor!: string;
}

@Controller('public/visits')
export class VisitsController {
  constructor(private readonly service: VisitsService) {}

  @Public()
  @Post('track')
  @HttpCode(204)
  async track(@Body() dto: TrackVisitDto): Promise<void> {
    await this.service.track(dto.visitor);
  }
}
