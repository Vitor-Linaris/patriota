import { Module } from '@nestjs/common';
import { ReaderLibraryService } from './reader-library.service';
import { ReaderLibraryController } from './reader-library.controller';
import { ReaderAuthModule } from '../reader-auth/reader-auth.module';

/**
 * Imports ReaderAuthModule for the guards that @ReaderAuth() applies —
 * Nest resolves guards named in @UseGuards from the DI container of the
 * module that declares the controller.
 */
@Module({
  imports: [ReaderAuthModule],
  providers: [ReaderLibraryService],
  controllers: [ReaderLibraryController],
  exports: [ReaderLibraryService],
})
export class ReaderLibraryModule {}
