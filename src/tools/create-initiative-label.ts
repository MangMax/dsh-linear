/**
 * `linear_create_initiative_label` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const createInitiativeLabelTool: ToolSpec = {
  name: "linear_create_initiative_label",
  description: "Create a new Linear initiative label.",
  parameters: {
    name: { type: "string", description: "Label name.", required: true },
    color: { type: "string", description: "Hex color, e.g. #ff0000." },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { initiativeLabelProperty } from "./schemas.ts";
import { renderInitiativeLabelList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { InitiativeServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the initiative service. */
export function createCreateInitiativeLabelTool(service: InitiativeServiceLike): ToolDefinition {
  return toToolDefinition(createInitiativeLabelTool, initiativeLabelProperty, {
    async execute(args) {
      const a = args as { name?: unknown; color?: unknown };
      return service.createInitiativeLabel(optionalString(a.name) ?? "", {
        color: optionalString(a.color),
      });
    },
    render(value) {
      return renderInitiativeLabelList({ items: [value as never], hasMore: false } as never);
    },
  });
}
