/**
 * Linear Agent API service (plan §41–§43; Milestone 8).
 *
 * Thin wrapper over the SDK's agent-session / agent-activity mutations,
 * isolated in `src/agent/*` because Linear's Agent API is a Developer
 * Preview (plan §41): it must never pollute the base connector.
 *
 * Every call goes through {@link LinearClientFactoryLike} (credential
 * resolution, token fingerprint cache, §34 retry policy). Agent mutations are
 * classified as mutations in `src/linear/retry.ts`, so only 429 is retried —
 * re-sending an already-executed mutation could duplicate activities (§34
 * safety rationale).
 */
import type { LinearClientFactoryLike } from "../linear/client-factory.ts";
import { normalizeLinearError } from "../linear/error.ts";

/**
 * Structural `AgentActivityCreateInput` — the SDK does not export the input
 * type from its main entry, and the service only passes the shape through.
 * `content` follows the Linear docs (see `toLinearActivityContent`).
 */
export interface AgentActivityCreateInputLike {
  agentSessionId: string;
  content: Record<string, unknown>;
  ephemeral?: boolean;
  id?: string;
  signal?: string;
  signalMetadata?: Record<string, unknown>;
  contextualMetadata?: Record<string, unknown>;
}

export interface LinearAgentServiceLike {
  /**
   * `agentSessionUpdate` — e.g. external session URLs (the Linear UI links
   * back to the harness session) or the plan checklist (technology preview).
   */
  updateSession(id: string, input: Record<string, unknown>): Promise<boolean>;
  /** `agentActivityCreate` — mirror one user-comprehensible state (§43). */
  createActivity(input: AgentActivityCreateInputLike): Promise<boolean>;
}

/**
 * The agent API surface the SDK exposes on the client; structural so
 * contract tests can stub at the client boundary (plan §53.2).
 */
export interface LinearAgentClientLike {
  agentSessionUpdate(id: string, input: Record<string, unknown>): Promise<{ success: boolean }>;
  agentActivityCreate(
    input: AgentActivityCreateInputLike,
  ): Promise<{ success: boolean; agentActivity?: unknown }>;
}

export class LinearAgentService {
  private readonly factory: LinearClientFactoryLike;

  constructor(factory: LinearClientFactoryLike) {
    this.factory = factory;
  }

  async updateSession(id: string, input: Record<string, unknown>): Promise<boolean> {
    try {
      const client = (await this.factory.create()) as unknown as LinearAgentClientLike;
      const result = await client.agentSessionUpdate(id, input);
      return result.success;
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async createActivity(input: AgentActivityCreateInputLike): Promise<boolean> {
    try {
      const client = (await this.factory.create()) as unknown as LinearAgentClientLike;
      const result = await client.agentActivityCreate(input);
      return result.success;
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
