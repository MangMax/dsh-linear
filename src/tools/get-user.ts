/**
 * `linear_get_user` (v0.2 tool batch).
 *
 * Look up one workspace user by name, email, or ID (resolver, §14.1).
 */
import type { ToolSpec } from "./types.ts";

export const getUserTool: ToolSpec = {
  name: "linear_get_user",
  description: "Get a Linear user by name, email, or ID.",
  parameters: {
    user: { type: "string", description: "User name, email, or ID.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { userProperty } from "./schemas.ts";
import { renderUser } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { UserService } from "../linear/services/user-service.ts";

/** Registry-ready definition bound to a user service. */
export function createGetUserTool(users: UserService): ToolDefinition {
  return toToolDefinition(getUserTool, userProperty, {
    async execute(args) {
      const a = args as { user?: unknown };
      return users.getUser(optionalString(a.user) ?? "");
    },
    render(value) {
      return renderUser(value);
    },
  });
}
