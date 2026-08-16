/**
 * `linear_list_projects` (plan §10.8).
 */
import type { ToolSpec } from "./types.ts";

export const listProjectsTool: ToolSpec = {
  name: "linear_list_projects",
  description: "List Linear projects, optionally filtered by team, status, or name.",
  parameters: {
    team: { type: "string", description: 'Team name or key, e.g. "Engineering" or "ENG".' },
    state: { type: "string", description: 'Project status name, e.g. "In Progress" or "Planned".' },
    query: { type: "string", description: "Free-text name filter." },
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { projectListResultSchema } from "./schemas.ts";
import { renderProjectList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ProjectService } from "../linear/services/project-service.ts";

/** Registry-ready definition bound to a project service (plan §10.8, §32). */
export function createListProjectsTool(projects: ProjectService): ToolDefinition {
  return toToolDefinition(listProjectsTool, projectListResultSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return projects.listProjects({
        team: optionalString(a.team),
        state: optionalString(a.state),
        query: optionalString(a.query),
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderProjectList(value);
    },
  });
}
