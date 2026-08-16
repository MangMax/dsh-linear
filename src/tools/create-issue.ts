/**
 * `linear_create_issue` (plan §10.5).
 *
 * Inputs are human semantic names (team/project/status/assignee/labels);
 * the domain layer resolves them to Linear IDs via the MetadataResolver
 * (§14). This is a WRITE tool: subject to the write policy (§36).
 */
import type { ToolSpec } from "./types.ts";

export const createIssueTool: ToolSpec = {
  name: "linear_create_issue",
  description:
    "Create a Linear issue. Team, project, status, assignee and labels accept human names — no Linear IDs needed.",
  parameters: {
    title: { type: "string", required: true, description: "Issue title." },
    description: { type: "string", description: "Issue description (Markdown supported)." },
    team: { type: "string", description: 'Team name or key, e.g. "Engineering" or "ENG".' },
    project: { type: "string", description: 'Project name, e.g. "Backend".' },
    status: { type: "string", description: 'Workflow status name, e.g. "In Progress".' },
    assignee: { type: "string", description: "Assignee name or email." },
    priority: {
      type: "string",
      enum: ["urgent", "high", "medium", "low", "none"],
      description: "Priority.",
    },
    labels: { type: "array", items: { type: "string" }, description: "Label names." },
    dueDate: { type: "string", description: "Due date (ISO date)." },
  },
};

import { toToolDefinition, optionalEnum, optionalString, optionalStringArray } from "./define.ts";
import { issueDetailSchema } from "./schemas.ts";
import { renderCreateIssue } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { IssueService } from "../linear/services/issue-service.ts";
import type { PriorityInput } from "../model/issue.ts";

const PRIORITY_INPUTS: readonly PriorityInput[] = ["urgent", "high", "medium", "low", "none"];

/** Registry-ready definition bound to an issue service (plan §10.5, §30). */
export function createCreateIssueTool(issues: IssueService): ToolDefinition {
  return toToolDefinition(createIssueTool, issueDetailSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return issues.createIssue({
        title: typeof a.title === "string" ? a.title : "",
        description: optionalString(a.description),
        team: optionalString(a.team),
        project: optionalString(a.project),
        status: optionalString(a.status),
        assignee: optionalString(a.assignee),
        priority: optionalEnum(a.priority, PRIORITY_INPUTS),
        labels: optionalStringArray(a.labels),
        dueDate: optionalString(a.dueDate),
      });
    },
    render(value) {
      return renderCreateIssue(value);
    },
  });
}
