/**
 * `linear_create_status_update` (v0.2 continuation — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const createStatusUpdateTool: ToolSpec = {
  name: "linear_create_status_update",
  description: "Post a status update to a Linear project.",
  parameters: {
    project: { type: "string", description: "Project name or ID.", required: true },
    body: { type: "string", description: "Status update body (Markdown).", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { statusUpdateProperty } from "./schemas.ts";
import { renderStatusUpdate } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { StatusUpdateService } from "../linear/services/status-update-service.ts";

/** Registry-ready definition bound to a status update service. */
export function createCreateStatusUpdateTool(updates: StatusUpdateService): ToolDefinition {
  return toToolDefinition(createStatusUpdateTool, statusUpdateProperty, {
    async execute(args) {
      const a = args as { project?: unknown; body?: unknown };
      return updates.createStatusUpdate(
        optionalString(a.project) ?? "",
        optionalString(a.body) ?? "",
      );
    },
    render(value) {
      return renderStatusUpdate(value);
    },
  });
}
