/**
 * `linear_create_milestone` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const createMilestoneTool: ToolSpec = {
  name: "linear_create_milestone",
  description: "Create a milestone in a Linear project.",
  parameters: {
    project: { type: "string", description: "Project name or ID.", required: true },
    name: { type: "string", description: "Milestone name.", required: true },
    targetDate: { type: "string", description: "Target date (YYYY-MM-DD)." },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { milestoneProperty } from "./schemas.ts";
import { renderMilestone } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { MilestoneService } from "../linear/services/document-service.ts";

/** Registry-ready definition bound to the milestone service. */
export function createCreateMilestoneTool(service: MilestoneService): ToolDefinition {
  return toToolDefinition(createMilestoneTool, milestoneProperty, {
    async execute(args) {
      const a = args as { project?: unknown; name?: unknown; targetDate?: unknown };
      return service.createMilestone(
        optionalString(a.project) ?? "",
        optionalString(a.name) ?? "",
        {
          targetDate: optionalString(a.targetDate),
        },
      );
    },
    render(value) {
      return renderMilestone(value);
    },
  });
}
