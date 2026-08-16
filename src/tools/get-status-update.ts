/**
 * `linear_get_status_update` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const getStatusUpdateTool: ToolSpec = {
  name: "linear_get_status_update",
  description: "Get a project status update by ID or URL.",
  parameters: {
    update: { type: "string", description: "Status update ID or URL.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { statusUpdateProperty } from "./schemas.ts";
import { renderStatusUpdate } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { StatusUpdateService } from "../linear/services/status-update-service.ts";

/** Registry-ready definition bound to a status update service. */
export function createGetStatusUpdateTool(updates: StatusUpdateService): ToolDefinition {
  return toToolDefinition(getStatusUpdateTool, statusUpdateProperty, {
    async execute(args) {
      const a = args as { update?: unknown };
      return updates.getStatusUpdate(optionalString(a.update) ?? "");
    },
    render(value) {
      return renderStatusUpdate(value);
    },
  });
}
