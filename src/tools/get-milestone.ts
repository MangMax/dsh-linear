/**
 * `linear_get_milestone` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const getMilestoneTool: ToolSpec = {
  name: "linear_get_milestone",
  description: "Get a project milestone by ID, URL, or name.",
  parameters: {
    milestone: { type: "string", description: "Milestone ID, URL, or name.", required: true },
    project: { type: "string", description: "Project name or ID — narrows a name lookup." },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { milestoneProperty } from "./schemas.ts";
import { renderMilestone } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { MilestoneService } from "../linear/services/document-service.ts";

/** Registry-ready definition bound to a milestone service. */
export function createGetMilestoneTool(milestones: MilestoneService): ToolDefinition {
  return toToolDefinition(getMilestoneTool, milestoneProperty, {
    async execute(args) {
      const a = args as { milestone?: unknown; project?: unknown };
      return milestones.getMilestone(optionalString(a.milestone) ?? "", {
        project: optionalString(a.project),
      });
    },
    render(value) {
      return renderMilestone(value);
    },
  });
}
