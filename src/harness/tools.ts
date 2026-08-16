/**
 * Tool registration adapter (plan §9, §37).
 *
 * Wired to `ctx.tools.register` in `src/harness/plugin.ts`; tools are defined
 * with `defineTool` from `@deepseek-ai/dsh-tools` (see `src/tools/define.ts`)
 * and registered through this seam so a dsh-tools API change only touches
 * `src/harness/*`.
 *
 * Lifecycle: `register` returns the exact disposer that unregisters the tool;
 * the plugin wraps it in `ctx.effect(...)` so unloading the plugin removes
 * every registered tool.
 */
import type { ToolRuntime, ToolDefinition } from "@deepseek-ai/dsh-tools";

export interface ToolRegistrar {
  register(tool: ToolDefinition): () => void;
}

export class HarnessToolRegistrar implements ToolRegistrar {
  constructor(private readonly tools: ToolRuntime) {}

  register(tool: ToolDefinition): () => void {
    return this.tools.register(tool);
  }
}
