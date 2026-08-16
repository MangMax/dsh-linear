/**
 * Shared structural view of the Linear SDK client (plan §64).
 *
 * Domain services never import `@linear/sdk` types directly for the surface
 * they consume; instead they depend on this minimal structural model. The
 * real `LinearClient` satisfies it structurally (the SDK exposes paginated
 * connections with `nodes` / `pageInfo` and scalar snapshots such as
 * `teamId` / `labelIds` on issues), and contract tests mock the boundary at
 * this shape with plain objects (plan §53.2) — an `@linear/sdk` upgrade only
 * touches this file and the mapper views.
 *
 * Catalog connections (`workflowStates` / `teams` / `users` / `projects` /
 * `issueLabels`) expose Relay-style `pageInfo` so the MetadataResolver can
 * page to exhaustion (plan §14.2).
 */
import type {
  SdkLabelView,
  SdkProjectView,
  SdkTeamView,
  SdkUserView,
  SdkWorkflowStateView,
} from "./services/issue-mapper.ts";

/** Relay-style page info returned by every SDK connection. */
export interface SdkPageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

/** Minimal structural shape of an SDK connection. */
export interface SdkConnection<T> {
  nodes: T[];
  pageInfo?: SdkPageInfo;
}

/**
 * Scalar-only surface shared by the SDK `Issue` and `IssueSearchResult`
 * models. Nested names are resolved by the service from id → entity catalogs,
 * never by per-issue follow-up queries (plan §32).
 */
export interface SdkIssueViewLike {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  description?: string | null;
  dueDate?: string | null;
  labelIds: string[];
  stateId?: string;
  teamId?: string;
  assigneeId?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
  parentId?: string | null;
}

/** The team surface the resolver needs to page a team's workflow states. */
export interface SdkTeamStatesView {
  id: string;
  states(variables: {
    first: number;
    after?: string;
  }): Promise<SdkConnection<SdkWorkflowStateView>>;
}

/**
 * Minimal structural surface of the SDK client methods the domain layer uses.
 * Values are deliberately `unknown`-loose where the SDK types are versioned
 * enums (filters) so this file does not need regeneration on SDK upgrades.
 *
 * Milestone 4 adds the write surface: the mutation input shapes (a subset of
 * the SDK's unexported `IssueCreateInput` / `IssueUpdateInput` /
 * `CommentCreateInput`) and the create/update/comment methods. The real
 * `LinearClient` satisfies them structurally — the SDK types are not
 * importable for these inputs, so the structural views are the versioned
 * boundary (plan §64).
 */
export interface LinearSdkModel {
  issue(id: string): Promise<(SdkIssueViewLike & SdkIssueModelExtras) | undefined>;
  issues(variables: Record<string, unknown>): Promise<SdkConnection<SdkIssueViewLike>>;
  searchIssues(
    term: string,
    variables: Record<string, unknown>,
  ): Promise<SdkConnection<SdkIssueViewLike>>;
  teams(variables: { first: number; after?: string }): Promise<SdkConnection<SdkTeamView>>;
  users(variables: { first: number; after?: string }): Promise<SdkConnection<SdkUserView>>;
  projects(variables: { first: number; after?: string }): Promise<SdkConnection<SdkProjectView>>;
  issueLabels(variables: { first: number; after?: string }): Promise<SdkConnection<SdkLabelView>>;
  user(id: string): Promise<SdkUserView | undefined>;
  team(id: string): Promise<SdkTeamStatesView | undefined>;
  /**
   * Mutation surface (M4). The SDK payloads expose their nested models as
   * lazy `LinearFetch` getters, which no plain-object structural view can
   * satisfy — the boundary stays `unknown`-loose and the domain services
   * (which hold the real `LinearClient`) narrow at the call site (plan §64).
   */
  createIssue(input: SdkIssueCreateInput): Promise<{ issue?: unknown }>;
  updateIssue(id: string, input: SdkIssueUpdateInput): Promise<{ issue?: unknown }>;
  createComment(input: SdkCommentCreateInput): Promise<{ comment?: unknown }>;
}

/** Structural mutation input for `createIssue` (plan §10.5). */
export interface SdkIssueCreateInput {
  teamId: string;
  title: string;
  description?: string;
  projectId?: string;
  stateId?: string;
  assigneeId?: string;
  priority?: number;
  labelIds?: string[];
  dueDate?: string;
}

/** Structural mutation input for `updateIssue` (plan §10.6); `null` clears. */
export interface SdkIssueUpdateInput {
  title?: string;
  description?: string;
  projectId?: string | null;
  stateId?: string;
  assigneeId?: string | null;
  priority?: number;
  labelIds?: string[];
  dueDate?: string | null;
}

/** Structural mutation input for `createComment` (plan §10.7). */
export interface SdkCommentCreateInput {
  issueId: string;
  body: string;
}

/**
 * Nested-model accessors only `client.issue()` returns: list/search results
 * are the scalar-only {@link SdkIssueViewLike}.
 */
export interface SdkIssueModelExtras {
  state?: Promise<{ id: string; name: string; type: string }> | undefined;
  team?: Promise<{ id: string; key: string; name: string }> | undefined;
  assignee?: Promise<{ id: string; name: string; email?: string | null }> | undefined;
  project?: Promise<{ id: string; name: string }> | undefined;
  cycle?: Promise<{ id: string; name?: string | null }> | undefined;
  parent?: Promise<{ identifier: string; title: string }> | undefined;
  labels(options: { first: number }): Promise<{ nodes: SdkLabelView[] }>;
  relations(options: { first: number }): Promise<{
    nodes: Array<{
      type: string;
      relatedIssue?: Promise<{ identifier: string; title: string }> | undefined;
    }>;
  }>;
  comments(options: { first: number }): Promise<{
    nodes: Array<{
      id: string;
      body: string;
      createdAt: Date;
      userId?: string | undefined;
    }>;
  }>;
}
