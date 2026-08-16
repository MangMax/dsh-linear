/**
 * `linear_get_issue_status` (Codex parity — READ).
 */
import type { ToolSpec } from "./types.ts";

export const getIssueStatusTool: ToolSpec = {
  name: "linear_get_issue_status",
  description: "Get a workflow state (status) by name or ID within a team.",
  parameters: {
    team: { type: "string", description: "Team name, key (e.g. ENG), or ID.", required: true },
    status: {
      type: "string",
      description: 'Status name (e.g. "In Progress") or ID.',
      required: true,
    },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { workflowStateProperty } from "./schemas.ts";
import { renderWorkflowStateList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { TeamService } from "../linear/services/team-service.ts";

/** Registry-ready definition bound to the team service. */
export function createGetIssueStatusTool(service: TeamService): ToolDefinition {
  return toToolDefinition(getIssueStatusTool, workflowStateProperty, {
    async execute(args) {
      const a = args as { team?: unknown; status?: unknown };
      return service.getWorkflowState(optionalString(a.team) ?? "", optionalString(a.status) ?? "");
    },
    render(value) {
      return renderWorkflowStateList({ items: [value as never], hasMore: false } as never);
    },
  });
}
