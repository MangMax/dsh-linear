/**
 * Issue DTO mapping (plan §12, §13).
 *
 * Pure functions turning *structural views* of Linear SDK models into the
 * canonical DTOs. Structural views keep this module SDK-version-independent
 * (plan §64) and let contract tests mock the boundary at the Linear client
 * with plain objects (§53.2).
 *
 * Mapping rules:
 * - dates become ISO strings; `undefined`/`null` optional fields are omitted.
 * - a summary's nested names (status / team / assignee / project / cycle /
 *   labels) are resolved from id → entity catalogs collected by the service —
 *   never by per-issue SDK follow-up queries (N+1, plan §32).
 */
import {
  priorityLabel,
  type CommentSummary,
  type IssueDetail,
  type IssueLabelSummary,
  type IssueStatusSummary,
  type IssueSummary,
  type IssueTeamSummary,
} from "../../model/issue.ts";

// ---------------------------------------------------------------- SDK views

export interface SdkWorkflowStateView {
  id: string;
  name: string;
  type: string;
}

export interface SdkTeamView {
  id: string;
  key: string;
  name: string;
}

export interface SdkUserView {
  id: string;
  name: string;
  email?: string | null;
}

export interface SdkProjectView {
  id: string;
  name: string;
}

export interface SdkLabelView {
  id: string;
  name: string;
}

export interface SdkCycleView {
  id: string;
  name?: string | null;
}

/** Scalar surface of an SDK Issue / IssueSearchResult model. */
export interface SdkIssueView {
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

export interface SdkRelationView {
  type: string;
  relatedIssue?: { identifier: string; title: string } | null;
}

export interface SdkCommentView {
  id: string;
  body: string;
  createdAt: Date;
  author?: { id: string; name: string } | null;
}

// ------------------------------------------------------------------ catalogs

/** id → entity maps collected once per operation (plan §32). */
/**
 * id → entity maps used to attach names to issue scalars (plan §32). Cycles
 * are deliberately absent: a summary never carries a cycle, and detail cycles
 * are hydrated directly by the service (see {@link IssueDetailExtras}).
 */
export interface IssueSummaryCatalogs {
  states: ReadonlyMap<string, SdkWorkflowStateView>;
  teams: ReadonlyMap<string, SdkTeamView>;
  users: ReadonlyMap<string, SdkUserView>;
  projects: ReadonlyMap<string, SdkProjectView>;
  labels: ReadonlyMap<string, SdkLabelView>;
}

export function indexById<T extends { id: string }>(nodes: readonly T[]): Map<string, T> {
  return new Map(nodes.map((node) => [node.id, node]));
}

// ------------------------------------------------------------------- mapping

function toTeam(team: SdkTeamView | undefined, fallbackId: string): IssueTeamSummary {
  return team
    ? { id: team.id, key: team.key, name: team.name }
    : { id: fallbackId, key: "", name: "" };
}

function toStatus(state: SdkWorkflowStateView | undefined): IssueStatusSummary | undefined {
  return state ? { id: state.id, name: state.name, type: state.type } : undefined;
}

function toLabels(
  labels: ReadonlyMap<string, SdkLabelView>,
  ids: readonly string[],
): IssueLabelSummary[] {
  const out: IssueLabelSummary[] = [];
  for (const id of ids) {
    const label = labels.get(id);
    if (label) out.push({ id: label.id, name: label.name });
  }
  return out;
}

export function mapIssueSummary(issue: SdkIssueView, catalogs: IssueSummaryCatalogs): IssueSummary {
  const state = issue.stateId ? catalogs.states.get(issue.stateId) : undefined;
  const assignee = issue.assigneeId ? catalogs.users.get(issue.assigneeId) : undefined;
  const project = issue.projectId ? catalogs.projects.get(issue.projectId) : undefined;

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    priority: { value: issue.priority, label: priorityLabel(issue.priority) },
    status: toStatus(state),
    assignee: assignee ? { id: assignee.id, name: assignee.name } : undefined,
    project: project ? { id: project.id, name: project.name } : undefined,
    team: toTeam(catalogs.teams.get(issue.teamId ?? ""), issue.teamId ?? ""),
    labels: toLabels(catalogs.labels, issue.labelIds),
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  };
}

export interface IssueDetailExtras {
  state?: SdkWorkflowStateView;
  team?: SdkTeamView;
  assignee?: SdkUserView;
  project?: SdkProjectView;
  cycle?: SdkCycleView;
  parent?: { identifier: string; title: string };
  labels: readonly SdkLabelView[];
  relations: readonly SdkRelationView[];
}

export function mapIssueDetail(issue: SdkIssueView, extras: IssueDetailExtras): IssueDetail {
  const catalogs: IssueSummaryCatalogs = {
    states: extras.state ? new Map([[extras.state.id, extras.state]]) : new Map(),
    teams: extras.team ? new Map([[extras.team.id, extras.team]]) : new Map(),
    users: extras.assignee ? new Map([[extras.assignee.id, extras.assignee]]) : new Map(),
    projects: extras.project ? new Map([[extras.project.id, extras.project]]) : new Map(),
    labels: indexById(extras.labels),
  };

  return {
    ...mapIssueSummary(issue, catalogs),
    description: issue.description ?? undefined,
    dueDate: issue.dueDate ?? undefined,
    cycle: extras.cycle ? { id: extras.cycle.id, name: extras.cycle.name ?? "" } : undefined,
    parent: extras.parent,
    relations: extras.relations.map((relation) => ({
      type: relation.type,
      issue: {
        identifier: relation.relatedIssue?.identifier ?? "",
        title: relation.relatedIssue?.title ?? "",
      },
    })),
  };
}

export function mapComment(comment: SdkCommentView): CommentSummary {
  return {
    id: comment.id,
    body: comment.body,
    author: comment.author ? { id: comment.author.id, name: comment.author.name } : undefined,
    createdAt: comment.createdAt.toISOString(),
  };
}
