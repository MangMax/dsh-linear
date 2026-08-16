/**
 * Linear Agent API service tests (plan §41–§43; Milestone 8).
 *
 * The service is the single wrapper over the SDK's agent mutations: it
 * resolves the client through the factory, forwards the exact arguments, and
 * normalizes failures to {@link LinearConnectorError}.
 */
import { expect, test } from "vite-plus/test";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";
import {
  LinearAgentService,
  type AgentActivityCreateInputLike,
  type LinearAgentClientLike,
} from "../../src/agent/linear-agent-service.ts";

function fakeClient() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const client: LinearAgentClientLike = {
    async agentSessionUpdate(id: string, input: Record<string, unknown>) {
      calls.push({ method: "agentSessionUpdate", args: [id, input] });
      return { success: true };
    },
    async agentActivityCreate(input: AgentActivityCreateInputLike) {
      calls.push({ method: "agentActivityCreate", args: [input] });
      return { success: true };
    },
  };
  return { client, calls };
}

function factoryFor(client: LinearAgentClientLike, failure?: unknown): LinearClientFactoryLike {
  return {
    async create() {
      if (failure) throw failure;
      return client as never;
    },
    clear() {},
  };
}

const ACTIVITY: AgentActivityCreateInputLike = {
  agentSessionId: "lin-1",
  content: { type: "thought", body: "开始" },
  ephemeral: true,
};

test("updateSession forwards (id, input) to the SDK mutation", async () => {
  const { client, calls } = fakeClient();
  const service = new LinearAgentService(factoryFor(client));

  const ok = await service.updateSession("lin-1", {
    externalUrls: [{ label: "Harness", url: "https://harness.local/s/1" }],
  });

  expect(ok).toBe(true);
  expect(calls).toEqual([
    {
      method: "agentSessionUpdate",
      args: ["lin-1", { externalUrls: [{ label: "Harness", url: "https://harness.local/s/1" }] }],
    },
  ]);
});

test("createActivity forwards the exact input", async () => {
  const { client, calls } = fakeClient();
  const service = new LinearAgentService(factoryFor(client));

  const ok = await service.createActivity(ACTIVITY);

  expect(ok).toBe(true);
  expect(calls).toEqual([{ method: "agentActivityCreate", args: [ACTIVITY] }]);
});

test("SDK failures normalize to LinearConnectorError", async () => {
  const sdkError = new Error("GraphQL error: permission denied");
  const service = new LinearAgentService(factoryFor(fakeClient().client, sdkError));

  await expect(service.createActivity(ACTIVITY)).rejects.toMatchObject({
    name: "LinearConnectorError",
    code: "LINEAR_API_ERROR",
  });
});

test("unsuccessful SDK results surface as false, not an exception", async () => {
  const client: LinearAgentClientLike = {
    async agentSessionUpdate() {
      return { success: false };
    },
    async agentActivityCreate() {
      return { success: false };
    },
  };
  const service = new LinearAgentService(factoryFor(client));

  expect(await service.updateSession("lin-1", {})).toBe(false);
  expect(await service.createActivity(ACTIVITY)).toBe(false);
});

test("factory credential failures normalize", async () => {
  const service = new LinearAgentService(
    factoryFor(fakeClient().client, LinearConnectorError.notConnected()),
  );

  await expect(service.createActivity(ACTIVITY)).rejects.toMatchObject({
    code: "NOT_CONNECTED",
  });
});
