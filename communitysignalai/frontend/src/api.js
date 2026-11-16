const configuredBase = import.meta.env.VITE_API_BASE_URL || "";
const normalizedBase = configuredBase.trim().replace(/\/+$/, "");
// VITE_API_BASE_URL is an origin, not an endpoint path. Accept a mistaken
// trailing /api as well, since every request path already includes /api.
export const API_BASE_URL = normalizedBase.replace(/\/api$/i, "");

export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
