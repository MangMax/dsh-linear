/**
 * `linear_delete_customer` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const deleteCustomerTool: ToolSpec = {
  name: "linear_delete_customer",
  description: "Delete a Linear customer by ID.",
  parameters: {
    id: { type: "string", description: "Customer ID.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { okSchema } from "./schemas.ts";
import { renderOk } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CustomerServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the customer service. */
export function createDeleteCustomerTool(service: CustomerServiceLike): ToolDefinition {
  return toToolDefinition(deleteCustomerTool, okSchema, {
    async execute(args) {
      const a = args as { id?: unknown };
      await service.deleteCustomer(optionalString(a.id) ?? "");
      return { ok: true };
    },
    render(value) {
      return renderOk(value);
    },
  });
}
