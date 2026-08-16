/**
 * Issue reference resolution (plan §31).
 *
 * The model feeds issue references in three shapes and the domain layer must
 * accept all of them:
 *
 * - identifier: `ENG-123` / `eng-123`
 * - URL: `https://linear.app/<org>/issue/ENG-123/<slug>`
 * - UUID: `d5e4f3a2b1c0d9e8` (Linear's 16-char id) or a canonical UUID
 *
 * The Linear GraphQL `issue(id:)` field accepts both the UUID and the
 * identifier, so resolution is a normalization step before the SDK call —
 * no extra lookup round-trip.
 */
import { LinearConnectorError } from "./error.ts";

export type IssueReference = { kind: "id"; value: string } | { kind: "identifier"; value: string };

/** Linear UUIDs are exactly 16 chars of base62 (e.g. `d5e4f3a2b1c0d9e8`). */
const LINEAR_ID_PATTERN = /^[a-zA-Z0-9]{16}$/;
/** Canonical UUIDs (8-4-4-4-12 hex). */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/** Team key + number, e.g. `ENG-123`. */
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9]+-\d+$/;
/** Linear issue URL: `https://linear.app/<org>/issue/<IDENTIFIER>/<slug>`. */
const URL_PATTERN = /linear\.app\/[^/?#]+\/issue\/([^/?#]+)/;

/**
 * Normalize a user- or model-supplied issue reference into the form the
 * Linear API expects. Throws VALIDATION_ERROR for anything unrecognizable —
 * never guesses.
 */
export function parseIssueReference(raw: string): IssueReference {
  const ref = raw.trim();
  if (!ref) {
    throw LinearConnectorError.validation("issue reference must not be empty.");
  }

  if (LINEAR_ID_PATTERN.test(ref) || UUID_PATTERN.test(ref)) {
    return { kind: "id", value: ref };
  }

  if (IDENTIFIER_PATTERN.test(ref)) {
    return { kind: "identifier", value: ref.toUpperCase() };
  }

  const urlMatch = URL_PATTERN.exec(ref);
  if (urlMatch?.[1]) {
    const fromUrl = urlMatch[1];
    if (IDENTIFIER_PATTERN.test(fromUrl)) {
      return { kind: "identifier", value: fromUrl.toUpperCase() };
    }
    if (LINEAR_ID_PATTERN.test(fromUrl) || UUID_PATTERN.test(fromUrl)) {
      return { kind: "id", value: fromUrl };
    }
  }

  throw LinearConnectorError.validation(
    `"${ref}" is not a Linear issue reference. Use an identifier such as ENG-123, a Linear issue URL, or an issue UUID.`,
  );
}
