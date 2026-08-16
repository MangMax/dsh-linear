/**
 * `linear_get_customer` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const getCustomerTool: ToolSpec = {
  name: "linear_get_customer",
  description: "Get a Linear customer by ID or URL.",
  parameters: {
    customer: { type: "string", description: "Customer ID or URL. (required)" },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { customerProperty } from "./schemas.ts";
import { renderCustomer } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CustomerServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the CustomerServiceLike service. */
export function createGetCustomerTool(service: CustomerServiceLike): ToolDefinition {
  return toToolDefinition(getCustomerTool, customerProperty, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.getCustomer(optionalString(a.customer) ?? "");
    },
    render(value) {
      return renderCustomer(value);
    },
  });
}
