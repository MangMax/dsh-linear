/**
 * Harness session bridge driver (plan §41, §43; Milestone 8).
 *
 * The seam between the Linear agent bridge and a DeepSeek Harness agent:
 * creates / resumes a harness agent+session through `ctx.agents` (the
 * `dsh-agent` registry, mounted by the standard `dsh-base` bundle) and drives
 * turns with `agent.followup()` + `agent.whenIdle()`.
 *
 * Activity mirroring (§43): the driver listens on the agent-scoped
 * `session/event` feed and mirrors ONLY user-comprehensible high-level states
 * through the {@link ActivitySink} — never chain-of-thought, hidden
 * reasoning, or raw scratchpad. Tool calls are mirrored through a curated
 * label map; anything outside it is internal detail and stays in Harness.
 *
 * The driver is the ONLY module that touches harness agent services; the
 * bridge (and every test) programs against the {@link HarnessSessionDriver}
 * interface.
 */
import { Context } from "@deepseek-ai/cordis";
import type { Agent, AgentOptions, AgentRegistry } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId, type Session, type SessionEvent } from "@deepseek-ai/dsh-session";
import { LinearConnectorError } from "../linear/error.ts";
import { createAgentActivity, type AgentActivity } from "./activity.ts";

/** One live bridged harness run behind a Linear agent session. */
export interface HarnessRun {
  readonly harnessSessionId: string;
  /**
   * Whether the underlying harness agent is still live in the registry.
   * False after the agent was disposed (harness restart, host teardown) —
   * the bridge then resumes from the persisted mapping (§42).
   */
  readonly live: boolean;
  /**
   * Resolves when the dispatched turn completes, with the final assistant
   * text ("" when the model produced none). Rejects when the turn errors.
   */
  readonly turn: Promise<string>;
  /** Dispatch the next user message into the live session (a Linear `prompted` event). */
  continue(prompt: string): Promise<string>;
  /** Cancel the active run (Linear session dismissed / cancelled). */
  cancel(): void;
}

export interface DriverSessionOptions {
  /** Shared agent/session identity; the bridge derives it from the Linear id. */
  harnessSessionId: string;
  /** The user prompt to dispatch (Linear `promptContext` or `agentActivity.body`). */
  prompt: string;
  /** Optional model route overrides; omitted → harness defaults (agent-default-model). */
  provider?: string;
  model?: string;
  /** Optional agent preset id (e.g. `cordis`) applied to the fresh session. */
  agentPreset?: string;
  /** Optional workspace for a fresh session (session meta `cwd`). */
  cwd?: string;
}

/** The seam the bridge depends on; the Cordis implementation is below. */
export interface HarnessSessionDriver {
  /** Create a fresh harness agent + session and run the first prompt. */
  createSession(options: DriverSessionOptions): Promise<HarnessRun>;
  /** Resume a persisted harness session (harness restart) and run the prompt. */
  resumeSession(options: DriverSessionOptions): Promise<HarnessRun>;
}

/** Consumer of mirrored, user-comprehensible states (§43). Receives the
 * harness session id the activity belongs to, so the caller can route it back
 * to the owning Linear agent session. */
export type ActivitySink = (
  harnessSessionId: string,
  activity: AgentActivity,
) => void | Promise<void>;

/** Curated human labels for tools whose calls are worth mirroring (§43). */
const TOOL_ACTION_LABELS: Readonly<Record<string, string>> = {
  linear_connection_status: "检查 Linear 连接",
  linear_search_issues: "搜索 Issue",
  linear_get_issue: "查看 Issue",
  linear_get_issue_context: "查看 Issue 上下文",
  linear_list_projects: "查看项目",
  linear_get_project: "查看项目详情",
  linear_list_teams: "查看团队",
  linear_list_cycles: "查看周期",
  linear_create_issue: "创建 Issue",
  linear_update_issue: "更新 Issue",
  linear_add_comment: "添加评论",
  bash: "运行命令",
  read: "读取文件",
  write: "写入文件",
  edit: "编辑文件",
  glob: "查找文件",
  grep: "搜索文件内容",
  web_search: "搜索网络",
  subagent: "委派子任务",
  workflow: "运行工作流",
};

/** The harness tool that asks the user — mirrored as an elicitation (§43). */
const ASK_USER_TOOL = "ask_user_question";

/** Argument keys worth surfacing as the action parameter, in priority order. */
const PARAMETER_KEYS = [
  "issue",
  "identifier",
  "query",
  "title",
  "path",
  "file_path",
  "pattern",
  "project",
  "team",
  "url",
];

const MAX_PARAMETER_CHARS = 120;
const MAX_RESULT_CHARS = 400;

/** Extract a short human parameter from a tool call's raw arguments JSON. */
export function summarizeToolArguments(name: string, rawArguments: string): string {
  if (name === ASK_USER_TOOL) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return "";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
  const record = parsed as Record<string, unknown>;
  for (const key of PARAMETER_KEYS) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > MAX_PARAMETER_CHARS ? `${text.slice(0, MAX_PARAMETER_CHARS - 1)}…` : text;
  }
  return "";
}

/** Human label for a tool call, or undefined when it must stay internal (§43). */
export function toolActionLabel(name: string): string | undefined {
  return TOOL_ACTION_LABELS[name];
}

/** Whether a harness agent with this session id is currently live. */
export function isAgentLive(agents: AgentRegistry, harnessSessionId: string): boolean {
  return agents.get(SessionId(harnessSessionId)) !== undefined;
}

/** The final assistant text of a session's derived history ("" when none). */
export function finalAssistantText(session: Session): string {
  const messages = session.deriveMessages();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const text = message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function errorSummary(error: unknown): string {
  if (error instanceof LinearConnectorError) return error.message;
  if (error instanceof Error) return error.message.split(/\r?\n/)[0] || String(error);
  return String(error);
}

/** Concrete driver over `ctx.agents` (the dsh-agent registry + loop factory). */
export class CordisAgentDriver implements HarnessSessionDriver {
  private readonly agents: AgentRegistry | undefined;
  private readonly logger: ReturnType<Context["logger"]>;
  /** callId → tool name, so `tool/result` events can be labelled. */
  private readonly toolNames = new Map<string, string>();
  /** Per-driver mirror queue: sinks run in dispatch order, one at a time. */
  private sinkChain: Promise<unknown> = Promise.resolve();

  constructor(
    ctx: Context,
    private readonly sink: ActivitySink,
  ) {
    this.agents = ctx.get("agents") as AgentRegistry | undefined;
    this.logger = ctx.logger("linear.agent");
  }

  /** Whether this harness process can bridge at all (agents registry + factory). */
  get available(): boolean {
    return this.agents !== undefined;
  }

  createSession(options: DriverSessionOptions): Promise<HarnessRun> {
    return this.run(options, false);
  }

  resumeSession(options: DriverSessionOptions): Promise<HarnessRun> {
    return this.run(options, true);
  }

  private async run(options: DriverSessionOptions, resume: boolean): Promise<HarnessRun> {
    if (!this.agents) {
      throw new LinearConnectorError(
        "AGENT_UNAVAILABLE",
        "The Harness agent registry is not available in this profile; the Linear agent bridge cannot dispatch sessions.",
      );
    }
    const sessionId = SessionId(options.harnessSessionId);
    const agentOptions: AgentOptions = {
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.model ? { model: options.model } : {}),
    };
    const harnessSessionId = options.harnessSessionId;
    const setup = (agentCtx: Context) => {
      agentCtx.on("session/event", (_session, event) => {
        this.mirrorSessionEvent(harnessSessionId, event);
      });
      agentCtx.on("agent/error", (payload) => {
        void this.mirror(
          harnessSessionId,
          createAgentActivity("error", {
            summary: `Agent 运行失败：${errorSummary(payload.error)}`,
          }),
        );
      });
    };

    const handle = resume
      ? await this.agents.resume({ resumeSessionId: sessionId, agentOptions, setup })
      : await this.agents.create({
          sessionId,
          agentOptions,
          meta: {
            ...(options.cwd ? { cwd: options.cwd } : {}),
            ...(options.agentPreset ? { agentPreset: options.agentPreset } : {}),
          },
          setup,
        });
    const agent = handle.agent;
    const runTurn = (prompt: string): Promise<string> => this.runTurn(agent, prompt);

    return {
      harnessSessionId: options.harnessSessionId,
      live: isAgentLive(this.agents, options.harnessSessionId),
      turn: runTurn(options.prompt),
      continue: runTurn,
      cancel: () => agent.cancel({ kind: "user" }),
    } as HarnessRun;
  }

  private async runTurn(agent: Agent, prompt: string): Promise<string> {
    agent.followup(
      createUserMessage({
        content: [{ type: "text", text: prompt }],
        source: { kind: "user" },
      }),
    );
    await agent.whenIdle();
    // Tool mirrors were queued in dispatch order; flush them before the
    // response mirror so the Linear thread reads start → actions → response.
    await this.sinkChain;
    const text = finalAssistantText(agent.session);
    if (text) {
      await this.mirror(agent.id, createAgentActivity("response", { summary: text }));
    }
    return text;
  }

  private mirror(harnessSessionId: string, activity: AgentActivity): Promise<void> {
    this.sinkChain = this.sinkChain
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.sink(harnessSessionId, activity);
        } catch (err) {
          this.logger.warn("activity mirror failed: %s", errorSummary(err));
        }
      });
    return this.sinkChain as Promise<void>;
  }

  private mirrorSessionEvent(harnessSessionId: string, event: SessionEvent): void {
    if (event.type === "tool/call") {
      const { name, callId, arguments: raw } = event.data;
      this.toolNames.set(callId, name);
      if (name === ASK_USER_TOOL) {
        const question = summarizeToolArguments(name, raw) || "请求用户输入";
        void this.mirror(
          harnessSessionId,
          createAgentActivity("elicitation", { summary: question }),
        );
        return;
      }
      const label = toolActionLabel(name);
      if (!label) return;
      const parameter = summarizeToolArguments(name, raw);
      void this.mirror(
        harnessSessionId,
        createAgentActivity("action", {
          summary: parameter ? `${label}（${parameter}）` : label,
          action: label,
          parameter,
          ephemeral: true,
        }),
      );
      return;
    }
    if (event.type === "tool/result") {
      const { message } = event.data;
      const name = this.toolNames.get(message.content[0]?.toolCallId ?? "");
      const label = name ? toolActionLabel(name) : undefined;
      if (!label) return;
      const result = firstLine(toolResultText(message));
      void this.mirror(
        harnessSessionId,
        createAgentActivity("action_result", {
          summary: result ? `${label}完成：${result}` : `${label}完成`,
          action: label,
          result,
        }),
      );
    }
  }
}

function toolResultText(message: { content: readonly unknown[] }): string {
  // ToolResultMessage.content = [ToolResultBlock]; the block's own `content`
  // array holds the text blocks.
  const block = message.content[0] as
    | { content?: ReadonlyArray<{ type?: string; text?: string }> }
    | undefined;
  return (block?.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > MAX_RESULT_CHARS ? `${line.slice(0, MAX_RESULT_CHARS - 1)}…` : line;
}
