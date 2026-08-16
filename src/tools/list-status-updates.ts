/**
 * `linear_list_status_updates` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listStatusUpdatesTool: ToolSpec = {
  name: "linear_list_status_updates",
  description: "List project status updates, optionally for one project.",
  parameters: {
    project: { type: "string", description: "Project name or ID to narrow the result." },
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { statusUpdateListResultSchema } from "./schemas.ts";
import { renderStatusUpdateList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { StatusUpdateService } from "../linear/services/status-update-service.ts";

/** Registry-ready definition bound to a status update service. */
export function createListStatusUpdatesTool(updates: StatusUpdateService): ToolDefinition {
  return toToolDefinition(listStatusUpdatesTool, statusUpdateListResultSchema, {
    async execute(args) {
      const a = args as { project?: unknown; limit?: unknown; cursor?: unknown };
      return updates.listStatusUpdates({
        project: optionalString(a.project),
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderStatusUpdateList(value);
    },
  });
}
