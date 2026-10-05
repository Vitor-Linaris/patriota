import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * @Global for the same reason as MailerModule: media, avatars and the
 * social image route all need it, and threading an import through each
 * of those modules buys nothing.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
