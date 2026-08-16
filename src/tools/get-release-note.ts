/**
 * `linear_get_release_note` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const getReleaseNoteTool: ToolSpec = {
  name: "linear_get_release_note",
  description: "Get release notes by ID or URL, including markdown content.",
  parameters: {
    note: { type: "string", description: "Release note ID or URL. (required)" },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { releaseNoteProperty } from "./schemas.ts";
import { renderReleaseNote } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ReleaseServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the ReleaseServiceLike service. */
export function createGetReleaseNoteTool(service: ReleaseServiceLike): ToolDefinition {
  return toToolDefinition(getReleaseNoteTool, releaseNoteProperty, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.getReleaseNote(optionalString(a.note) ?? "");
    },
    render(value) {
      return renderReleaseNote(value);
    },
  });
}
