/**
 * Shared pagination contract for every list/search tool (plan §33).
 *
 * Rules enforced by the domain layer:
 * - default page size: {@link DEFAULT_LIMIT} (20)
 * - hard cap: {@link MAX_LIMIT} (50)
 * - `hasMore`/`nextCursor` must be returned so the model can explicitly
 *   continue instead of fetching the whole workspace.
 */
export interface PagedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
}

/** Default page size for list/search tools. */
export const DEFAULT_LIMIT = 20;

/** Hard cap for list/search tools; larger requested values are clamped. */
export const MAX_LIMIT = 50;

/** Clamp a requested page size into [1, MAX_LIMIT]. */
export function normalizeLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}
