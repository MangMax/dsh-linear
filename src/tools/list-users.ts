/**
 * `linear_list_users` (v0.2 tool batch).
 *
 * Workspace member discovery: "who can be assigned / who is on the team".
 */
import type { ToolSpec } from "./types.ts";

export const listUsersTool: ToolSpec = {
  name: "linear_list_users",
  description: "List Linear workspace users.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { userListResultSchema } from "./schemas.ts";
import { renderUserList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { UserService } from "../linear/services/user-service.ts";

/** Registry-ready definition bound to a user service. */
export function createListUsersTool(users: UserService): ToolDefinition {
  return toToolDefinition(listUsersTool, userListResultSchema, {
    async execute(args) {
      const a = args as { limit?: unknown; cursor?: unknown };
      return users.listUsers({ limit: optionalNumber(a.limit), cursor: optionalString(a.cursor) });
    },
    render(value) {
      return renderUserList(value);
    },
  });
}
