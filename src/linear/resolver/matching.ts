/**
 * Metadata name matching (plan §14.1).
 *
 * Every resolver follows the same priority chain:
 *
 *   exact ID → exact key → exact name → case-insensitive exact →
 *   unique normalized match
 *
 * Multiple candidates are NEVER guessed: they raise an `AMBIGUOUS_REFERENCE`
 * error listing the candidate names so the Agent / user can pick. A reference
 * that matches nothing raises `NOT_FOUND`.
 */
import { LinearConnectorError } from "../error.ts";

/** The minimum surface any matchable catalog entity exposes. */
export interface MatchableBase {
  id: string;
  name: string;
}

/**
 * Extra identity fields tried before the name chain (team `key`, user
 * `email`, …). Exact matches are tried in declaration order.
 */
export type IdentityField = { field: string };

/** Collapse whitespace and lowercase — the "normalized" form in §14.1. */
export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function ambiguous<T extends MatchableBase>(
  kind: string,
  value: string,
  candidates: readonly T[],
): never {
  throw LinearConnectorError.ambiguous(
    kind,
    value,
    candidates.map((candidate) => candidate.name),
  );
}

/**
 * Resolve a human-facing reference against a catalog with the §14.1 priority.
 *
 * `fields` are the extra identity fields tried before the name chain (e.g.
 * team key, user email). Every stage treats "exactly one hit" as success and
 * "more than one hit" as ambiguity — a match must be unique to be a match.
 */
export function matchByName<T extends MatchableBase>(
  kind: string,
  entities: readonly T[],
  ref: string,
  fields: readonly IdentityField[] = [],
): T {
  const value = ref.trim();
  if (!value) {
    throw LinearConnectorError.validation(`${kind} reference must not be empty.`);
  }

  // 1. exact ID (stable Linear UUIDs).
  const byId = entities.find((entity) => entity.id === value);
  if (byId) return byId;

  // 2. exact identity fields (team key, user email, …).
  for (const { field } of fields) {
    const hits = entities.filter(
      (entity) => (entity as unknown as Record<string, string | undefined>)[field] === value,
    );
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) ambiguous(kind, value, hits);
  }

  // 3. exact name (case-sensitive).
  const byName = entities.filter((entity) => entity.name === value);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) ambiguous(kind, value, byName);

  // 4. case-insensitive exact name.
  const lowered = value.toLowerCase();
  const byCase = entities.filter((entity) => entity.name.toLowerCase() === lowered);
  if (byCase.length === 1) return byCase[0];
  if (byCase.length > 1) ambiguous(kind, value, byCase);

  // 5. unique normalized match (whitespace / case folded).
  const normalized = normalizeName(value);
  const byNormalized = entities.filter((entity) => normalizeName(entity.name) === normalized);
  if (byNormalized.length === 1) return byNormalized[0];
  if (byNormalized.length > 1) ambiguous(kind, value, byNormalized);

  throw LinearConnectorError.notFound(kind, value);
}
