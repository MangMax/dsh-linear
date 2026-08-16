/**
 * Label resolver (plan §14).
 *
 * Resolves human-facing label names (["bug", "backend"]) to stable Linear
 * label IDs with the §14.1 match priority. Ambiguity must surface as an
 * `AMBIGUOUS_REFERENCE` error, never a guess. Unknown names surface as
 * `NOT_FOUND` — the write path must not create issues with phantom labels.
 */
import type { LinearMetadataCatalog } from "./catalog.ts";
import { matchByName } from "./matching.ts";

export interface LabelRef {
  id: string;
  name: string;
}

export interface LabelResolver {
  resolveLabels(refs: string[]): Promise<LabelRef[]>;
}

/** {@link LabelResolver} over the shared metadata catalog. */
export class LinearLabelResolver implements LabelResolver {
  constructor(private readonly catalog: LinearMetadataCatalog) {}

  async resolveLabels(refs: string[]): Promise<LabelRef[]> {
    const labels = await this.catalog.getLabels();
    return refs.map((ref) => matchByName("label", labels, ref));
  }
}
