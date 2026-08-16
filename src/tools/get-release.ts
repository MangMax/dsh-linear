/**
 * `linear_get_release` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const getReleaseTool: ToolSpec = {
  name: "linear_get_release",
  description: "Get a Linear release by ID or URL.",
  parameters: {
    release: { type: "string", description: "Release ID or URL. (required)" },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { releaseProperty } from "./schemas.ts";
import { renderRelease } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ReleaseServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the ReleaseServiceLike service. */
export function createGetReleaseTool(service: ReleaseServiceLike): ToolDefinition {
  return toToolDefinition(getReleaseTool, releaseProperty, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.getRelease(optionalString(a.release) ?? "");
    },
    render(value) {
      return renderRelease(value);
    },
  });
}
