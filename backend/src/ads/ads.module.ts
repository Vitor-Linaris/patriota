import { Module, type OnModuleInit } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdsController } from './ads.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  providers: [AdsService],
  controllers: [AdsController],
  exports: [AdsService],
})
export class AdsModule implements OnModuleInit {
  constructor(private readonly service: AdsService) {}

  async onModuleInit() {
    // Ensure the 10 default ad slots exist on boot.
    try {
      await this.service.ensureDefaults();
    } catch {
      /* DB may not be ready yet on first boot; ignore */
    }
  }
}
