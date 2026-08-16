/**
 * Tool specification shape (plan §9).
 *
 * Milestone 2 formalizes these specs into `defineTool(...)` calls from
 * `@deepseek-ai/dsh-tools` (parameter DSL + ValueSchemaSpec output DSL, see
 * the toolchain notes in §9 / 附录 A.5). The skeleton keeps them as plain
 * declarative objects so the catalog can be reviewed and tested early.
 */

/** Parameter schema in the attribute-level DSL: `{ type, required?, description }`. */
export interface ToolParameterSpec {
  type: "string" | "number" | "boolean" | "array";
  required?: boolean;
  description?: string;
  items?: { type: "string" | "number" };
  enum?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, ToolParameterSpec>;
}

/**
 * Structural text content block — the only block kind this plugin renders
 * (plan §13). `{ type: "text", text }` is the dsh-llm TextBlock, so
 * these arrays are assignable to the real `ContentBlock[]` contract without
 * depending on @deepseek-ai/dsh-llm directly.
 */
export interface TextContentBlock {
  type: "text";
  text: string;
}
