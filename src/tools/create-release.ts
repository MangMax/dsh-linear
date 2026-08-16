/**
 * `linear_create_release` (v0.2 continuation — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const createReleaseTool: ToolSpec = {
  name: "linear_create_release",
  description: "Create a release in a Linear release pipeline (resolved by name).",
  parameters: {
    name: { type: "string", description: "Release name.", required: true },
    pipeline: {
      type: "string",
      description: "Release pipeline (stage) name or ID.",
      required: true,
    },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { releaseProperty } from "./schemas.ts";
import { renderRelease } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ReleaseServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the release service. */
export function createCreateReleaseTool(service: ReleaseServiceLike): ToolDefinition {
  return toToolDefinition(createReleaseTool, releaseProperty, {
    async execute(args) {
      const a = args as { name?: unknown; pipeline?: unknown };
      return service.createRelease(optionalString(a.name) ?? "", optionalString(a.pipeline) ?? "");
    },
    render(value) {
      return renderRelease(value);
    },
  });
}
