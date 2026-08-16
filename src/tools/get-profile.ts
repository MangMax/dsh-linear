/**
 * `linear_get_profile` (v0.2 continuation).
 *
 * The authenticated user's own profile (viewer).
 */
import type { ToolSpec } from "./types.ts";

export const getProfileTool: ToolSpec = {
  name: "linear_get_profile",
  description: "Get the currently authenticated Linear user's profile.",
  parameters: {},
};

import { toToolDefinition } from "./define.ts";
import { profileSchema } from "./schemas.ts";
import { renderProfile } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ViewerInfo } from "../model/connection.ts";

/** Registry-ready definition bound to a viewer provider. */
export function createGetProfileTool(viewer: () => Promise<ViewerInfo>): ToolDefinition {
  return toToolDefinition(getProfileTool, profileSchema, {
    async execute() {
      return viewer();
    },
    render(value) {
      return renderProfile(value);
    },
  });
}
