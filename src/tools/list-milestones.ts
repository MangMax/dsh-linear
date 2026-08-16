/**
 * `linear_list_milestones` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listMilestonesTool: ToolSpec = {
  name: "linear_list_milestones",
  description: "List project milestones in the workspace, optionally for one project.",
  parameters: {
    project: { type: "string", description: "Project name or ID to narrow the result." },
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { milestoneListResultSchema } from "./schemas.ts";
import { renderMilestoneList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { MilestoneService } from "../linear/services/document-service.ts";

/** Registry-ready definition bound to a milestone service. */
export function createListMilestonesTool(milestones: MilestoneService): ToolDefinition {
  return toToolDefinition(listMilestonesTool, milestoneListResultSchema, {
    async execute(args) {
      const a = args as { project?: unknown; limit?: unknown; cursor?: unknown };
      return milestones.listMilestones({
        project: optionalString(a.project),
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderMilestoneList(value);
    },
  });
}
