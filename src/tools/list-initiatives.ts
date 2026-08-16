/**
 * `linear_list_initiatives` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listInitiativesTool: ToolSpec = {
  name: "linear_list_initiatives",
  description: "List initiatives in the Linear workspace.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { initiativeListResultSchema } from "./schemas.ts";
import { renderInitiativeList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { InitiativeServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the InitiativeServiceLike service. */
export function createListInitiativesTool(service: InitiativeServiceLike): ToolDefinition {
  return toToolDefinition(listInitiativesTool, initiativeListResultSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.listInitiatives({
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderInitiativeList(value);
    },
  });
}
