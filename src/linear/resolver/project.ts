/**
 * Project resolver (plan §14).
 *
 * Resolves human-facing project names ("Backend") to stable Linear project
 * IDs with the §14.1 match priority. Ambiguity must surface as an
 * `AMBIGUOUS_REFERENCE` error, never a guess.
 *
 * {@link parseProjectReference} is the shared entry point for the
 * `getProject`-style tools: a raw reference is a stable ID (16-char Linear
 * UUID), a Linear project URL, or a plain name.
 */
import type { LinearMetadataCatalog } from "./catalog.ts";
import { LinearConnectorError } from "../error.ts";
import { matchByName } from "./matching.ts";

export interface ProjectRef {
  id: string;
  name: string;
}

export interface ProjectResolver {
  resolveProject(ref: string): Promise<ProjectRef>;
}

/** Linear project UUIDs are exactly 16 chars of base62 (same as issues). */
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9]{16}$/;
/** Linear project URL: `https://linear.app/<org>/project/<slugId>/<name>`. */
const PROJECT_URL_PATTERN = /linear\.app\/[^/?#]+\/project\/([^/?#]+)/;

export type ProjectReference = { kind: "id"; value: string } | { kind: "name"; value: string };

/**
 * Normalize a project reference into the form the domain layer consumes.
 * Direct IDs and URL id segments are returned untouched so services can look
 * them up without a resolver round-trip; everything else is treated as a
 * name (URL name segments are URL-decoded). Throws VALIDATION_ERROR for
 * empty input — never guesses.
 */
export function parseProjectReference(raw: string): ProjectReference {
  const ref = raw.trim();
  if (!ref) {
    throw LinearConnectorError.validation("project reference must not be empty.");
  }

  if (PROJECT_ID_PATTERN.test(ref)) {
    return { kind: "id", value: ref };
  }

  const urlMatch = PROJECT_URL_PATTERN.exec(ref);
  if (urlMatch?.[1]) {
    const segment = urlMatch[1];
    if (PROJECT_ID_PATTERN.test(segment)) {
      return { kind: "id", value: segment };
    }
    return { kind: "name", value: decodeURIComponent(segment) };
  }

  return { kind: "name", value: ref };
}

/** {@link ProjectResolver} over the shared metadata catalog. */
export class LinearProjectResolver implements ProjectResolver {
  constructor(private readonly catalog: LinearMetadataCatalog) {}

  async resolveProject(ref: string): Promise<ProjectRef> {
    const parsed = parseProjectReference(ref);
    const projects = await this.catalog.getProjects();
    if (parsed.kind === "id") {
      const byId = projects.find((project) => project.id === parsed.value);
      if (!byId) {
        throw LinearConnectorError.notFound("project", parsed.value);
      }
      return byId;
    }
    return matchByName("project", projects, parsed.value);
  }
}
