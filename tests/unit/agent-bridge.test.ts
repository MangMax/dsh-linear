/**
 * HarnessAgentBridge orchestration tests (plan §41–§43; Milestone 8).
 *
 * The bridge is the session-lifecycle orchestrator: created → mapping +
 * start thought + harness dispatch; prompted → continue / resume; failures
 * mirror honest error activities; redelivered events are serialized per
 * session. The harness driver, the map store and the Linear agent service
 * are all fakes, so the orchestration is verified in isolation.
 */
import { expect, test, vi } from "vite-plus/test";
import {
  HarnessAgentBridge,
  type AgentBridgeOptions,
  type AgentSessionEventLike,
  type BridgeLogger,
} from "../../src/agent/bridge.ts";
import type { HarnessRun, HarnessSessionDriver } from "../../src/agent/harness-driver.ts";
import type {
  AgentActivityCreateInputLike,
  LinearAgentServiceLike,
} from "../../src/agent/linear-agent-service.ts";
import {
  InMemoryAgentSessionMapStore,
  type AgentSessionMapStore,
} from "../../src/agent/session-map.ts";

function silentLogger(): BridgeLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function createdEvent(overrides: Record<string, unknown> = {}): AgentSessionEventLike {
  return {
    action: "created",
    agentSession: { id: "lin-1", issue: { id: "issue-1", identifier: "ENG-1" } },
    promptContext: "Fix this issue",
    ...overrides,
  };
}

function promptedEvent(body: string): AgentSessionEventLike {
  return {
    action: "prompted",
    agentSession: { id: "lin-1" },
    agentActivity: { body },
  };
}

function fakeRun(overrides: Partial<HarnessRun> = {}): HarnessRun {
  return {
    harnessSessionId: "linear-lin-1",
    live: true,
    turn: Promise.resolve("done"),
    continue: vi.fn(async () => "done"),
    cancel: vi.fn(),
    ...overrides,
  };
}

function fakeDriver() {
  const createSession = vi.fn(async (options: { harnessSessionId: string }) =>
    fakeRun({ harnessSessionId: options.harnessSessionId }),
  );
  const resumeSession = vi.fn(async (options: { harnessSessionId: string }) =>
    fakeRun({ harnessSessionId: options.harnessSessionId }),
  );
  const driver = { createSession, resumeSession } as unknown as HarnessSessionDriver;
  return { driver, createSession, resumeSession };
}

function fakeLinear() {
  const createActivity = vi.fn(async (_input: AgentActivityCreateInputLike) => true);
  const updateSession = vi.fn(async (_id: string, _input: Record<string, unknown>) => true);
  const linear = { createActivity, updateSession } as unknown as LinearAgentServiceLike;
  return { linear, createActivity, updateSession };
}

function setup(overrides: Partial<AgentBridgeOptions> = {}) {
  const map = new InMemoryAgentSessionMapStore();
  const { linear, createActivity } = fakeLinear();
  const { driver, createSession, resumeSession } = fakeDriver();
  const bridge = new HarnessAgentBridge({
    map: map as unknown as AgentSessionMapStore,
    linear,
    driver,
    logger: silentLogger(),
    ...overrides,
  });
  return { bridge, map, createActivity, createSession, resumeSession };
}

test("created event persists the §42 mapping and dispatches a harness session", async () => {
  const { bridge, map, createSession, createActivity } = setup();

  await bridge.handleAgentSessionEvent(createdEvent());

  // Mapping written before dispatch (idempotency source).
  const mapping = await map.getByLinearAgentSessionId("lin-1");
  expect(mapping).toMatchObject({
    linearAgentSessionId: "lin-1",
    linearIssueId: "issue-1",
    harnessSessionId: "linear-lin-1",
  });
  // Start thought mirrored first, then the session dispatched.
  expect(createSession).toHaveBeenCalledWith(
    expect.objectContaining({ harnessSessionId: "linear-lin-1", prompt: "Fix this issue" }),
  );
  const thought = createActivity.mock.calls.find(([input]) => input.content.type === "thought");
  expect(thought).toBeDefined();
  expect(thought?.[0]?.agentSessionId).toBe("lin-1");
  expect(thought?.[0]?.ephemeral).toBe(true);
});

test("redelivered created event for a live session is ignored (§42 idempotency)", async () => {
  const { bridge, createSession, resumeSession } = setup();

  await bridge.handleAgentSessionEvent(createdEvent());
  expect(createSession).toHaveBeenCalledTimes(1);

  // Same event again while the run is live: no duplicate dispatch at all.
  await bridge.handleAgentSessionEvent(createdEvent());
  expect(createSession).toHaveBeenCalledTimes(1);
  expect(resumeSession).not.toHaveBeenCalled();
});

test("created event with a persisted mapping and no live run resumes the session", async () => {
  const { bridge, createSession, resumeSession } = setup();
  // First dispatch stores a run that is NOT live (agent died / was disposed)
  // while the mapping persists; the redelivered created event must resume.
  createSession.mockResolvedValue(fakeRun({ live: false }));

  await bridge.handleAgentSessionEvent(createdEvent());
  await bridge.handleAgentSessionEvent(createdEvent());

  expect(resumeSession).toHaveBeenCalledWith(
    expect.objectContaining({ harnessSessionId: "linear-lin-1" }),
  );
});

test("prompted event continues the live run with the new message", async () => {
  const { bridge, createSession } = setup();
  const continueSpy = vi.fn(async () => "done");
  const run = fakeRun({ continue: continueSpy });
  createSession.mockResolvedValue(run);

  await bridge.handleAgentSessionEvent(createdEvent());
  await bridge.handleAgentSessionEvent(promptedEvent("继续修改"));

  expect(continueSpy).toHaveBeenCalledWith("继续修改");
});

function bodyOf(input: AgentActivityCreateInputLike): string {
  const body = input.content.body;
  return typeof body === "string" ? body : "";
}

test("no driver mirrors an honest unavailability error (§43)", async () => {
  const { bridge, createActivity } = setup({ driver: undefined });

  await bridge.handleAgentSessionEvent(createdEvent());

  const error = createActivity.mock.calls.find(([input]) => input.content.type === "error");
  expect(error).toBeDefined();
  expect(error?.[0]?.agentSessionId).toBe("lin-1");
  expect(bodyOf(error![0]!)).toContain("未启用 Agent 桥接");
});

test("driver failure mirrors an error activity and keeps the mapping", async () => {
  const { bridge, createSession, createActivity } = setup();
  createSession.mockRejectedValue(new Error("registry unavailable"));

  await bridge.handleAgentSessionEvent(createdEvent());

  const error = createActivity.mock.calls.find(([input]) => input.content.type === "error");
  expect(error).toBeDefined();
  expect(bodyOf(error![0]!)).toContain("Agent 处理失败");
});

test("unknown actions are ignored", async () => {
  const { bridge, createSession, createActivity } = setup();

  await bridge.handleAgentSessionEvent({
    action: "dismissed",
    agentSession: { id: "lin-9" },
  });

  expect(createSession).not.toHaveBeenCalled();
  expect(createActivity).not.toHaveBeenCalled();
});

test("turns are serialized per session: a prompted event waits for the first turn", async () => {
  let resolveFirst: (value: string) => void = () => {};
  const firstTurn = new Promise<string>((resolve) => {
    resolveFirst = resolve;
  });
  const { bridge, createSession } = setup();
  createSession.mockResolvedValue(fakeRun({ turn: firstTurn }));

  const first = bridge.handleAgentSessionEvent(createdEvent());
  const second = bridge.handleAgentSessionEvent(promptedEvent("消息 2"));
  let secondSettled = false;
  void second.then(() => {
    secondSettled = true;
  });
  await Promise.resolve();
  expect(secondSettled).toBe(false);

  resolveFirst("done");
  await first;
  await second;
  expect(secondSettled).toBe(true);
});
