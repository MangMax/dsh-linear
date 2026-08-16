/**
 * `linear_update_customer` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const updateCustomerTool: ToolSpec = {
  name: "linear_update_customer",
  description: "Update a Linear customer name by ID.",
  parameters: {
    id: { type: "string", description: "Customer ID.", required: true },
    name: { type: "string", description: "New customer name.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { customerProperty } from "./schemas.ts";
import { renderCustomer } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CustomerServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the customer service. */
export function createUpdateCustomerTool(service: CustomerServiceLike): ToolDefinition {
  return toToolDefinition(updateCustomerTool, customerProperty, {
    async execute(args) {
      const a = args as { id?: unknown; name?: unknown };
      return service.updateCustomer(optionalString(a.id) ?? "", optionalString(a.name) ?? "");
    },
    render(value) {
      return renderCustomer(value);
    },
  });
}
