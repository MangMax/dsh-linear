/**
 * `linear_update_issue` (plan §10.6).
 *
 * Only explicit fields may change — no arbitrary payloads. `project`,
 * `assignee` and `dueDate` accept `null` to clear them. WRITE tool: subject
 * to the write policy (§36).
 */
import type { ToolSpec } from "./types.ts";

export const updateIssueTool: ToolSpec = {
  name: "linear_update_issue",
  description:
    "Update a Linear issue. Only the provided fields change; pass null to clear project, assignee or due date.",
  parameters: {
    issue: {
      type: "string",
      required: true,
      description: "Linear issue identifier such as ENG-123, or an issue URL.",
    },
    title: { type: "string", description: "New title." },
    description: { type: "string", description: "New description (Markdown supported)." },
    project: { type: "string", description: 'Project name, e.g. "Backend"; null clears it.' },
    status: { type: "string", description: 'Workflow status name, e.g. "In Progress".' },
    assignee: { type: "string", description: "Assignee name or email; null clears it." },
    priority: {
      type: "string",
      enum: ["urgent", "high", "medium", "low", "none"],
      description: "Priority.",
    },
    labels: {
      type: "array",
      items: { type: "string" },
      description: "Full replacement label set.",
    },
    dueDate: { type: "string", description: "Due date (ISO date); null clears it." },
  },
};

import { toToolDefinition, optionalEnum, optionalString, optionalStringArray } from "./define.ts";
import { issueDetailSchema } from "./schemas.ts";
import { renderUpdateIssue } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { IssueService } from "../linear/services/issue-service.ts";
import type { PriorityInput } from "../model/issue.ts";

const PRIORITY_INPUTS: readonly PriorityInput[] = ["urgent", "high", "medium", "low", "none"];

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}

/** Registry-ready definition bound to an issue service (plan §10.6, §30). */
export function createUpdateIssueTool(issues: IssueService): ToolDefinition {
  return toToolDefinition(updateIssueTool, issueDetailSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return issues.updateIssue({
        issue: typeof a.issue === "string" ? a.issue : "",
        title: optionalString(a.title),
        description: optionalString(a.description),
        project: nullableString(a.project),
        status: optionalString(a.status),
        assignee: nullableString(a.assignee),
        priority: optionalEnum(a.priority, PRIORITY_INPUTS),
        labels: optionalStringArray(a.labels),
        dueDate: nullableString(a.dueDate),
      });
    },
    render(value) {
      return renderUpdateIssue(value);
    },
  });
}
