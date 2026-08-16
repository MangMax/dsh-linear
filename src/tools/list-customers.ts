/**
 * `linear_list_customers` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listCustomersTool: ToolSpec = {
  name: "linear_list_customers",
  description: "List customers in the Linear workspace.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { customerListResultSchema } from "./schemas.ts";
import { renderCustomerList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CustomerServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the CustomerServiceLike service. */
export function createListCustomersTool(service: CustomerServiceLike): ToolDefinition {
  return toToolDefinition(listCustomersTool, customerListResultSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.listCustomers({
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderCustomerList(value);
    },
  });
}
