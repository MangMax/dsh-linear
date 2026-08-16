/**
 * `linear_delete_customer_need` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const deleteCustomerNeedTool: ToolSpec = {
  name: "linear_delete_customer_need",
  description: "Archive a customer need by ID.",
  parameters: {
    id: { type: "string", description: "Customer need ID.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { okSchema } from "./schemas.ts";
import { renderOk } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CustomerServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the customer service. */
export function createDeleteCustomerNeedTool(service: CustomerServiceLike): ToolDefinition {
  return toToolDefinition(deleteCustomerNeedTool, okSchema, {
    async execute(args) {
      const a = args as { id?: unknown };
      await service.deleteCustomerNeed(optionalString(a.id) ?? "");
      return { ok: true };
    },
    render(value) {
      return renderOk(value);
    },
  });
}
