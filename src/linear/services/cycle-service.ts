/**
 * Cycle domain service (plan §10.11).
 *
 * {@link LinearCycleService} is the M3 implementation over
 * {@link LinearClientFactoryLike} and the team resolver: the team name/key
 * resolves to its ID (§14), then the team's cycles are fetched with a
 * Linear-native `filter` (CycleFilter.team — verified against the
 * @linear/sdk schema), paged and mapped to canonical CycleSummaries.
 */
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import { normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import type { TeamResolver } from "../resolver/team.ts";

export interface CycleSummary {
  id: string;
  name: string;
  startsAt?: string;
  endsAt?: string;
  completedAt?: string;
}

export interface ListCyclesQuery {
  /** Team name or key (required to scope cycles). */
  team: string;
  /** Page size, clamped to [1, 50]; default 20. */
  limit?: number;
  /** Pagination cursor from a previous result. */
  cursor?: string;
}

export interface CycleService {
  listCycles(query: ListCyclesQuery): Promise<PagedResult<CycleSummary>>;
}

export interface CycleServiceOptions {
  /** Default page size when the query omits `limit` (plan §33). */
  listLimit?: number;
}

/** Structural view of the SDK Cycle model (plan §64). */
export interface SdkCycleViewLike {
  id: string;
  name?: string | null;
  startsAt: Date;
  endsAt: Date;
  completedAt?: Date | null;
}

export interface CycleClientLike {
  cycles(variables: { filter?: Record<string, unknown>; first: number; after?: string }): Promise<{
    nodes: SdkCycleViewLike[];
    pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
  }>;
}

export class LinearCycleService implements CycleService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly teams: TeamResolver,
    private readonly options: CycleServiceOptions = {},
  ) {}

  async listCycles(query: ListCyclesQuery): Promise<PagedResult<CycleSummary>> {
    const limit = normalizeLimit(query.limit ?? this.options.listLimit);
    const team = await this.teams.resolveTeam(query.team);
    try {
      const client = (await this.factory.create()) as unknown as CycleClientLike;
      const connection = await client.cycles({
        filter: { team: { id: { eq: team.id } } },
        first: limit,
        after: query.cursor ?? undefined,
      });
      const items: CycleSummary[] = connection.nodes.map((cycle) => ({
        id: cycle.id,
        name: cycle.name ?? "",
        startsAt: cycle.startsAt.toISOString(),
        endsAt: cycle.endsAt.toISOString(),
        completedAt: cycle.completedAt?.toISOString(),
      }));
      return toPagedResult(items, connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
