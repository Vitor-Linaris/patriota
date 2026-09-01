/**
 * Client-side validation for image uploads.
 *
 * The numbers here must stay ≤ the two server-side caps:
 *   1. Backend: media-limits.ts (10 MB for a still, 15 MB for an
 *      animation). Multer rejects with 413 LIMIT_FILE_SIZE.
 *   2. Next.js: experimental.serverActions.bodySizeLimit in
 *      next.config.ts (currently 12 MB). Next aborts the request and
 *      throws an uncaughtException — the user just sees the generic
 *      "An unexpected response was received from the server" with no
 *      hint at the cause. That's exactly what we want to prevent here.
 *
 * Validating before we call uploadMediaFileAction means the user gets
 * a concrete, actionable message ("Imagem demasiado grande: 14.3 MB.
 * O limite é 10 MB.") instead of a generic crash.
 *
 * The server decides for real, and by the file's BYTES rather than the
 * type the browser reports. This is a courtesy, not a gate.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Animations get more room, because an animation is many frames.
 *
 * Capped below the 12 MB Next limit above on purpose: a 15 MB animated
 * GIF would die inside the Server Action with the generic error, which
 * is worse than being told the number here. Raising this means moving
 * the upload off the Server Action first.
 */
export const MAX_ANIMATION_BYTES = 11 * 1024 * 1024;

const SUPPORTED_MIME_PREFIX = "image/";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns null when the file is acceptable; otherwise a user-facing reason. */
export function validateImageUpload(file: File): string | null {
  if (!file.type.startsWith(SUPPORTED_MIME_PREFIX)) {
    return "Apenas ficheiros de imagem são suportados.";
  }

  // A GIF may be an animation, and the browser cannot tell us without
  // reading it. Assuming it might be is the forgiving direction: the
  // server checks the frames properly and refuses with a count.
  const cap = file.type === "image/gif" ? MAX_ANIMATION_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > cap) {
    return `Imagem demasiado grande: ${formatBytes(file.size)}. O limite é ${formatBytes(cap)}. Reduza a imagem (por exemplo em tinypng.com) e tente novamente.`;
  }
  return null;
}
