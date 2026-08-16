/**
 * `linear_delete_status_update` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const deleteStatusUpdateTool: ToolSpec = {
  name: "linear_delete_status_update",
  description: "Delete (archive) a project status update by ID.",
  parameters: {
    id: { type: "string", description: "Status update ID.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { okSchema } from "./schemas.ts";
import { renderOk } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { StatusUpdateService } from "../linear/services/status-update-service.ts";

/** Registry-ready definition bound to the status update service. */
export function createDeleteStatusUpdateTool(service: StatusUpdateService): ToolDefinition {
  return toToolDefinition(deleteStatusUpdateTool, okSchema, {
    async execute(args) {
      const a = args as { id?: unknown };
      await service.deleteStatusUpdate(optionalString(a.id) ?? "");
      return { ok: true };
    },
    render(value) {
      return renderOk(value);
    },
  });
}
