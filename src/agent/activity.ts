/**
 * Agent activity model and Linear mapping (plan §43; Milestone 8).
 *
 * Only user-comprehensible high-level states are mirrored to Linear — never
 * chain-of-thought, hidden reasoning, or raw model scratchpad (§43). The
 * canonical model here is what the bridge / harness driver produce; the
 * {@link toLinearActivityContent} mapper turns it into the exact
 * `AgentActivityCreateInput.content` payload Linear validates server-side.
 *
 * Mapping (plan §43, Linear "Developing the Agent Interaction" docs):
 *
 * ```text
 * Harness start         → thought/status      (ephemeral)
 * Tool execution        → action              (ephemeral)
 * Tool completion       → action result summary
 * Waiting for user      → elicitation
 * Agent finished        → response
 * Agent failed          → error
 * ```
 *
 * Linear's docs allow `ephemeral` only for `thought` and `action` — the
 * mapper enforces that by dropping the flag for the other kinds.
 */
import type { JsonValue } from "@deepseek-ai/dsh-session";

/** Canonical agent activity kinds (plan §43). */
export type AgentActivityKind =
  | "thought"
  | "action"
  | "action_result"
  | "elicitation"
  | "response"
  | "error";

/** One user-comprehensible state to mirror to Linear (plan §43). */
export interface AgentActivity {
  kind: AgentActivityKind;
  /** Markdown, user-comprehensible summary only (§43). */
  summary: string;
  createdAt: string;
  /** Required for `action` / `action_result`: the human action label ("搜索", "修改文件"). */
  action?: string;
  /** Required for `action` / `action_result`: the action parameter ("ENG-123"). */
  parameter?: string;
  /** For `action_result`: the completed action's summary in Markdown. */
  result?: string;
  /**
   * Ephemeral activities are replaced by the next activity from the agent
   * (Linear docs). Only meaningful for `thought` and `action`; ignored for
   * the other kinds.
   */
  ephemeral?: boolean;
}

/**
 * The validated JSON content payload for `agentActivityCreate` (§43). Linear
 * accepts `JSONObject` — every mapped shape is an object.
 */
export type LinearActivityContent = Record<string, JsonValue>;

/** Truncation guards: mirror summaries stay small and readable (§43). */
export const MAX_ACTIVITY_SUMMARY_CHARS = 4000;
export const MAX_ACTION_RESULT_CHARS = 400;
export const MAX_ACTION_PARAMETER_CHARS = 120;

/** Clamp a mirror summary to the Linear-friendly size. */
export function clampSummary(text: string, max = MAX_ACTIVITY_SUMMARY_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function actionContent(activity: AgentActivity): LinearActivityContent {
  const { action = activity.summary, parameter = "" } = activity;
  if (activity.kind === "action_result") {
    return {
      type: "action",
      action,
      parameter: clampSummary(parameter, MAX_ACTION_PARAMETER_CHARS),
      result: clampSummary(activity.result ?? activity.summary, MAX_ACTION_RESULT_CHARS),
    };
  }
  return {
    type: "action",
    action,
    parameter: clampSummary(parameter, MAX_ACTION_PARAMETER_CHARS),
  };
}

function bodyContent(
  type: "thought" | "elicitation" | "response" | "error",
  activity: AgentActivity,
): LinearActivityContent {
  return { type, body: clampSummary(activity.summary) };
}

/**
 * Map a canonical {@link AgentActivity} to the Linear
 * `AgentActivityCreateInput.content` payload. The shapes follow the Linear
 * docs exactly — Linear validates them server-side and rejects invalid
 * shapes, so this mapper is the single place that must stay aligned.
 */
export function toLinearActivityContent(activity: AgentActivity): LinearActivityContent {
  switch (activity.kind) {
    case "thought":
      return bodyContent("thought", activity);
    case "action":
    case "action_result":
      return actionContent(activity);
    case "elicitation":
      return bodyContent("elicitation", activity);
    case "response":
      return bodyContent("response", activity);
    case "error":
      return bodyContent("error", activity);
  }
}

/** Whether Linear accepts the `ephemeral` flag for this kind (docs). */
export function ephemeralAllowed(kind: AgentActivityKind): boolean {
  return kind === "thought" || kind === "action";
}

/**
 * Build a canonical activity with a stable timestamp. `ephemeral` is only
 * carried when Linear allows it for the kind.
 */
export function createAgentActivity(
  kind: AgentActivityKind,
  fields: Omit<AgentActivity, "kind" | "createdAt">,
  now: Date = new Date(),
): AgentActivity {
  return {
    kind,
    summary: fields.summary,
    createdAt: now.toISOString(),
    ...(fields.action !== undefined ? { action: fields.action } : {}),
    ...(fields.parameter !== undefined ? { parameter: fields.parameter } : {}),
    ...(fields.result !== undefined ? { result: fields.result } : {}),
    ...(fields.ephemeral && ephemeralAllowed(kind) ? { ephemeral: true } : {}),
  };
}
