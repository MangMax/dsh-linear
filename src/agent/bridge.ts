/**
 * Linear Agent Bridge (plan §41; Milestone 8).
 *
 * Target flow (plan §41):
 *
 * ```text
 * Linear (@DeepSeek fix this issue)
 *    ↓ AgentSessionEvent webhook (created / prompted)
 * HarnessAgentBridge
 *    ↓ session mapping (§42) + HarnessSessionDriver
 * DeepSeek Harness agent
 *    ↓ user-comprehensible activities only (§43)
 * Linear Agent Activity (thought / action / response / error / elicitation)
 * ```
 *
 * - `created`  → persist the §42 mapping, mirror a start thought, dispatch a
 *   harness agent on the Linear `promptContext`.
 * - `prompted` → continue the live harness session with the new message
 *   (`agentActivity.body`); after a harness restart the persisted mapping is
 *   used to resume the session.
 *
 * Redelivered / duplicate events are absorbed: the mapping is the idempotency
 * source, and turns are serialized per Linear session.
 *
 * Linear's timing contract is respected at the route layer (5 s response);
 * here everything runs in the background and every failure is mirrored back
 * to Linear as an `error` activity when possible — the user always sees an
 * honest state (§43).
 */
import { createAgentActivity, toLinearActivityContent, type AgentActivity } from "./activity.ts";
import type { HarnessRun, HarnessSessionDriver } from "./harness-driver.ts";
import type { LinearAgentServiceLike } from "./linear-agent-service.ts";
import type { AgentSessionMapStore } from "./session-map.ts";

/** The verified `AgentSessionEvent` payload fields the bridge consumes. */
export interface AgentSessionEventLike {
  action: string;
  agentSession: {
    id: string;
    issue?: { id?: string; identifier?: string } | null;
  };
  /** Present on `created` events: a formatted prompt with issue + comments context. */
  promptContext?: string | null;
  /** Present on `prompted` events: the new user message. */
  agentActivity?: { body?: string | null } | null;
}

/** The seam the webhook route calls (plan §41). */
export interface LinearAgentBridge {
  handleAgentSessionEvent(event: AgentSessionEventLike): Promise<void>;
}

/** Logger subset the bridge needs (plan §38 namespaces). */
export interface BridgeLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface AgentBridgeOptions {
  /** Persisted Linear ↔ harness mapping (§42). */
  map: AgentSessionMapStore;
  /** Linear Agent API service (activities, session updates). */
  linear: LinearAgentServiceLike;
  /** Harness session driver; undefined when this profile cannot bridge. */
  driver: HarnessSessionDriver | undefined;
  /** Session-id prefix for derived harness sessions; default `linear-`. */
  sessionIdPrefix?: string;
  /** Optional model route overrides for dispatched harness agents. */
  provider?: string;
  model?: string;
  /** Optional harness agent preset id for fresh sessions. */
  agentPreset?: string;
  /** Optional workspace for fresh harness sessions. */
  cwd?: string;
  logger: BridgeLogger;
}

const DEFAULT_SESSION_ID_PREFIX = "linear-";
const START_THOUGHT = "已接收任务，开始处理。";
const UNAVAILABLE_MESSAGE =
  "无法处理：当前 Harness 未启用 Agent 桥接（缺少 agent 注册表），请管理员检查部署配置。";

export class HarnessAgentBridge implements LinearAgentBridge {
  private readonly map: AgentSessionMapStore;
  private readonly linear: LinearAgentServiceLike;
  private readonly driver: HarnessSessionDriver | undefined;
  private readonly prefix: string;
  private readonly options: Pick<AgentBridgeOptions, "provider" | "model" | "agentPreset" | "cwd">;
  private readonly logger: BridgeLogger;

  /** Live runs per Linear agent session id. */
  private readonly runs = new Map<string, HarnessRun>();
  /** Per-session turn serialization: previous turn's completion promise. */
  private readonly pending = new Map<string, Promise<void>>();

  constructor(options: AgentBridgeOptions) {
    this.map = options.map;
    this.linear = options.linear;
    this.driver = options.driver;
    this.prefix = options.sessionIdPrefix ?? DEFAULT_SESSION_ID_PREFIX;
    this.options = options;
    this.logger = options.logger;
  }

  async handleAgentSessionEvent(event: AgentSessionEventLike): Promise<void> {
    const linearId = event.agentSession?.id;
    if (!linearId) {
      this.logger.warn("linear.agent webhook event without an agent session id; ignored.");
      return;
    }
    const issueId = event.agentSession.issue?.id ?? "";
    if (event.action === "created") {
      await this.onCreated(linearId, issueId, event.promptContext ?? "");
      return;
    }
    if (event.action === "prompted") {
      await this.onPrompted(linearId, event.agentActivity?.body ?? "");
      return;
    }
    this.logger.debug("linear.agent webhook action %s ignored.", event.action);
  }

  /** Serialize turns per session: later events queue behind the current one. */
  private serialize(linearId: string, work: () => Promise<void>): Promise<void> {
    const previous = this.pending.get(linearId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(work)
      .finally(() => {
        if (this.pending.get(linearId) === next) this.pending.delete(linearId);
      });
    this.pending.set(linearId, next);
    return next;
  }

  private async onCreated(linearId: string, issueId: string, prompt: string): Promise<void> {
    const existing = await this.map.getByLinearAgentSessionId(linearId);
    if (existing && this.runs.get(linearId)?.live) {
      // Redelivered `created` for a live session: the run is already
      // processing the same promptContext — ignore (idempotent, §42).
      this.logger.debug(
        "linear.agent duplicate created event for live session %s; ignored.",
        linearId,
      );
      return;
    }
    if (!existing) {
      const now = new Date().toISOString();
      await this.map.create({
        linearAgentSessionId: linearId,
        linearIssueId: issueId,
        harnessSessionId: this.harnessIdFor(linearId),
        createdAt: now,
        updatedAt: now,
      });
    }
    await this.serialize(linearId, () => this.dispatchTurn(linearId, prompt, !!existing));
  }

  private async onPrompted(linearId: string, body: string): Promise<void> {
    const prompt = body || "请继续。";
    await this.serialize(linearId, () => this.dispatchTurn(linearId, prompt, true));
  }

  /**
   * Ensure a harness run exists for the linear session and drive one turn.
   *
   * - Live run                    → continue it (`prompted`).
   * - No live run, mapping exists → resume the persisted harness session
   *   (harness restart, plan §42); fall back to a fresh create when the
   *   session was never materialized.
   * - No live run, fresh mapping  → create a new harness agent + session.
   */
  private async dispatchTurn(
    linearId: string,
    prompt: string,
    resumeFirst: boolean,
  ): Promise<void> {
    const mapping = await this.map.getByLinearAgentSessionId(linearId);
    if (!mapping) {
      this.logger.warn("linear.agent no mapping for session %s; ignoring turn.", linearId);
      return;
    }

    const run = this.runs.get(linearId);
    if (run && run.live) {
      try {
        await run.continue(prompt);
        await this.map.touch(linearId);
      } catch (err) {
        await this.fail(linearId, err);
      }
      return;
    }
    if (run) this.runs.delete(linearId);

    if (!this.driver) {
      this.logger.warn(
        "linear.agent bridge has no harness driver; mirroring unavailability for %s.",
        linearId,
      );
      await this.mirrorSafe(
        linearId,
        createAgentActivity("error", { summary: UNAVAILABLE_MESSAGE }),
      );
      return;
    }

    if (resumeFirst) {
      try {
        await this.startRun(linearId, mapping.harnessSessionId, prompt, true);
      } catch (resumeErr) {
        this.logger.warn(
          "linear.agent resume failed for %s (%s); creating a fresh session.",
          linearId,
          resumeErr instanceof Error ? resumeErr.message : String(resumeErr),
        );
        await this.startRun(linearId, mapping.harnessSessionId, prompt, false);
      }
      return;
    }
    await this.startRun(linearId, mapping.harnessSessionId, prompt, false);
  }

  private async startRun(
    linearId: string,
    harnessSessionId: string,
    prompt: string,
    resume: boolean,
  ): Promise<void> {
    if (!this.driver) return;
    try {
      await this.mirrorSafe(
        linearId,
        createAgentActivity("thought", { summary: START_THOUGHT, ephemeral: true }),
      );
      const run = resume
        ? await this.driver.resumeSession({
            harnessSessionId,
            prompt,
            provider: this.options.provider,
            model: this.options.model,
            agentPreset: this.options.agentPreset,
          })
        : await this.driver.createSession({
            harnessSessionId,
            prompt,
            provider: this.options.provider,
            model: this.options.model,
            agentPreset: this.options.agentPreset,
            cwd: this.options.cwd,
          });
      this.runs.set(linearId, run);
      await run.turn;
      await this.map.touch(linearId);
    } catch (err) {
      this.runs.delete(linearId);
      await this.fail(linearId, err);
    }
  }

  private async fail(linearId: string, err: unknown): Promise<void> {
    const summary = err instanceof Error ? err.message.split(/\r?\n/)[0] : String(err);
    this.logger.error("linear.agent session %s failed: %s", linearId, summary);
    await this.mirrorSafe(
      linearId,
      createAgentActivity("error", { summary: `Agent 处理失败：${summary || "未知错误"}` }),
    );
    await this.map.touch(linearId);
  }

  /**
   * Public best-effort mirror, used by the plugin's driver-sink wiring: the
   * driver reports `harnessSessionId`, which encodes the Linear session id
   * via {@link AgentBridgeOptions.sessionIdPrefix} (§42).
   */
  async mirror(harnessSessionId: string, activity: AgentActivity): Promise<void> {
    await this.mirrorSafe(this.linearIdFor(harnessSessionId), activity);
  }

  private async mirrorSafe(linearId: string, activity: AgentActivity): Promise<void> {
    try {
      await this.linear.createActivity({
        agentSessionId: linearId,
        content: toLinearActivityContent(activity) as never,
        ...(activity.ephemeral ? { ephemeral: true } : {}),
      });
    } catch (err) {
      this.logger.warn(
        "linear.agent activity mirror failed for %s: %s",
        linearId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /** Derived harness session identity for a Linear agent session id (§42). */
  private harnessIdFor(linearId: string): string {
    return `${this.prefix}${linearId}`;
  }

  /** Inverse of {@link harnessIdFor}; passthrough when the prefix is absent. */
  private linearIdFor(harnessSessionId: string): string {
    return harnessSessionId.startsWith(this.prefix)
      ? harnessSessionId.slice(this.prefix.length)
      : harnessSessionId;
  }
}
