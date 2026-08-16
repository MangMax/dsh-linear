/**
 * Canonical Issue DTOs (plan §12).
 *
 * These are the ONLY shapes the tool layer and the model see. Linear SDK
 * objects are mapped into these compact DTOs by `src/linear/services/*` and
 * never leak to tools or the model.
 */

export interface PriorityInfo {
  value: number;
  label: string;
}

/** Linear numeric priority → human label. */
export const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

/** Priority values accepted by write/search tools (plan §10.2). */
export type PriorityInput = "urgent" | "high" | "medium" | "low" | "none";

/** Map a tool-facing priority input to the Linear numeric value. */
export function priorityToValue(priority: PriorityInput | undefined): number | undefined {
  switch (priority) {
    case "urgent":
      return 1;
    case "high":
      return 2;
    case "medium":
      return 3;
    case "low":
      return 4;
    case "none":
      return 0;
    default:
      return undefined;
  }
}

/** Map a Linear numeric priority to its human label. */
export function priorityLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return PRIORITY_LABELS[0];
  }
  return PRIORITY_LABELS[value] ?? `Priority ${value}`;
}

export interface IssueStatusSummary {
  id: string;
  name: string;
  type: string;
}

export interface IssueActorSummary {
  id: string;
  name: string;
}

export interface IssueProjectSummary {
  id: string;
  name: string;
}

export interface IssueTeamSummary {
  id: string;
  key: string;
  name: string;
}

export interface IssueLabelSummary {
  id: string;
  name: string;
}

export interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  url: string;

  priority: PriorityInfo;

  status?: IssueStatusSummary;
  assignee?: IssueActorSummary;
  project?: IssueProjectSummary;

  team: IssueTeamSummary;

  labels: IssueLabelSummary[];

  createdAt: string;
  updatedAt: string;
}

export interface IssueCycleSummary {
  id: string;
  name: string;
}

export interface IssueParentSummary {
  identifier: string;
  title: string;
}

export interface IssueRelationSummary {
  type: string;
  issue: {
    identifier: string;
    title: string;
  };
}

export interface IssueDetail extends IssueSummary {
  description?: string;

  cycle?: IssueCycleSummary;
  dueDate?: string;

  parent?: IssueParentSummary;

  relations?: IssueRelationSummary[];
}

/** A single comment on an issue (plan §10.4). */
export interface CommentSummary {
  id: string;
  body: string;
  author?: IssueActorSummary;
  createdAt: string;
}

/** Aggregated context returned by `linear_get_issue_context` (plan §10.4). */
export interface IssueContext {
  issue: IssueDetail;
  comments: CommentSummary[];
}
