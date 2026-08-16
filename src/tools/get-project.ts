/**
 * `linear_get_project` (plan §10.9).
 *
 * Returns name, description, status, lead, teams, target date, progress, and
 * a LIMITED window of recent updates. Accepts a project name, ID, or URL
 * (resolved by the ProjectResolver in the domain layer, §14 / §31).
 */
import type { ToolSpec } from "./types.ts";

export const getProjectTool: ToolSpec = {
  name: "linear_get_project",
  description:
    "Get a Linear project with its description, status, lead, teams, target date, progress, and recent updates.",
  parameters: {
    project: {
      type: "string",
      required: true,
      description: "Project name, ID, or URL.",
    },
  },
};

import { toToolDefinition } from "./define.ts";
import { projectDetailSchema } from "./schemas.ts";
import { renderGetProject } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ProjectService } from "../linear/services/project-service.ts";

/** Registry-ready definition bound to a project service (plan §10.9). */
export function createGetProjectTool(projects: ProjectService): ToolDefinition {
  return toToolDefinition(getProjectTool, projectDetailSchema, {
    async execute(args) {
      const a = args as { project?: unknown };
      return projects.getProject(typeof a.project === "string" ? a.project : "");
    },
    render(value) {
      return renderGetProject(value);
    },
  });
}
