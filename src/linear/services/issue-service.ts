/**
 * Issue domain service (plan §30).
 *
 * The single seam between tools and the Linear SDK for issues. Implementations
 * use the {@link LinearClientFactoryLike} and the shared
 * {@link LinearMetadataResolver} and return canonical DTOs only.
 *
 * Milestone 2 (plan §75) shipped the read path — {@link IssueReadService} and
 * its {@link LinearIssueService} implementation — so the agent can query a
 * real Linear workspace. Milestone 3 formalized the name → ID resolution:
 * search filters are resolved through the MetadataResolver (§14.1) and pushed
 * down as ID-based native filters (§32), and every id → name mapping for
 * results / comments is served by the resolver's cached catalog (§14.2).
 * Milestone 4 ships the write path — {@link LinearIssueService#createIssue}
 * and {@link LinearIssueService#updateIssue} — completing the full
 * {@link IssueService} contract: every user-facing name is resolved to a
 * Linear ID (§2.5), mutations are explicit-field only (§10.6), and failures
 * normalize to {@link LinearConnectorError}.
 */
import type { IssueContext, IssueDetail, IssueSummary, PriorityInput } from "../../model/issue.ts";
import { priorityToValue } from "../../model/issue.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import { parseIssueReference } from "../issue-reference.ts";
import { toPagedResult } from "../pagination.ts";
import type {
  SdkIssueCreateInput,
  SdkIssueModelExtras,
  SdkIssueUpdateInput,
  SdkIssueViewLike,
} from "../sdk-model.ts";
import type { SdkIssueView } from "./issue-mapper.ts";
import type { MetadataResolver } from "../resolver/index.ts";
import {
  indexById,
  mapComment,
  mapIssueDetail,
  mapIssueSummary,
  type IssueSummaryCatalogs,
  type SdkCommentView,
  type SdkLabelView,
  type SdkProjectView,
  type SdkRelationView,
  type SdkTeamView,
  type SdkUserView,
  type SdkWorkflowStateView,
} from "./issue-mapper.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";

export interface SearchIssuesQuery {
  /** Free-text search. */
  query?: string;
  /** Team name or key, e.g. "Engineering" / "ENG". */
  team?: string;
  /** Project name. */
  project?: string;
  /** Workflow status name, e.g. "In Progress". */
  status?: string;
  /** Assignee name or email. */
  assignee?: string;
  priority?: PriorityInput;
  labels?: string[];
  /** Cycle name. */
  cycle?: string;
  /** Include completed issues (default: false). */
  includeCompleted?: boolean;
  /** Page size, clamped to [1, 50]; default 20 (plan §33). */
  limit?: number;
  /** Pagination cursor from a previous result. */
  cursor?: string;
}

export interface CreateIssueCommand {
  title: string;
  description?: string;
  team?: string;
  project?: string;
  status?: string;
  assignee?: string;
  priority?: PriorityInput;
  labels?: string[];
  /** ISO date string. */
  dueDate?: string;
}

/** Explicit-field-only update; arbitrary payloads are rejected (plan §10.6). */
export interface UpdateIssueCommand {
  issue: string;
  title?: string;
  description?: string;
  project?: string | null;
  status?: string;
  assignee?: string | null;
  priority?: PriorityInput;
  labels?: string[];
  dueDate?: string | null;
}

export interface GetIssueContextOptions {
  /** Default 20; capped (plan §10.4). */
  commentsLimit?: number;
}

export interface IssueService {
  getIssue(ref: string): Promise<IssueDetail>;
  getIssueContext(ref: string, options?: GetIssueContextOptions): Promise<IssueContext>;
  searchIssues(query: SearchIssuesQuery): Promise<PagedResult<IssueSummary>>;
  createIssue(input: CreateIssueCommand): Promise<IssueDetail>;
  updateIssue(input: UpdateIssueCommand): Promise<IssueDetail>;
}

/**
 * Read-only issue seam (Milestone 2 scope).
 *
 * Tools and the connection layer depend on this narrow contract until the
 * write tools land in Milestone 4 (then {@link LinearIssueService} will
 * implement the full {@link IssueService}).
 */
export interface IssueReadService {
  getIssue(ref: string): Promise<IssueDetail>;
  getIssueContext(ref: string, options?: GetIssueContextOptions): Promise<IssueContext>;
  searchIssues(query: SearchIssuesQuery): Promise<PagedResult<IssueSummary>>;
}

export interface IssueServiceOptions {
  /** Default page size when the query omits `limit` (plan §33). */
  searchLimit?: number;
  /** Default comment window for getIssueContext (plan §10.4). */
  commentsLimit?: number;
  /** Team name/key used by `createIssue` when the input omits `team` (plan §26). */
  defaultTeam?: string;
  /** Project name used by `createIssue` when the input omits `project` (plan §26). */
  defaultProject?: string;
}

/** Catalog seam for id → name mapping (plan §14.2). */
export interface IssueCatalogSource {
  getTeams(): Promise<SdkTeamView[]>;
  getUsers(): Promise<SdkUserView[]>;
  getProjects(): Promise<SdkProjectView[]>;
  getLabels(): Promise<SdkLabelView[]>;
  getStates(teamId: string): Promise<SdkWorkflowStateView[]>;
}

/** Everything the issue read path needs from the metadata layer. */
export type IssueMetadata = MetadataResolver & { catalog: IssueCatalogSource };

const LABEL_PAGE_SIZE = 50;
const RELATION_PAGE_SIZE = 30;

/**
 * {@link IssueService} implementation over the Linear SDK (read path M2/M3,
 * write path M4).
 *
 * Query strategy (plan §32): every supported filter is pushed down to a
 * Linear-native `filter` — never download-then-filter. Free text uses the
 * SDK `searchIssues` term; structured filters use `issues`. Name-shaped
 * filters are resolved to IDs by the MetadataResolver first (§14.1) so
 * unknown names fail loudly and ambiguous names never produce a wrong page;
 * relations whose names are inherently precise (cycle names are team-local,
 * status without a team is evaluated per issue by Linear) stay name-based.
 * Nested names in the result are resolved from the shared cached catalog
 * (§14.2), avoiding per-issue follow-up queries.
 *
 * Write strategy (M4): `createIssue` and `updateIssue` accept the same human
 * semantic names (§2.5) and resolve them to IDs BEFORE the mutation — a
 * phantom team / project / status / assignee / label can never be written.
 * The mutation payload carries only the explicitly requested fields
 * (§10.6); `project` / `assignee` / `dueDate` accept `null` to clear.
 * Status names resolve against the team context (the target team for
 * create, the existing issue's team for update — states are team-scoped).
 */
export class LinearIssueService implements IssueService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly metadata: IssueMetadata,
    private readonly options: IssueServiceOptions = {},
  ) {}

  async getIssue(ref: string): Promise<IssueDetail> {
    const parsed = parseIssueReference(ref);
    const client = await this.factory.create();
    try {
      const issue = await client.issue(parsed.value);
      if (!issue) {
        throw LinearConnectorError.notFound("issue", ref);
      }
      return await this.mapDetail(issue);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getIssueContext(ref: string, options: GetIssueContextOptions = {}): Promise<IssueContext> {
    const commentsLimit = normalizeLimit(options.commentsLimit ?? this.options.commentsLimit);
    const parsed = parseIssueReference(ref);
    const client = await this.factory.create();
    try {
      const issue = await client.issue(parsed.value);
      if (!issue) {
        throw LinearConnectorError.notFound("issue", ref);
      }
      const [detail, commentNodes, users] = await Promise.all([
        this.mapDetail(issue),
        issue.comments({ first: commentsLimit }).then((connection) => connection.nodes),
        this.metadata.catalog.getUsers(),
      ]);
      const authors = new Map(users.map((user) => [user.id, user]));
      const comments: SdkCommentView[] = commentNodes.map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        author: comment.userId ? authors.get(comment.userId) : undefined,
      }));
      return { issue: detail, comments: comments.map(mapComment) };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async searchIssues(query: SearchIssuesQuery): Promise<PagedResult<IssueSummary>> {
    const limit = normalizeLimit(query.limit ?? this.options.searchLimit);
    const resolved = await this.resolveSearchFilters(query);
    const filter = buildIssueFilter(resolved);
    const client = await this.factory.create();
    try {
      const connection = query.query?.trim()
        ? await client.searchIssues(query.query.trim(), {
            filter,
            after: query.cursor ?? undefined,
            first: limit,
          })
        : await client.issues({
            filter,
            after: query.cursor ?? undefined,
            first: limit,
          });
      const nodes = connection.nodes ?? [];
      const catalogs = await this.loadResultCatalogs(nodes);
      const items = nodes.map((node) => mapIssueSummary(toIssueView(node), catalogs));
      return toPagedResult(items, connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  /**
   * Create an issue (plan §10.5, §30). Every name-shaped field is resolved
   * to a Linear ID before the mutation; the team is required — from the
   * input or the configured `defaultTeam` — and unknown/ambiguous names fail
   * before anything is written. The created issue is re-fetched and mapped
   * to the canonical detail DTO.
   */
  async createIssue(input: CreateIssueCommand): Promise<IssueDetail> {
    const title = input.title?.trim();
    if (!title) {
      throw LinearConnectorError.validation("title is required to create an issue.");
    }
    const teamRef = input.team?.trim() || this.options.defaultTeam?.trim();
    if (!teamRef) {
      throw LinearConnectorError.validation(
        'No team specified. Pass team (name or key, e.g. "Engineering" or "ENG") or set linear.defaultTeam in the plugin config.',
      );
    }
    const team = await this.metadata.resolveTeam(teamRef);
    const projectRef = input.project?.trim() || this.options.defaultProject?.trim();
    const [project, state, assignee, labels] = await Promise.all([
      projectRef ? this.metadata.resolveProject(projectRef) : undefined,
      input.status?.trim()
        ? this.metadata.resolveWorkflowState(team.id, input.status.trim())
        : undefined,
      input.assignee?.trim() ? this.metadata.resolveUser(input.assignee.trim()) : undefined,
      input.labels?.length ? this.metadata.resolveLabels(input.labels) : undefined,
    ]);
    const dueDate = validateDueDate(input.dueDate);
    const payload: SdkIssueCreateInput = {
      teamId: team.id,
      title,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(project ? { projectId: project.id } : {}),
      ...(state ? { stateId: state.id } : {}),
      ...(assignee ? { assigneeId: assignee.id } : {}),
      ...(priorityToValue(input.priority) !== undefined
        ? { priority: priorityToValue(input.priority) }
        : {}),
      ...(labels?.length ? { labelIds: labels.map((label) => label.id) } : {}),
      ...(dueDate ? { dueDate } : {}),
    };
    const client = await this.factory.create();
    try {
      const result = await client.createIssue(payload);
      if (!result?.issue) {
        throw LinearConnectorError.validation(
          "Linear did not return the created issue. Verify the workspace allows issue creation.",
        );
      }
      return await this.mapDetail(await result.issue);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  /**
   * Update an issue with explicit fields only (plan §10.6). The existing
   * issue is resolved first to learn its team (workflow states are
   * team-scoped), then every provided name is resolved and the mutation is
   * sent with ONLY those fields. `project` / `assignee` / `dueDate` accept
   * `null` to clear them. The updated issue is re-fetched and mapped.
   */
  async updateIssue(input: UpdateIssueCommand): Promise<IssueDetail> {
    const parsed = parseIssueReference(input.issue);
    const hasFields =
      input.title?.trim() ||
      input.description?.trim() ||
      input.project !== undefined ||
      input.status?.trim() ||
      input.assignee !== undefined ||
      input.priority !== undefined ||
      input.labels !== undefined ||
      input.dueDate !== undefined;
    if (!hasFields) {
      throw LinearConnectorError.validation("updateIssue requires at least one field to change.");
    }

    const client = await this.factory.create();
    let teamId: string | undefined;
    try {
      const existing = await client.issue(parsed.value);
      if (!existing) {
        throw LinearConnectorError.notFound("issue", input.issue);
      }
      teamId = existing.teamId;
    } catch (err) {
      throw normalizeLinearError(err);
    }
    if (input.status?.trim() && !teamId) {
      throw LinearConnectorError.validation(
        "Cannot resolve status: the issue has no team context. Pass the status name again once the issue is fetched.",
      );
    }

    const [state, project, assignee, labels] = await Promise.all([
      input.status?.trim() && teamId
        ? this.metadata.resolveWorkflowState(teamId, input.status.trim())
        : undefined,
      typeof input.project === "string" && input.project.trim()
        ? this.metadata.resolveProject(input.project.trim())
        : undefined,
      typeof input.assignee === "string" && input.assignee.trim()
        ? this.metadata.resolveUser(input.assignee.trim())
        : undefined,
      input.labels?.length ? this.metadata.resolveLabels(input.labels) : undefined,
    ]);
    const dueDate = input.dueDate === null ? null : validateDueDate(input.dueDate);
    const payload: SdkIssueUpdateInput = {
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(project ? { projectId: project.id } : input.project === null ? { projectId: null } : {}),
      ...(state ? { stateId: state.id } : {}),
      ...(assignee
        ? { assigneeId: assignee.id }
        : input.assignee === null
          ? { assigneeId: null }
          : {}),
      ...(priorityToValue(input.priority) !== undefined
        ? { priority: priorityToValue(input.priority) }
        : {}),
      ...(input.labels?.length ? { labelIds: labels!.map((label) => label.id) } : {}),
      ...(dueDate === null ? { dueDate: null } : dueDate ? { dueDate } : {}),
    };
    try {
      const result = await client.updateIssue(parsed.value, payload);
      if (!result?.issue) {
        throw LinearConnectorError.validation(
          "Linear did not return the updated issue. Verify the workspace allows updates.",
        );
      }
      return await this.mapDetail(await result.issue);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  /** Single-issue detail: hydrate every nested model once, in parallel. */
  private async mapDetail(issue: SdkIssueViewLike & SdkIssueModelExtras): Promise<IssueDetail> {
    const [state, team, assignee, project, cycle, parent, labels, relations] = await Promise.all([
      issue.state ?? Promise.resolve(undefined),
      issue.team ?? Promise.resolve(undefined),
      issue.assignee ?? Promise.resolve(undefined),
      issue.project ?? Promise.resolve(undefined),
      issue.cycle ?? Promise.resolve(undefined),
      issue.parent ?? Promise.resolve(undefined),
      issue
        .labels({ first: LABEL_PAGE_SIZE })
        .then((connection) => connection.nodes as SdkLabelView[]),
      issue.relations({ first: RELATION_PAGE_SIZE }).then((connection) => connection.nodes),
    ]);
    const relationsView: SdkRelationView[] = await Promise.all(
      relations.map(async (relation) => ({
        type: relation.type,
        relatedIssue: relation.relatedIssue ? await relation.relatedIssue : undefined,
      })),
    );
    return mapIssueDetail(toIssueView(issue), {
      state,
      team,
      assignee,
      project,
      cycle,
      parent: parent ? { identifier: parent.identifier, title: parent.title } : undefined,
      labels,
      relations: relationsView,
    });
  }

  /**
   * Name → ID resolution for the deterministic search relations (plan §14,
   * §32). Resolved BEFORE the query is sent: an unknown team / project /
   * assignee fails with NOT_FOUND and an ambiguous reference fails with
   * AMBIGUOUS_REFERENCE instead of silently returning an empty or wrong page.
   * Status requires the team context (states are team-scoped); without a team
   * the status name is passed through for Linear to evaluate per issue.
   */
  private async resolveSearchFilters(query: SearchIssuesQuery): Promise<ResolvedSearchQuery> {
    const team = query.team?.trim() ? await this.metadata.resolveTeam(query.team) : undefined;
    const [project, assignee, state] = await Promise.all([
      query.project?.trim() ? this.metadata.resolveProject(query.project) : undefined,
      query.assignee?.trim() ? this.metadata.resolveUser(query.assignee) : undefined,
      query.status?.trim() && team
        ? this.metadata.resolveWorkflowState(team.id, query.status)
        : undefined,
    ]);
    return {
      teamId: team?.id,
      projectId: project?.id,
      assigneeId: assignee?.id,
      stateId: state?.id,
      statusName: query.status?.trim() && !team ? query.status.trim() : undefined,
      cycleName: query.cycle?.trim() || undefined,
      labels: query.labels?.length ? query.labels : undefined,
      priority: query.priority,
      includeCompleted: query.includeCompleted,
    };
  }

  /**
   * One parallel pass over the id → entity catalogs (plan §32), served by the
   * shared cached metadata catalog (§14.2). States are per-team: the teams
   * present in this page each contribute their own states, merged by id (the
   * same state can be shared between teams' workflows).
   */
  private async loadResultCatalogs(nodes: SdkIssueViewLike[]): Promise<IssueSummaryCatalogs> {
    const teamIds = [
      ...new Set(nodes.map((node) => node.teamId).filter((id): id is string => !!id)),
    ];
    const [teams, users, projects, labels, ...stateLists] = await Promise.all([
      this.metadata.catalog.getTeams(),
      this.metadata.catalog.getUsers(),
      this.metadata.catalog.getProjects(),
      this.metadata.catalog.getLabels(),
      ...teamIds.map((teamId) => this.metadata.catalog.getStates(teamId)),
    ]);
    const states = new Map<string, SdkWorkflowStateView>();
    for (const list of stateLists) {
      for (const state of list) {
        if (!states.has(state.id)) states.set(state.id, state);
      }
    }
    return {
      states,
      teams: indexById(teams),
      users: indexById(users),
      projects: indexById(projects),
      labels: indexById(labels),
    };
  }
}

// ------------------------------------------------------------ filter builder

/** A {@link SearchIssuesQuery} after name → ID resolution (plan §32). */
export interface ResolvedSearchQuery {
  teamId?: string;
  projectId?: string;
  assigneeId?: string;
  /** Status resolved to a single workflow state id (team context present). */
  stateId?: string;
  /** Status without team context: matched by name inside Linear, per issue. */
  statusName?: string;
  /** Cycle names are team-local: matched by name inside Linear. */
  cycleName?: string;
  labels?: string[];
  priority?: PriorityInput;
  includeCompleted?: boolean;
}

/**
 * Map the resolved search query onto Linear-native filter conditions (plan
 * §32). Returns `undefined` when nothing needs filtering, so the SDK call
 * stays unfiltered. Deterministic relations filter by resolved IDs; status
 * without team context and cycles filter by name because those names are
 * evaluated per issue by Linear itself (a state name may exist in many teams
 * and cycle names repeat across teams). Labels keep the M2 shape
 * (`every` + name `in`: every label on the issue must be in the given
 * set). Filter shapes verified against the @linear/sdk schema
 * (IdComparator / TeamFilter / UserFilter / ProjectFilter /
 * WorkflowStateFilter / CycleFilter).
 */
export function buildIssueFilter(query: ResolvedSearchQuery): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {};

  if (query.teamId) {
    filter.team = { id: { eq: query.teamId } };
  }
  if (query.projectId) {
    filter.project = { id: { eq: query.projectId } };
  }
  if (query.assigneeId) {
    filter.assignee = { id: { eq: query.assigneeId } };
  }
  if (query.stateId) {
    filter.state = { id: { eq: query.stateId } };
  } else if (query.statusName) {
    filter.state = { name: { eqIgnoreCase: query.statusName } };
  }
  if (query.cycleName) {
    filter.cycle = { name: { eqIgnoreCase: query.cycleName } };
  }
  if (query.labels?.length) {
    filter.labels = { every: { name: { in: query.labels } } };
  }
  if (query.priority !== undefined) {
    const value = priorityToValue(query.priority);
    if (value !== undefined) filter.priority = { eq: value };
  }
  if (query.includeCompleted === false) {
    filter.completedAt = { null: true };
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

// -------------------------------------------------------- structural views

/**
 * Validate an ISO date string (`YYYY-MM-DD`, Linear's TimelessDate shape).
 * Returns the normalized value, `undefined` when absent, and throws
 * VALIDATION_ERROR for anything else — a bad due date must never reach the
 * mutation.
 */
export function validateDueDate(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw LinearConnectorError.validation(
      `"${trimmed}" is not a valid due date. Use the ISO format YYYY-MM-DD.`,
    );
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw LinearConnectorError.validation(
      `"${trimmed}" is not a valid due date. Use the ISO format YYYY-MM-DD.`,
    );
  }
  return trimmed;
}

function toIssueView(issue: SdkIssueViewLike): SdkIssueView {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    priority: issue.priority,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    description: issue.description,
    dueDate: issue.dueDate,
    labelIds: issue.labelIds,
    stateId: issue.stateId,
    teamId: issue.teamId,
    assigneeId: issue.assigneeId,
    projectId: issue.projectId,
    cycleId: issue.cycleId,
    parentId: issue.parentId,
  };
}

export type { LinearSdkModel } from "../sdk-model.ts";
