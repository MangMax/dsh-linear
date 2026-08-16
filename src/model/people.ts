/**
 * People / metadata canonical models (plan §12, v0.2 expansion).
 *
 * Stable DTOs for the tool batch added alongside the M7 robustness work:
 * users, team details, workflow states, issue labels and attachments.
 * Dates are ISO strings; nested entities are id + name summaries — the
 * model never sees SDK objects.
 */

/** A workspace user (plan §10.4 actor surface, expanded). */
export interface UserSummary {
  id: string;
  name: string;
  email?: string;
}

/** Team details beyond the list summary (plan §10.10, expanded). */
export interface TeamDetail {
  id: string;
  key: string;
  name: string;
  displayName?: string;
  issueCount?: number;
  timezone?: string;
  cyclesEnabled?: boolean;
  triageEnabled?: boolean;
}

/** One workflow state of a team (plan §14.2 states catalog surface). */
export interface WorkflowStateSummary {
  id: string;
  name: string;
  /** "backlog" | "unstarted" | "started" | "completed" | "canceled". */
  type: string;
  color?: string;
  position?: number;
}

/** An issue label (plan §14.2 labels catalog surface). */
export interface IssueLabelSummary {
  id: string;
  name: string;
  color?: string;
  isGroup?: boolean;
}

/** An attachment on an issue (plan §68). */
export interface AttachmentSummary {
  id: string;
  title: string;
  url: string;
  sourceType?: string;
  createdAt: string;
}
