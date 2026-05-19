import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

/**
 * Translates upload-pipeline failures into clean JSON responses with
 * user-readable Portuguese messages.
 *
 * Why two exception types: NestJS's @UseInterceptors(FileInterceptor)
 * wrapper catches multer's native errors and re-throws them as Nest
 * HttpExceptions (e.g. MulterError(LIMIT_FILE_SIZE) →
 * PayloadTooLargeException("File too large")). So we have to handle
 * both the raw MulterError (if it ever leaks) AND the wrapped
 * PayloadTooLargeException whose message is the only signal we have
 * left to identify the cause.
 */
@Catch(MulterError, PayloadTooLargeException)
export class MulterExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MulterExceptionFilter.name);

  catch(
    exception: MulterError | PayloadTooLargeException,
    host: ArgumentsHost,
  ) {
    const res = host.switchToHttp().getResponse<Response>();
    const limitMb = Math.round(
      Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024) /
        (1024 * 1024),
    );
    const friendlyTooLarge = `Imagem demasiado grande. O limite é ${limitMb} MB. Reduza a imagem (por exemplo em tinypng.com) e tente novamente.`;

    // Wrapped Nest exception from FileInterceptor.
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        message: friendlyTooLarge,
        error: 'LIMIT_FILE_SIZE',
      });
      return;
    }

    // Raw multer error (rare, but defensible).
    const map: Record<string, { status: number; message: string }> = {
      LIMIT_FILE_SIZE: {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        message: friendlyTooLarge,
      },
      LIMIT_UNEXPECTED_FILE: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Campo de upload inesperado. Use o campo "file".',
      },
      LIMIT_FILE_COUNT: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Demasiados ficheiros enviados ao mesmo tempo.',
      },
      LIMIT_PART_COUNT: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Pedido multipart inválido.',
      },
    };
    const known = map[exception.code];
    if (!known) {
      this.logger.warn(
        `Unmapped multer error: ${exception.code} — ${exception.message}`,
      );
    }
    const status = known?.status ?? HttpStatus.BAD_REQUEST;
    const message =
      known?.message ?? `Falha no upload: ${exception.message}`;

    res
      .status(status)
      .json({ statusCode: status, message, error: exception.code });
  }
}
