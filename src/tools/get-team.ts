/**
 * `linear_get_team` (v0.2 tool batch).
 *
 * Team details by name, key, or ID (resolver, §14.1): counts, cycles and
 * triage configuration.
 */
import type { ToolSpec } from "./types.ts";

export const getTeamTool: ToolSpec = {
  name: "linear_get_team",
  description: "Get Linear team details by name, key, or ID.",
  parameters: {
    team: { type: "string", description: "Team name, key (e.g. ENG), or ID.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { teamDetailSchema } from "./schemas.ts";
import { renderTeamDetail } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { TeamService } from "../linear/services/team-service.ts";

/** Registry-ready definition bound to a team service. */
export function createGetTeamTool(teams: TeamService): ToolDefinition {
  return toToolDefinition(getTeamTool, teamDetailSchema, {
    async execute(args) {
      const a = args as { team?: unknown };
      return teams.getTeam(optionalString(a.team) ?? "");
    },
    render(value) {
      return renderTeamDetail(value);
    },
  });
}
