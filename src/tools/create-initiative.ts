/**
 * `linear_create_initiative` (v0.2 continuation — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const createInitiativeTool: ToolSpec = {
  name: "linear_create_initiative",
  description: "Create a new Linear initiative.",
  parameters: {
    name: { type: "string", description: "Initiative name.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { initiativeProperty } from "./schemas.ts";
import { renderInitiative } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { InitiativeServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the initiative service. */
export function createCreateInitiativeTool(service: InitiativeServiceLike): ToolDefinition {
  return toToolDefinition(createInitiativeTool, initiativeProperty, {
    async execute(args) {
      const a = args as { name?: unknown };
      return service.createInitiative(optionalString(a.name) ?? "");
    },
    render(value) {
      return renderInitiative(value);
    },
  });
}
