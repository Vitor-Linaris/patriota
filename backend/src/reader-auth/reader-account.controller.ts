import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReaderAuthService } from './reader-auth.service';
import { CurrentReader, ReaderAuth } from './reader-auth.decorators';
import type { ReaderPrincipal } from './reader-auth.guard';
import { UpdateReaderProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

/**
 * The reader's own account. Class-level @ReaderAuth() — every route here
 * requires a reader session and none of them can be reached by a staff
 * token (different signing key, different table).
 *
 * Paths live under /reader/ rather than /public/ so the split is obvious
 * at a glance in logs and in the isolation e2e spec.
 */
@ReaderAuth()
@Controller()
export class ReaderAccountController {
  constructor(private readonly auth: ReaderAuthService) {}

  @Get('reader/me')
  me(@CurrentReader() reader: ReaderPrincipal) {
    return this.auth.getProfile(reader.id);
  }

  @Patch('reader/me')
  update(
    @CurrentReader() reader: ReaderPrincipal,
    @Body() dto: UpdateReaderProfileDto,
  ) {
    return this.auth.updateProfile(reader.id, dto);
  }

  /** Bumps tokenVersion, so every other device is signed out. */
  @Post('reader/me/password')
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentReader() reader: ReaderPrincipal,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.auth.changePassword(reader.id, dto.current, dto.next);
  }

  @Post('reader/me/logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  logoutAll(@CurrentReader() reader: ReaderPrincipal): Promise<void> {
    return this.auth.logoutAll(reader.id);
  }

  /**
   * RGPD erasure. Anonymises the account and drops the reader's private
   * data; comments survive as "Leitor removido" so existing threads stay
   * readable. See ReaderAuthService.anonymise for why this is not a delete.
   */
  @Delete('reader/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentReader() reader: ReaderPrincipal): Promise<void> {
    return this.auth.anonymise(reader.id);
  }
}
