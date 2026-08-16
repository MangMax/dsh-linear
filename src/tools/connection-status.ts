/**
 * `linear_connection_status` (plan §10.1).
 *
 * Confirms whether Linear is connected and reports the active workspace and
 * viewer. Never returns tokens.
 */
import type { ToolSpec } from "./types.ts";

export const connectionStatusTool: ToolSpec = {
  name: "linear_connection_status",
  description: "Check whether Linear is connected, and report the active workspace and viewer.",
  parameters: {},
};

import { toToolDefinition } from "./define.ts";
import { connectionStatusSchema } from "./schemas.ts";
import { renderConnectionStatus } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ConnectionStatusService } from "../linear/services/workspace-service.ts";

/** Registry-ready definition bound to a workspace service (plan §10.1). */
export function createConnectionStatusTool(workspace: ConnectionStatusService): ToolDefinition {
  return toToolDefinition(connectionStatusTool, connectionStatusSchema, {
    async execute() {
      return workspace.getConnectionStatus();
    },
    render(value) {
      return renderConnectionStatus(value);
    },
  });
}
