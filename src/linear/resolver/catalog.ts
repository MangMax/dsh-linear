/**
 * Metadata catalog substrate (plan §14.2).
 *
 * The resolvers match human names against workspace metadata. This loader
 * pages every connection to exhaustion — a resolver must never silently miss
 * an entity that lives beyond the first page — and caches the result in
 * memory for 5 minutes. Concurrent loads of the same catalog are
 * single-flighted (one fetch, shared promise); failed loads are not cached so
 * the next call retries.
 *
 * Cache policy (plan §14.2): teams, workflow states, labels, users and
 * projects may be cached; issue details and comments never are (they live in
 * the services, not here).
 *
 * States are scoped per team (a WorkflowState belongs to exactly one team's
 * workflow, and the SDK model carries no `teamId` scalar): they are loaded
 * through `client.team(id).states()` and cached per team id.
 */
import type { LinearClientFactoryLike } from "../client-factory.ts";
import type { LinearSdkModel } from "../sdk-model.ts";
import type {
  SdkLabelView,
  SdkProjectView,
  SdkTeamView,
  SdkUserView,
  SdkWorkflowStateView,
} from "../services/issue-mapper.ts";

/** In-memory catalog TTL (plan §14.2). */
export const METADATA_CACHE_TTL_MS = 5 * 60_000;

/** Page size used while walking catalog connections to exhaustion. */
export const CATALOG_PAGE_SIZE = 100;

/** Safety bound: a catalog larger than this many pages is treated as broken
 * rather than looped forever (Linear connections normally terminate with
 * `hasNextPage: false`). */
const MAX_CATALOG_PAGES = 50;

type WorkspaceCatalog = SdkTeamView[] | SdkProjectView[] | SdkUserView[] | SdkLabelView[];

type Connection<T = unknown> = {
  nodes: T[];
  pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
};

type WorkspaceFetcher = (client: LinearSdkModel, after?: string) => Promise<Connection>;

interface CacheEntry<T> {
  loadedAt: number;
  promise: Promise<T>;
}

/** Paged-fetch descriptors for the workspace-wide catalogs. */
const WORKSPACE_FETCHERS: Record<"teams" | "projects" | "users" | "labels", WorkspaceFetcher> = {
  teams: (client, after) => client.teams({ first: CATALOG_PAGE_SIZE, after }),
  projects: (client, after) => client.projects({ first: CATALOG_PAGE_SIZE, after }),
  users: (client, after) => client.users({ first: CATALOG_PAGE_SIZE, after }),
  labels: (client, after) => client.issueLabels({ first: CATALOG_PAGE_SIZE, after }),
};

export class LinearMetadataCatalog {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly workspace = new Map<string, CacheEntry<WorkspaceCatalog>>();
  private readonly perTeam = new Map<string, CacheEntry<SdkWorkflowStateView[]>>();

  constructor(
    private readonly factory: LinearClientFactoryLike,
    options: { ttlMs?: number; now?: () => number } = {},
  ) {
    this.ttlMs = options.ttlMs ?? METADATA_CACHE_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  async getTeams(): Promise<SdkTeamView[]> {
    return (await this.workspaceEntry("teams", WORKSPACE_FETCHERS.teams)) as SdkTeamView[];
  }

  async getProjects(): Promise<SdkProjectView[]> {
    return (await this.workspaceEntry("projects", WORKSPACE_FETCHERS.projects)) as SdkProjectView[];
  }

  async getUsers(): Promise<SdkUserView[]> {
    return (await this.workspaceEntry("users", WORKSPACE_FETCHERS.users)) as SdkUserView[];
  }

  async getLabels(): Promise<SdkLabelView[]> {
    return (await this.workspaceEntry("labels", WORKSPACE_FETCHERS.labels)) as SdkLabelView[];
  }

  /** The workflow states of one team, paged to exhaustion and cached per team. */
  async getStates(teamId: string): Promise<SdkWorkflowStateView[]> {
    const now = this.now();
    const cached = this.perTeam.get(teamId);
    if (cached && now - cached.loadedAt < this.ttlMs) {
      return cached.promise;
    }

    const promise = this.loadStates(teamId);
    this.perTeam.set(teamId, { loadedAt: now, promise });
    try {
      return await promise;
    } catch (err) {
      this.perTeam.delete(teamId);
      throw err;
    }
  }

  /** Drop every cached catalog — used by tests and (future) reconnect paths. */
  clear(): void {
    this.workspace.clear();
    this.perTeam.clear();
  }

  // ------------------------------------------------------------ internals

  private async workspaceEntry(kind: string, fetch: WorkspaceFetcher): Promise<WorkspaceCatalog> {
    const now = this.now();
    const cached = this.workspace.get(kind);
    if (cached && now - cached.loadedAt < this.ttlMs) {
      return cached.promise;
    }

    const promise = this.loadWorkspace(fetch);
    this.workspace.set(kind, { loadedAt: now, promise });
    try {
      return await promise;
    } catch (err) {
      this.workspace.delete(kind);
      throw err;
    }
  }

  private async loadWorkspace(fetch: WorkspaceFetcher): Promise<WorkspaceCatalog> {
    const client = await this.factory.create();
    const nodes: unknown[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_CATALOG_PAGES; page += 1) {
      const connection = await fetch(client, after);
      nodes.push(...connection.nodes);
      if (!connection.pageInfo?.hasNextPage) break;
      after = connection.pageInfo.endCursor ?? undefined;
      if (!after) break; // defensive: hasNextPage without a cursor cannot continue
    }
    return nodes as WorkspaceCatalog;
  }

  private async loadStates(teamId: string): Promise<SdkWorkflowStateView[]> {
    const client = await this.factory.create();
    const team = await client.team(teamId);
    if (!team) {
      return [];
    }
    const nodes: SdkWorkflowStateView[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_CATALOG_PAGES; page += 1) {
      const connection = await team.states({ first: CATALOG_PAGE_SIZE, after });
      nodes.push(...connection.nodes);
      if (!connection.pageInfo?.hasNextPage) break;
      after = connection.pageInfo.endCursor ?? undefined;
      if (!after) break;
    }
    return nodes;
  }
}
