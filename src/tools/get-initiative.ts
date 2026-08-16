/**
 * `linear_get_initiative` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const getInitiativeTool: ToolSpec = {
  name: "linear_get_initiative",
  description: "Get a Linear initiative by ID or URL.",
  parameters: {
    initiative: { type: "string", description: "Initiative ID or URL. (required)" },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { initiativeProperty } from "./schemas.ts";
import { renderInitiative } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { InitiativeServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the InitiativeServiceLike service. */
export function createGetInitiativeTool(service: InitiativeServiceLike): ToolDefinition {
  return toToolDefinition(getInitiativeTool, initiativeProperty, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.getInitiative(optionalString(a.initiative) ?? "");
    },
    render(value) {
      return renderInitiative(value);
    },
  });
}
