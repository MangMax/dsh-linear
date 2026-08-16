/**
 * Project domain service (plan §10.8, §10.9).
 *
 * {@link LinearProjectService} is the M3 implementation over
 * {@link LinearClientFactoryLike} and the team resolver:
 *
 * - `listProjects` pushes every filter down to Linear-native conditions
 *   (plan §32): team resolves to its ID via the TeamResolver (§14), status
 *   matches the project status entity by name, free text matches the name
 *   containsIgnoreCase. Filters verified against the @linear/sdk schema
 *   (ProjectFilter.accessibleTeams / status / name).
 * - `getProject` accepts a name, an ID, or a Linear project URL; IDs are
 *   looked up directly (no stale-catalog round-trip), names go through the
 *   ProjectResolver.
 *
 * Projects have no `teamIds` scalar in the SDK model, so the teams attached
 * to each summary are fetched via bounded parallel connection calls.
 */
import type { ProjectDetail, ProjectSummary } from "../../model/project.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import { parseProjectReference, type ProjectResolver } from "../resolver/project.ts";
import type { TeamResolver } from "../resolver/team.ts";

export interface ListProjectsQuery {
  /** Team name or key to narrow the result. */
  team?: string;
  /** Project status name, e.g. "In Progress" / "Planned" / "Completed". */
  state?: string;
  /** Free-text name filter. */
  query?: string;
  /** Page size, clamped to [1, 50]; default 20. */
  limit?: number;
  /** Pagination cursor from a previous result. */
  cursor?: string;
}

export interface ProjectService {
  listProjects(query?: ListProjectsQuery): Promise<PagedResult<ProjectSummary>>;
  /** `ref` is a project name, ID, or URL. */
  getProject(ref: string): Promise<ProjectDetail>;
}

export interface ProjectServiceOptions {
  /** Default page size when the query omits `limit` (plan §33). */
  listLimit?: number;
}

const PROJECT_TEAMS_LIMIT = 50;
const PROJECT_UPDATES_LIMIT = 5;

/** Structural views of the SDK Project model (plan §64). Entity fields are
 * treated as possibly-lazy so both eager and promise-backed SDK versions
 * map identically. */
export interface SdkProjectViewLike {
  id: string;
  name: string;
  url: string;
  progress: number;
  description?: string | null;
  state?: string | null;
  status?: { id?: string; name?: string } | Promise<{ id?: string; name?: string }> | null;
  lead?: { id: string; name: string } | Promise<{ id: string; name: string }> | null;
  targetDate?: string | null;
  teams(args: { first: number }): Promise<{
    nodes: Array<{ id: string; key: string; name: string }>;
  }>;
  /** SDK v90 calls the connection `projectUpdates` (renamed from `updates`). */
  projectUpdates(args: { first: number }): Promise<{
    nodes: Array<{
      id: string;
      body: string;
      createdAt: Date;
      user?: { id: string; name: string } | Promise<{ id: string; name: string }> | null;
    }>;
  }>;
}

export interface ProjectClientLike {
  projects(variables: {
    filter?: Record<string, unknown>;
    first: number;
    after?: string;
  }): Promise<{
    nodes: SdkProjectViewLike[];
    pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
  }>;
  project(id: string): Promise<SdkProjectViewLike | undefined>;
}

async function awaitable<T>(
  value: T | Promise<T> | null | undefined,
): Promise<T | null | undefined> {
  return value == null ? undefined : await value;
}

export class LinearProjectService implements ProjectService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly projectsResolver: ProjectResolver,
    private readonly teamsResolver: TeamResolver,
    private readonly options: ProjectServiceOptions = {},
  ) {}

  async listProjects(query: ListProjectsQuery = {}): Promise<PagedResult<ProjectSummary>> {
    const limit = normalizeLimit(query.limit ?? this.options.listLimit);
    const filter = await this.buildListFilter(query);
    try {
      const client = (await this.factory.create()) as unknown as ProjectClientLike;
      const connection = await client.projects({
        filter,
        first: limit,
        after: query.cursor ?? undefined,
      });
      const items = await Promise.all(connection.nodes.map(mapProjectSummary));
      return toPagedResult(items, connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getProject(ref: string): Promise<ProjectDetail> {
    const parsed = parseProjectReference(ref);
    try {
      const client = (await this.factory.create()) as unknown as ProjectClientLike;
      const project =
        parsed.kind === "id"
          ? await client.project(parsed.value)
          : await this.resolveByName(client, parsed.value);
      if (!project) {
        throw LinearConnectorError.notFound("project", ref);
      }
      return await mapProjectDetail(project);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  private async resolveByName(
    client: ProjectClientLike,
    name: string,
  ): Promise<SdkProjectViewLike | undefined> {
    const resolved = await this.projectsResolver.resolveProject(name);
    return client.project(resolved.id);
  }

  /** Team names resolve to IDs; status and free text stay name-based because
   * they are matched by Linear against the project's own status / name. */
  private async buildListFilter(
    query: ListProjectsQuery,
  ): Promise<Record<string, unknown> | undefined> {
    const filter: Record<string, unknown> = {};
    if (query.team?.trim()) {
      const team = await this.teamsResolver.resolveTeam(query.team);
      filter.accessibleTeams = { some: { id: { eq: team.id } } };
    }
    if (query.state?.trim()) {
      filter.status = { name: { eqIgnoreCase: query.state.trim() } };
    }
    if (query.query?.trim()) {
      filter.name = { containsIgnoreCase: query.query.trim() };
    }
    return Object.keys(filter).length > 0 ? filter : undefined;
  }
}

// ------------------------------------------------------------------ mapping

/** 0..1 → 0..100 integer completion percentage (plan §12). */
function progressPercent(progress: number | null | undefined): number | undefined {
  if (progress === null || progress === undefined || !Number.isFinite(progress)) {
    return undefined;
  }
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

export async function mapProjectSummary(project: SdkProjectViewLike): Promise<ProjectSummary> {
  const [status, lead, teams] = await Promise.all([
    awaitable(project.status),
    awaitable(project.lead),
    project.teams({ first: PROJECT_TEAMS_LIMIT }),
  ]);
  return {
    id: project.id,
    name: project.name,
    url: project.url,
    status: status?.name ?? project.state ?? undefined,
    lead: lead ? { id: lead.id, name: lead.name } : undefined,
    teams: teams.nodes.map((team) => ({ id: team.id, key: team.key, name: team.name })),
    targetDate: project.targetDate ?? undefined,
    progress: progressPercent(project.progress),
  };
}

export async function mapProjectDetail(project: SdkProjectViewLike): Promise<ProjectDetail> {
  const [summary, updates] = await Promise.all([
    mapProjectSummary(project),
    project.projectUpdates({ first: PROJECT_UPDATES_LIMIT }),
  ]);
  // Defensive truncation: the detail DTO promises a small window regardless
  // of what the SDK connection returns (plan §10.9).
  const recentUpdates = await Promise.all(
    updates.nodes.slice(0, PROJECT_UPDATES_LIMIT).map(async (update) => {
      const author = await awaitable(update.user);
      return {
        id: update.id,
        body: update.body,
        createdAt: update.createdAt.toISOString(),
        author: author ? { id: author.id, name: author.name } : undefined,
      };
    }),
  );
  return {
    ...summary,
    description: project.description ?? undefined,
    recentUpdates,
  };
}
