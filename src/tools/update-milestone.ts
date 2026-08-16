/**
 * `linear_update_milestone` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const updateMilestoneTool: ToolSpec = {
  name: "linear_update_milestone",
  description: "Update a project milestone by ID.",
  parameters: {
    id: { type: "string", description: "Milestone ID.", required: true },
    name: { type: "string", description: "New milestone name." },
    targetDate: { type: "string", description: "Target date (YYYY-MM-DD)." },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { milestoneProperty } from "./schemas.ts";
import { renderMilestone } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { MilestoneService } from "../linear/services/document-service.ts";

/** Registry-ready definition bound to the milestone service. */
export function createUpdateMilestoneTool(service: MilestoneService): ToolDefinition {
  return toToolDefinition(updateMilestoneTool, milestoneProperty, {
    async execute(args) {
      const a = args as { id?: unknown; name?: unknown; targetDate?: unknown };
      return service.updateMilestone(optionalString(a.id) ?? "", {
        name: optionalString(a.name),
        targetDate: optionalString(a.targetDate),
      });
    },
    render(value) {
      return renderMilestone(value);
    },
  });
}
