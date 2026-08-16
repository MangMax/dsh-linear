/**
 * ToolSpec → dsh-tools definition helpers (plan §9).
 *
 * The declarative catalog entries in `src/tools/*` stay the single source of
 * truth for name / description / parameters; these helpers adapt them to the
 * `defineTool` DSL so registration carries strict argument validation,
 * canonical output schemas, and model-facing renders.
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {
  JsonValue,
  ParameterPropertySpec,
  ParameterSchemaSpec,
  ValueSchemaSpec,
} from "@deepseek-ai/dsh-tools";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { TextContentBlock, ToolSpec } from "./types.ts";

const ARRAY_ITEM_TYPES = { string: "string", number: "number" } as const;

export function toolParameterSchema(spec: ToolSpec): ParameterSchemaSpec {
  const properties: ParameterSchemaSpec = {};
  for (const [key, value] of Object.entries(spec.parameters)) {
    const property: Record<string, unknown> = {
      type: value.type,
      description: value.description,
    };
    if (value.type === "array") {
      property.items = value.items
        ? { type: ARRAY_ITEM_TYPES[value.items.type] }
        : { type: "string" };
    }
    if (value.enum) {
      property.enum = value.enum;
    }
    if (value.required) {
      property.required = true;
    }
    properties[key] = property as unknown as ParameterPropertySpec;
  }
  return properties;
}

export interface DefinitionCallbacks<V = JsonValue> {
  execute(args: Record<string, unknown>): Promise<V>;
  render(value: V): TextContentBlock[];
}

/**
 * Recursively drop `undefined` property values.
 *
 * The harness tool pipeline requires LOSSESS JSON output — a single
 * `undefined` property value (e.g. an absent optional field) invalidates the
 * whole tool result ("value is not lossless JSON", surfaced by the first
 * real harness run of the list tools). This boundary wrapper guarantees the
 * contract without auditing every canonical mapper; absent fields simply
 * disappear, which JSON.stringify would do anyway.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      result[key] = stripUndefined(item);
    }
    return result as T;
  }
  return value;
}

/**
 * Build a registry-ready {@link ToolDefinition} from a catalog spec.
 * The output schema is enforced against every successful canonical value;
 * `render` projects it to compact model-facing content (plan §13).
 *
 * The definition is assembled with explicit `any` type arguments: the
 * dsh-tools DSL types recurse out of bounds when inferring over a broad
 * parameter schema (verified on the target wave), and every field of the
 * literal is still checked against the per-tool `DefinitionCallbacks<V>`
 * shape before it is handed to `defineTool`.
 */
export function toToolDefinition<V>(
  spec: ToolSpec,
  output: ValueSchemaSpec,
  callbacks: DefinitionCallbacks<V>,
): ToolDefinition {
  const options = {
    name: spec.name,
    description: spec.description,
    parameters: toolParameterSchema(spec),
    output: {
      schema: output,
      render: (_args: unknown, value: V) => callbacks.render(value),
    },
    execute: async (args: unknown) =>
      stripUndefined(await callbacks.execute(args as Record<string, unknown>)),
  };
  return defineTool<any, any>(options);
}

// ---------------------------------------------------------- arg extraction

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}

export function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
