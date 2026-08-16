/**
 * Pipeline-level write gate (plan §36, §37).
 *
 * The write policy is enforced at the tool pipeline, not inside individual
 * tools: read tools pass automatically, write tools are gated by the
 * configured `writePolicy` (`ask` default, `allow`, `deny`). The gate is a
 * `tools/pre-execute` waterfall listener that returns a `PreToolDecision`:
 *
 * - `allow` — the call proceeds (read tools, and write tools under `allow`).
 * - `deny` — the call is blocked with the configured reason.
 * - `ask` — the registry resolves the decision through the deployment's
 *   approval service (`ctx.approval`, `dsh-user-approval`); without one the
 *   registry fails closed and denies with the reason.
 *
 * Downstream decisions are never overridden: if an earlier listener already
 * asked or denied, the gate passes that decision through (guards can deny,
 * nothing can force-allow).
 */
import { Context } from "@deepseek-ai/cordis";
import type { PreToolDecision } from "@deepseek-ai/dsh-tools";
import type { WritePolicy } from "../model/connection.ts";
import { evaluateWritePolicy, type WriteDecision } from "./write-policy.ts";

export interface WriteGateDecision {
  decision: WriteDecision;
  reason?: string;
}

/** Pure policy → gate mapping; the harness listener is a thin wrapper. */
export function writeGateDecision(policy: WritePolicy, toolName: string): WriteGateDecision {
  const decision = evaluateWritePolicy(policy, toolName);
  if (decision === "allow") {
    return { decision };
  }
  if (decision === "deny") {
    return {
      decision,
      reason:
        `Tool "${toolName}" modifies Linear data and linear.writePolicy is set to deny. ` +
        `Ask a human to change the policy before retrying.`,
    };
  }
  return {
    decision,
    reason:
      `Tool "${toolName}" modifies Linear data; approve this call to continue ` +
      `(linear.writePolicy = ask).`,
  };
}

/**
 * Register the gate as a `tools/pre-execute` listener. The returned function
 * unregisters it (call it from the plugin's effect cleanup).
 */
export function registerWriteGate(ctx: Context, policy: WritePolicy): () => void {
  return ctx.on("tools/pre-execute", async (exec, next): Promise<PreToolDecision> => {
    const downstream = await next();
    if (downstream.kind !== "allow") {
      return downstream;
    }
    const gate = writeGateDecision(policy, exec.name);
    if (gate.decision === "deny") {
      return { kind: "deny", reason: gate.reason ?? `Tool "${exec.name}" is denied.` };
    }
    if (gate.decision === "ask") {
      return { kind: "ask", reason: gate.reason };
    }
    return { kind: "allow" };
  });
}
