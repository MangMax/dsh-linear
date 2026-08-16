/**
 * `linear_update_status_update` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const updateStatusUpdateTool: ToolSpec = {
  name: "linear_update_status_update",
  description: "Update a project status update body by ID.",
  parameters: {
    id: { type: "string", description: "Status update ID.", required: true },
    body: { type: "string", description: "New body (Markdown).", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { statusUpdateProperty } from "./schemas.ts";
import { renderStatusUpdate } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { StatusUpdateService } from "../linear/services/status-update-service.ts";

/** Registry-ready definition bound to the status update service. */
export function createUpdateStatusUpdateTool(service: StatusUpdateService): ToolDefinition {
  return toToolDefinition(updateStatusUpdateTool, statusUpdateProperty, {
    async execute(args) {
      const a = args as { id?: unknown; body?: unknown };
      return service.updateStatusUpdate(optionalString(a.id) ?? "", optionalString(a.body) ?? "");
    },
    render(value) {
      return renderStatusUpdate(value);
    },
  });
}
