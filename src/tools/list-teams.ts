/**
 * `linear_list_teams` (plan §10.10).
 *
 * Used for workspace discovery, resolver fallback, and "which teams exist".
 */
import type { ToolSpec } from "./types.ts";

export const listTeamsTool: ToolSpec = {
  name: "linear_list_teams",
  description: "List Linear teams in the connected workspace.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { teamListResultSchema } from "./schemas.ts";
import { renderTeamList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { TeamService } from "../linear/services/team-service.ts";

/** Registry-ready definition bound to a team service (plan §10.10). */
export function createListTeamsTool(teams: TeamService): ToolDefinition {
  return toToolDefinition(listTeamsTool, teamListResultSchema, {
    async execute(args) {
      const a = args as { limit?: unknown; cursor?: unknown };
      return teams.listTeams({
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderTeamList(value);
    },
  });
}
