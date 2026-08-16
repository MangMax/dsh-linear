/**
 * `linear_create_customer` (v0.2 continuation — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const createCustomerTool: ToolSpec = {
  name: "linear_create_customer",
  description: "Create a new Linear customer.",
  parameters: {
    name: { type: "string", description: "Customer display name.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { customerProperty } from "./schemas.ts";
import { renderCustomer } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CustomerServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the customer service. */
export function createCreateCustomerTool(service: CustomerServiceLike): ToolDefinition {
  return toToolDefinition(createCustomerTool, customerProperty, {
    async execute(args) {
      const a = args as { name?: unknown };
      return service.createCustomer(optionalString(a.name) ?? "");
    },
    render(value) {
      return renderCustomer(value);
    },
  });
}
