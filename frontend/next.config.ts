import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Default is 1 MB. Cover-image and inline-image uploads pass through
      // `uploadMediaFileAction` (multipart FormData) and would 413 instantly.
      // 12 MB gives headroom over the backend's 10 MB hard cap (set in
      // backend/.env: MEDIA_MAX_UPLOAD_BYTES) so the backend stays the
      // authoritative limit and rejects oversize files with a real message
      // instead of Next dropping them at the proxy.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
