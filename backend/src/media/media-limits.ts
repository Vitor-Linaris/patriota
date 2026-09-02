/**
 * What the newsroom may upload, and how much of it.
 *
 * The numbers are the ones a news site uses. They exist to stop three
 * different things: a file so big it costs real money to store and
 * serve, a file crafted to exhaust memory when decompressed, and an
 * animation that turns into something larger than what it came from.
 *
 * All in one place because a limit enforced in two places drifts, and
 * the half that drifts is the half nobody is testing.
 */

const MB = 1024 * 1024;

/** Still images. Unchanged from what the project already allowed. */
export const MAX_IMAGE_BYTES = Number(
  process.env.MEDIA_MAX_UPLOAD_BYTES ?? 10 * MB,
);

/**
 * Animated GIF and WebP.
 *
 * Higher than a still because an animation is many frames, and lower
 * than video because it is not video — anything that wants to be a
 * clip should be uploaded as one.
 */
export const MAX_ANIMATION_BYTES = 15 * MB;

/**
 * How many frames of an animation are kept.
 *
 * Not a cosmetic limit. Re-encoding a long GIF to animated WebP can
 * produce a file LARGER than the original, which would turn a 15 MB
 * upload into something worse on the way out. 300 frames is roughly
 * twenty seconds at a typical GIF frame rate — past that it is a video
 * pretending otherwise.
 */
export const MAX_ANIMATION_FRAMES = 300;

/** Video. */
export const MAX_VIDEO_BYTES = 100 * MB;
export const MAX_VIDEO_SECONDS = 5 * 60;
export const MAX_VIDEO_WIDTH = 1920;
export const MAX_VIDEO_HEIGHT = 1080;

/**
 * The largest image sharp will decode, in pixels.
 *
 * A decompression bomb: a PNG of a few hundred kilobytes can declare
 * 50000×50000 and cost gigabytes of memory the moment anything tries to
 * read it. The byte limit above does not see this at all, because the
 * file really is small.
 *
 * sharp defaults to roughly 268 megapixels, which is far past anything
 * a newsroom photograph is. 64 megapixels is comfortably above a
 * full-frame camera and well below dangerous.
 */
export const MAX_IMAGE_PIXELS = 64 * 1_000_000;

/** Per-person storage allowance. */
export const MAX_USER_BYTES = 2 * 1024 * MB;

/** Human-readable size, for messages people actually read. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / 1024 / MB).toFixed(1)} GB`;
}
