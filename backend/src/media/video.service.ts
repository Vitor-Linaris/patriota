import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  MAX_VIDEO_HEIGHT,
  MAX_VIDEO_SECONDS,
  MAX_VIDEO_WIDTH,
} from './media-limits';

const run = promisify(execFile);

/** What ffprobe tells us about a file. */
export interface VideoInfo {
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
}

/**
 * Codecs a browser will actually play, without us converting anything.
 *
 * H.264 is the one that plays everywhere. VP8/VP9 and AV1 cover WebM.
 * Anything else — HEVC out of an iPhone is the common case — would
 * upload happily and then simply not play for a good share of readers,
 * which is worse than a refusal that says what to do.
 */
const PLAYABLE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);

/** Audio a browser will decode alongside the above. */
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis']);

/**
 * Reads and checks video, and takes a still from it.
 *
 * Inspection only. Converting a video takes minutes and cannot live
 * inside an HTTP request — doing it properly needs a job queue and a
 * "still processing" state in the UI, which is a bigger feature than
 * this one. So the rule is: the newsroom uploads something a browser
 * can already play, and we say clearly when it is not.
 *
 * Everything here shells out to ffmpeg with an argument ARRAY, never a
 * string. A filename is attacker-controlled in principle, and a shell
 * would be the obvious way to turn an upload into command execution.
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  /**
   * Duration, resolution and codecs.
   *
   * @throws BadRequestException when the file is not readable as video.
   */
  async probe(path: string): Promise<VideoInfo> {
    let raw: string;
    try {
      const { stdout } = await run(
        'ffprobe',
        [
          '-v', 'error',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          path,
        ],
        // A probe reads headers, not the whole file. If it has not
        // answered in fifteen seconds something is wrong with the file
        // rather than slow.
        { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
      );
      raw = stdout;
    } catch (e) {
      throw new BadRequestException(
        `Não foi possível ler o vídeo: ${(e as Error).message.slice(0, 120)}`,
      );
    }

    let parsed: {
      format?: { duration?: string };
      streams?: {
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }[];
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('O ficheiro não é um vídeo válido.');
    }

    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    if (!video) {
      // An audio file in an MP4 container. It would upload, store and
      // then show nothing.
      throw new BadRequestException(
        'Este ficheiro não tem imagem — parece ser só áudio.',
      );
    }
    const audio = parsed.streams?.find((s) => s.codec_type === 'audio');

    return {
      durationSeconds: Number(parsed.format?.duration ?? 0),
      width: video.width ?? 0,
      height: video.height ?? 0,
      videoCodec: video.codec_name ?? 'desconhecido',
      audioCodec: audio?.codec_name ?? null,
    };
  }

  /**
   * Refuses anything a reader would not be able to play, or that is
   * simply too much.
   *
   * Each message names the number found, not just the limit: "5 minutos"
   * tells somebody nothing about a clip they think is short.
   */
  assertAcceptable(info: VideoInfo): void {
    if (!PLAYABLE_VIDEO.has(info.videoCodec)) {
      throw new BadRequestException(
        `O vídeo está em ${info.videoCodec}, que muitos browsers não ` +
          'reproduzem. Exporte em MP4 (H.264) ou WebM e volte a tentar.',
      );
    }

    // Audio is optional — plenty of newsroom clips are silent. Only a
    // track we cannot play is a problem.
    if (info.audioCodec && !PLAYABLE_AUDIO.has(info.audioCodec)) {
      throw new BadRequestException(
        `O áudio está em ${info.audioCodec}, que muitos browsers não ` +
          'reproduzem. Exporte com áudio AAC.',
      );
    }

    if (info.durationSeconds > MAX_VIDEO_SECONDS) {
      const mins = Math.floor(info.durationSeconds / 60);
      const secs = Math.round(info.durationSeconds % 60);
      throw new BadRequestException(
        `O vídeo dura ${mins}m${String(secs).padStart(2, '0')}s. ` +
          `O limite é ${MAX_VIDEO_SECONDS / 60} minutos.`,
      );
    }

    if (info.width > MAX_VIDEO_WIDTH || info.height > MAX_VIDEO_HEIGHT) {
      throw new BadRequestException(
        `O vídeo é ${info.width}×${info.height}. ` +
          `O limite é ${MAX_VIDEO_WIDTH}×${MAX_VIDEO_HEIGHT} — exporte ` +
          'em 1080p.',
      );
    }

    if (info.durationSeconds <= 0 || info.width <= 0 || info.height <= 0) {
      // ffprobe read the file but found nothing usable in it.
      throw new BadRequestException('O vídeo parece estar corrompido.');
    }
  }

  /**
   * Extracts one frame as a JPEG buffer, for the library thumbnail.
   *
   * Taken a second in rather than at zero: the first frame of a clip is
   * very often black, and a wall of black rectangles is no better than
   * no thumbnails at all. Falls back to the very start for a clip too
   * short for that.
   *
   * Returns null on failure instead of throwing. A missing thumbnail is
   * a worse-looking library; refusing the upload over it would be
   * throwing away a valid video because a picture of it could not be
   * taken.
   */
  async grabPoster(path: string, durationSeconds: number): Promise<Buffer | null> {
    const at = durationSeconds > 2 ? '1' : '0';
    try {
      const { stdout } = await run(
        'ffmpeg',
        [
          '-v', 'error',
          '-ss', at,
          '-i', path,
          '-frames:v', '1',
          '-f', 'image2',
          '-c:v', 'mjpeg',
          'pipe:1',
        ],
        {
          timeout: 20_000,
          maxBuffer: 32 * 1024 * 1024,
          // The frame is binary, so no encoding — a string would
          // corrupt it.
          encoding: 'buffer',
        },
      );
      return stdout.length > 0 ? stdout : null;
    } catch (e) {
      this.logger.warn(`Could not grab a poster frame: ${(e as Error).message}`);
      return null;
    }
  }
}
