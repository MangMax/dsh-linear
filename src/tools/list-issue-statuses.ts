/**
 * `linear_list_issue_statuses` (v0.2 tool batch).
 *
 * Workflow states of one team — the names a `status` filter / create /
 * update argument accepts (plan §14.2 states catalog surfaced as a tool).
 */
import type { ToolSpec } from "./types.ts";

export const listIssueStatusesTool: ToolSpec = {
  name: "linear_list_issue_statuses",
  description: "List workflow states (statuses) of a Linear team.",
  parameters: {
    team: { type: "string", description: "Team name, key (e.g. ENG), or ID.", required: true },
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { workflowStateListResultSchema } from "./schemas.ts";
import { renderWorkflowStateList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { TeamService } from "../linear/services/team-service.ts";

/** Registry-ready definition bound to a team service. */
export function createListIssueStatusesTool(teams: TeamService): ToolDefinition {
  return toToolDefinition(listIssueStatusesTool, workflowStateListResultSchema, {
    async execute(args) {
      const a = args as { team?: unknown; limit?: unknown; cursor?: unknown };
      return teams.listWorkflowStates(optionalString(a.team) ?? "", {
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderWorkflowStateList(value);
    },
  });
}
