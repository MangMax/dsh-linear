/**
 * `linear_list_cycles` (plan §10.11).
 *
 * Current cycle, next cycle, or a team's cycle list. The team is required —
 * cycle names are team-local and resolution goes through the TeamResolver.
 */
import type { ToolSpec } from "./types.ts";

export const listCyclesTool: ToolSpec = {
  name: "linear_list_cycles",
  description: "List Linear cycles for a team.",
  parameters: {
    team: {
      type: "string",
      required: true,
      description: 'Team name or key, e.g. "Engineering" or "ENG".',
    },
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { cycleListResultSchema } from "./schemas.ts";
import { renderCycleList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CycleService } from "../linear/services/cycle-service.ts";

/** Registry-ready definition bound to a cycle service (plan §10.11). */
export function createListCyclesTool(cycles: CycleService): ToolDefinition {
  return toToolDefinition(listCyclesTool, cycleListResultSchema, {
    async execute(args) {
      const a = args as { team?: unknown; limit?: unknown; cursor?: unknown };
      const team = typeof a.team === "string" ? a.team : "";
      return cycles.listCycles({
        team,
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderCycleList(value);
    },
  });
}
