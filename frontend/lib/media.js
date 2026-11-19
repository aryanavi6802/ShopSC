/**
 * Resolve an uploaded file path ("/uploads/...") to a URL the browser can load.
 *
 * By default this is same-origin: in production the reverse proxy (Caddy) routes /uploads to the
 * backend, and in local dev next.config.js rewrites /uploads to the backend. Set
 * NEXT_PUBLIC_MEDIA_BASE (e.g. an S3/CloudFront URL) to serve uploads from somewhere else.
 */
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE || "").replace(/\/$/, "");

export function mediaUrl(path) {
  if (!path) return path;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${MEDIA_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}
