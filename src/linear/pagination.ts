/**
 * Linear SDK pagination → canonical {@link PagedResult} mapping (plan §33).
 *
 * The SDK exposes Relay-style `pageInfo` on connection objects. This module
 * maps that into the stable canonical cursor contract so tools and the model
 * never depend on SDK pagination shapes. When the SDK seam is replaced or
 * upgraded, only this file changes.
 *
 * Lossless-JSON note (surfaced by the real harness run): the tool pipeline
 * rejects output values containing `undefined` property values, so absent
 * cursors are OMITTED from the canonical shape rather than carried as
 * `undefined`.
 */
import type { PagedResult } from "../model/pagination.ts";

/** Minimal structural view of the SDK page info we consume. */
export interface PageInfoLike {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export function toPagedResult<T>(items: T[], pageInfo?: PageInfoLike): PagedResult<T> {
  const hasMore = pageInfo?.hasNextPage === true;
  return {
    items,
    hasMore,
    ...(hasMore && pageInfo?.endCursor ? { nextCursor: pageInfo.endCursor } : {}),
  };
}
