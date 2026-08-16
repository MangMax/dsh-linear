/**
 * Tool result rendering (plan §13).
 *
 * Canonical DTOs are for tests / logic / future UI; what the model sees is a
 * compact markdown projection. Never serialize the full canonical JSON into
 * the model context.
 */
import type { TextContentBlock } from "./types.ts";
import type { ConnectionStatus } from "../model/connection.ts";
import type { CommentSummary, IssueContext, IssueDetail, IssueSummary } from "../model/issue.ts";
import type { PagedResult } from "../model/pagination.ts";
import type { ProjectDetail, ProjectSummary } from "../model/project.ts";
import type { CycleSummary } from "../linear/services/cycle-service.ts";
import type { TeamSummary } from "../linear/services/team-service.ts";
import type {
  AttachmentSummary,
  IssueLabelSummary,
  TeamDetail,
  UserSummary,
  WorkflowStateSummary,
} from "../model/people.ts";
import type {
  CustomerSummary,
  DocumentSummary,
  InitiativeLabelSummary,
  InitiativeSummary,
  MilestoneSummary,
  ReleaseNoteSummary,
  ReleasePipelineSummary,
  ReleaseSummary,
  StatusUpdateSummary,
} from "../model/content.ts";

export function text(markdown: string): TextContentBlock[] {
  return [{ type: "text", text: markdown }];
}

const MAX_COMMENT_LENGTH = 1000;

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

// ------------------------------------------------------- connection status

export function renderConnectionStatus(status: ConnectionStatus): TextContentBlock[] {
  if (!status.connected) {
    const lines: string[] = ["Not connected to Linear.", ""];
    if (status.state && status.state !== "disconnected") {
      lines.push(`State: ${status.state}`);
    }
    lines.push(
      status.message ??
        "Connect the workspace before using Linear tools (see the connector README for OAuth or API-key setup).",
    );
    return text(lines.join("\n"));
  }

  const lines: string[] = ["Connected to Linear", ""];
  if (status.workspace) {
    lines.push(`Workspace: ${status.workspace.name} (id: ${status.workspace.id})`);
  }
  if (status.viewer) {
    const email = status.viewer.email ? ` <${status.viewer.email}>` : "";
    lines.push(`Viewer: ${status.viewer.name}${email}`);
  }
  if (status.authMode) {
    lines.push(`Auth mode: ${status.authMode}`);
  }
  return text(lines.join("\n"));
}

// ------------------------------------------------------------------- issues

/** Compact single-line issue summary used by search results. */
export function summarizeIssue(issue: IssueSummary): string {
  const bits: string[] = [];
  if (issue.status?.name) bits.push(issue.status.name);
  if (issue.priority.label && issue.priority.label !== "No priority") {
    bits.push(issue.priority.label);
  }
  if (issue.team.key) bits.push(issue.team.key);
  const suffix = bits.length > 0 ? ` (${bits.join(" · ")})` : "";
  return `${issue.identifier} — ${issue.title}${suffix}`;
}

export function renderSearchResult(result: PagedResult<IssueSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} issue(s):`, ""];
  for (const issue of result.items) {
    lines.push(`- ${summarizeIssue(issue)}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderIssueDetail(issue: IssueDetail): string {
  const lines: string[] = [`${issue.identifier} — ${issue.title}`, ""];
  const fields: string[] = [];
  if (issue.status) fields.push(`Status: ${issue.status.name}`);
  fields.push(`Priority: ${issue.priority.label}`);
  if (issue.assignee) fields.push(`Assignee: ${issue.assignee.name}`);
  if (issue.project) fields.push(`Project: ${issue.project.name}`);
  if (issue.team.key) fields.push(`Team: ${issue.team.name} (${issue.team.key})`);
  if (issue.cycle) fields.push(`Cycle: ${issue.cycle.name}`);
  if (issue.dueDate) fields.push(`Due: ${issue.dueDate}`);
  if (issue.parent) fields.push(`Parent: ${issue.parent.identifier} — ${issue.parent.title}`);
  if (issue.labels.length > 0) {
    fields.push(`Labels: ${issue.labels.map((label) => label.name).join(", ")}`);
  }
  lines.push(fields.join("\n"));
  if (issue.description) {
    lines.push("", "Description:", clip(issue.description, 4000));
  }
  if (issue.relations?.length) {
    lines.push("", "Relations:");
    for (const relation of issue.relations) {
      lines.push(`- ${relation.type}: ${relation.issue.identifier} — ${relation.issue.title}`);
    }
  }
  lines.push("", `Updated: ${issue.updatedAt}`, `URL: ${issue.url}`);
  return lines.join("\n");
}

export function renderGetIssue(issue: IssueDetail): TextContentBlock[] {
  return text(renderIssueDetail(issue));
}

// ---------------------------------------------------------------- writes

/** `linear_create_issue` result (plan §10.5, §13). */
export function renderCreateIssue(issue: IssueDetail): TextContentBlock[] {
  return text(`Created issue\n\n${renderIssueDetail(issue)}`);
}

/** `linear_update_issue` result (plan §10.6, §13). */
export function renderUpdateIssue(issue: IssueDetail): TextContentBlock[] {
  return text(`Updated issue\n\n${renderIssueDetail(issue)}`);
}

/** `linear_add_comment` result (plan §10.7, §13). */
export function renderAddComment(comment: CommentSummary): TextContentBlock[] {
  const author = comment.author?.name ?? "unknown";
  const lines: string[] = [
    `Comment added — ${author} — ${comment.createdAt}:`,
    clip(comment.body, MAX_COMMENT_LENGTH),
    `Comment id: ${comment.id}`,
  ];
  return text(lines.join("\n"));
}

export function renderIssueContext(context: IssueContext): TextContentBlock[] {
  const lines: string[] = [renderIssueDetail(context.issue)];
  if (context.comments.length > 0) {
    lines.push("", `## Comments (${context.comments.length})`, "");
    for (const comment of context.comments) {
      const author = comment.author?.name ?? "unknown";
      lines.push(
        `**${author}** — ${comment.createdAt}:`,
        clip(comment.body, MAX_COMMENT_LENGTH),
        "",
      );
    }
  } else {
    lines.push("", "## Comments", "", "No comments yet.");
  }
  return text(lines.join("\n"));
}

// ---------------------------------------------------------------- projects

export function summarizeProject(project: ProjectSummary): string {
  const bits: string[] = [];
  if (project.status) bits.push(project.status);
  if (project.lead) bits.push(`Lead: ${project.lead.name}`);
  if (project.teams.length > 0) {
    bits.push(`Teams: ${project.teams.map((team) => team.key || team.name).join(", ")}`);
  }
  if (project.progress !== undefined) bits.push(`${project.progress}%`);
  const suffix = bits.length > 0 ? ` (${bits.join(" · ")})` : "";
  return `${project.name}${suffix}`;
}

export function renderProjectList(result: PagedResult<ProjectSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} project(s):`, ""];
  for (const project of result.items) {
    lines.push(`- ${summarizeProject(project)}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderProjectDetail(project: ProjectDetail): string {
  const lines: string[] = [project.name, ""];
  const fields: string[] = [];
  if (project.status) fields.push(`Status: ${project.status}`);
  if (project.lead) fields.push(`Lead: ${project.lead.name}`);
  if (project.teams.length > 0) {
    fields.push(`Teams: ${project.teams.map((team) => `${team.name} (${team.key})`).join(", ")}`);
  }
  if (project.targetDate) fields.push(`Target: ${project.targetDate}`);
  if (project.progress !== undefined) fields.push(`Progress: ${project.progress}%`);
  lines.push(fields.join("\n"));
  if (project.description) {
    lines.push("", "Description:", clip(project.description, 4000));
  }
  if (project.recentUpdates.length > 0) {
    lines.push("", `## Recent updates (${project.recentUpdates.length})`, "");
    for (const update of project.recentUpdates) {
      const author = update.author?.name ?? "unknown";
      lines.push(`**${author}** — ${update.createdAt}:`, clip(update.body, MAX_COMMENT_LENGTH), "");
    }
  }
  lines.push("", `URL: ${project.url}`);
  return lines.join("\n");
}

export function renderGetProject(project: ProjectDetail): TextContentBlock[] {
  return text(renderProjectDetail(project));
}

// ------------------------------------------------------------------- teams

export function renderTeamList(result: PagedResult<TeamSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} team(s):`, ""];
  for (const team of result.items) {
    lines.push(`- ${team.name} (${team.key})`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

// ------------------------------------------------------------------ cycles

export function renderCycleList(result: PagedResult<CycleSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} cycle(s):`, ""];
  for (const cycle of result.items) {
    const window = cycle.startsAt
      ? ` (${cycle.startsAt.slice(0, 10)} → ${cycle.endsAt?.slice(0, 10) ?? "?"})`
      : "";
    lines.push(`- ${cycle.name}${window}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

// ------------------------------------------------------------- people (v0.2)

export function renderAttachmentUploadPlan(plan: {
  assetUrl: string;
  uploadUrl: string;
  headers: Array<{ key: string; value: string }>;
  filename: string;
  contentType: string;
  size: number;
}): TextContentBlock[] {
  const headerLines = plan.headers.map((header) => `-H "${header.key}: ${header.value}"`).join(" ");
  return text(
    [
      `Upload plan for ${plan.filename} (${plan.contentType}, ${plan.size} bytes):`,
      "",
      `PUT raw bytes to: ${plan.uploadUrl}`,
      "",
      "POSIX (macOS/Linux):",
      `curl -X PUT --data-binary @<file> ${headerLines} "<uploadUrl>"`,
      "",
      "PowerShell (Windows): use curl.exe — bare curl is an Invoke-WebRequest alias;",
      `curl.exe -X PUT --data-binary "@<file>" ${headerLines} '<uploadUrl>'`,
      "",
      "Constraints: send every header VERBATIM (including casing) or the PUT returns 403;",
      "complete the PUT within 60 seconds; do not base64-encode or transform the file.",
      "",
      "Cross-platform alternative: prefer linear_upload_attachment_file — it uploads",
      "host-side and needs no shell commands at all.",
      "",
      `After the PUT succeeds, finalize with linear_create_attachment_from_upload using assetUrl: ${plan.assetUrl}`,
    ].join("\n"),
  );
}

export function renderOk(result: { ok: boolean }): TextContentBlock[] {
  return text(result.ok ? "Done." : "The operation did not complete.");
}

export function renderUserList(result: PagedResult<UserSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} user(s):`, ""];
  for (const user of result.items) {
    lines.push(`- ${user.name}${user.email ? ` <${user.email}>` : ""}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderUser(user: UserSummary): TextContentBlock[] {
  const lines = [`${user.name}`];
  if (user.email) lines.push(`Email: ${user.email}`);
  return text(lines.join("\n"));
}

export function renderTeamDetail(team: TeamDetail): TextContentBlock[] {
  const lines = [`${team.name} (${team.key})`];
  if (team.displayName) lines.push(`Display name: ${team.displayName}`);
  if (team.issueCount !== undefined) lines.push(`Issue count: ${team.issueCount}`);
  if (team.timezone) lines.push(`Timezone: ${team.timezone}`);
  if (team.cyclesEnabled !== undefined)
    lines.push(`Cycles: ${team.cyclesEnabled ? "enabled" : "disabled"}`);
  if (team.triageEnabled !== undefined)
    lines.push(`Triage: ${team.triageEnabled ? "enabled" : "disabled"}`);
  return text(lines.join("\n"));
}

export function renderWorkflowStateList(
  result: PagedResult<WorkflowStateSummary>,
): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} workflow state(s):`, ""];
  for (const state of result.items) {
    lines.push(`- ${state.name} (${state.type})`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderIssueLabelList(result: PagedResult<IssueLabelSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} label(s):`, ""];
  for (const label of result.items) {
    lines.push(`- ${label.name}${label.color ? ` (${label.color})` : ""}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderCommentList(result: PagedResult<CommentSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} comment(s):`, ""];
  for (const comment of result.items) {
    const author = comment.author ? `**${comment.author.name}**` : "unknown";
    lines.push(`${author} — ${comment.createdAt}:`);
    lines.push(comment.body);
    lines.push("");
  }
  if (result.hasMore && result.nextCursor) {
    lines.push(`More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderAttachmentList(result: PagedResult<AttachmentSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} attachment(s):`, ""];
  for (const attachment of result.items) {
    lines.push(`- ${attachment.title} — ${attachment.url}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderAttachment(attachment: AttachmentSummary): TextContentBlock[] {
  const lines = [`${attachment.title}`];
  lines.push(`URL: ${attachment.url}`);
  if (attachment.sourceType) lines.push(`Source: ${attachment.sourceType}`);
  return text(lines.join("\n"));
}

// ------------------------------------------------ content entities (v0.2)

export function renderProfile(profile: {
  id: string;
  name: string;
  email?: string;
}): TextContentBlock[] {
  const lines = [profile.name];
  if (profile.email) lines.push(`Email: ${profile.email}`);
  return text(lines.join("\n"));
}

export function renderDocumentList(result: PagedResult<DocumentSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} document(s):`, ""];
  for (const document of result.items) {
    lines.push(`- ${document.title} — ${document.url}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderDocument(document: DocumentSummary): TextContentBlock[] {
  const lines = [`${document.title}`];
  lines.push(`URL: ${document.url}`);
  return text(lines.join("\n"));
}

export function renderStatusUpdateList(
  result: PagedResult<StatusUpdateSummary>,
): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} status update(s):`, ""];
  for (const update of result.items) {
    const author = update.authorName ? `**${update.authorName}**` : "unknown";
    lines.push(`${author} — ${update.createdAt}:`);
    lines.push(update.body);
    lines.push("");
  }
  if (result.hasMore && result.nextCursor) {
    lines.push(`More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderStatusUpdate(update: StatusUpdateSummary): TextContentBlock[] {
  const author = update.authorName ? `**${update.authorName}**` : "unknown";
  return text(`${author} — ${update.createdAt}:\n${update.body}`);
}

export function renderMilestoneList(result: PagedResult<MilestoneSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} milestone(s):`, ""];
  for (const milestone of result.items) {
    const target = milestone.targetDate ? ` (target ${milestone.targetDate.slice(0, 10)})` : "";
    lines.push(`- ${milestone.name}${target}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderMilestone(milestone: MilestoneSummary): TextContentBlock[] {
  const lines = [milestone.name];
  if (milestone.targetDate) lines.push(`Target: ${milestone.targetDate.slice(0, 10)}`);
  if (milestone.description) lines.push(milestone.description);
  return text(lines.join("\n"));
}

// ----------------------------------------------- enterprise entities (v0.2)

export function renderInitiativeList(result: PagedResult<InitiativeSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} initiative(s):`, ""];
  for (const item of result.items) {
    const status = item.status ? ` (${item.status})` : "";
    lines.push(`- ${item.name}${status}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderInitiative(initiative: InitiativeSummary): TextContentBlock[] {
  const lines = [initiative.name];
  if (initiative.status) lines.push(`Status: ${initiative.status}`);
  if (initiative.description) lines.push(initiative.description);
  return text(lines.join("\n"));
}

export function renderInitiativeLabelList(
  result: PagedResult<InitiativeLabelSummary>,
): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} label(s):`, ""];
  for (const label of result.items) {
    lines.push(`- ${label.name}${label.color ? ` (${label.color})` : ""}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderReleaseList(result: PagedResult<ReleaseSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} release(s):`, ""];
  for (const release of result.items) {
    const version = release.version ? ` v${release.version}` : "";
    lines.push(`- ${release.name}${version} — ${release.url}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderRelease(release: ReleaseSummary): TextContentBlock[] {
  const lines = [`${release.name}${release.version ? ` v${release.version}` : ""}`];
  if (release.description) lines.push(release.description);
  return text(lines.join("\n"));
}

export function renderReleasePipelineList(
  result: PagedResult<ReleasePipelineSummary>,
): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} pipeline(s):`, ""];
  for (const pipeline of result.items) {
    lines.push(`- ${pipeline.name}${pipeline.description ? ` — ${pipeline.description}` : ""}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderReleaseNoteList(result: PagedResult<ReleaseNoteSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} release note(s):`, ""];
  for (const note of result.items) {
    lines.push(`- ${note.title ?? "(untitled)"} — ${note.url}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderReleaseNote(note: ReleaseNoteSummary): TextContentBlock[] {
  const lines = [note.title ?? "(untitled)"];
  if (note.body) lines.push(note.body);
  return text(lines.join("\n"));
}

export function renderCustomerList(result: PagedResult<CustomerSummary>): TextContentBlock[] {
  const lines: string[] = [`${result.items.length} customer(s):`, ""];
  for (const customer of result.items) {
    lines.push(`- ${customer.name}`);
  }
  if (result.hasMore && result.nextCursor) {
    lines.push("", `More results available — call again with cursor: ${result.nextCursor}`);
  }
  return text(lines.join("\n"));
}

export function renderCustomer(customer: CustomerSummary): TextContentBlock[] {
  const lines = [customer.name];
  if (customer.externalIds && customer.externalIds.length > 0) {
    lines.push(`External IDs: ${customer.externalIds.join(", ")}`);
  }
  return text(lines.join("\n"));
}
