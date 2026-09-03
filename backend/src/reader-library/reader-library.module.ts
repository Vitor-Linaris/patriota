import { Module } from '@nestjs/common';
import { ReaderLibraryService } from './reader-library.service';
import { ReaderLibraryController } from './reader-library.controller';
import { ReaderAuthModule } from '../reader-auth/reader-auth.module';
import { CategoriesModule } from '../categories/categories.module';

/**
 * Imports ReaderAuthModule for the guards that @ReaderAuth() applies —
 * Nest resolves guards named in @UseGuards from the DI container of the
 * module that declares the controller. CategoriesModule for
 * CategoryTreeService, which resolves a leaf category up to its root —
 * following collapses to the root section, see reader-library.service.ts.
 */
@Module({
  imports: [ReaderAuthModule, CategoriesModule],
  providers: [ReaderLibraryService],
  controllers: [ReaderLibraryController],
  exports: [ReaderLibraryService],
})
export class ReaderLibraryModule {}
