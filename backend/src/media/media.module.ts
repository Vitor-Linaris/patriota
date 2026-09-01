import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaAccessService } from './media-access.service';
import { MediaController } from './media.controller';
import { UploadsController } from './uploads.controller';

/**
 * The media library, and the route that serves its files.
 *
 * UploadsController replaces what used to be `app.useStaticAssets` in
 * main.ts. It lives here rather than in its own module because it is
 * the same subject: what a file is, who owns it, and whether it may be
 * handed out.
 *
 * AuthModule is @Global() and provides both AuthService and JwtService,
 * which the serving route needs to recognise a member of staff without
 * the guard (it is @Public()).
 */
@Module({
  providers: [MediaService, MediaAccessService],
  controllers: [MediaController, UploadsController],
  exports: [MediaService, MediaAccessService],
})
export class MediaModule {}
