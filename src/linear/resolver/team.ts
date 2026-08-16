/**
 * Team resolver (plan §14).
 *
 * Resolves human-facing team references ("Engineering", "ENG") to stable
 * Linear team IDs, following the match priority in §14.1:
 *
 *   exact ID → exact key → exact name → case-insensitive exact →
 *   unique normalized match
 *
 * Multiple candidates must NOT be guessed: raise an `AMBIGUOUS_REFERENCE`
 * error listing the candidates so the Agent / user can choose.
 */
import type { LinearMetadataCatalog } from "./catalog.ts";
import { matchByName } from "./matching.ts";

export interface TeamRef {
  id: string;
  key: string;
  name: string;
}

export interface TeamResolver {
  resolveTeam(ref: string): Promise<TeamRef>;
}

/** {@link TeamResolver} over the shared metadata catalog. */
export class LinearTeamResolver implements TeamResolver {
  constructor(private readonly catalog: LinearMetadataCatalog) {}

  async resolveTeam(ref: string): Promise<TeamRef> {
    const teams = await this.catalog.getTeams();
    return matchByName("team", teams, ref, [{ field: "key" }]);
  }
}
