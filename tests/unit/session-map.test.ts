/**
 * Agent session map store tests (plan §42; Milestone 8).
 *
 * The mapping is the idempotency source for redelivered webhooks and the
 * resume index after a harness restart: entry + reverse index consistency,
 * touch, and removal are covered over a fake {@link ConnectorStateStore}.
 */
import { expect, test } from "vite-plus/test";
import type { ConnectorStateStore } from "../../src/harness/storage.ts";
import {
  InMemoryAgentSessionMapStore,
  PersistentAgentSessionMapStore,
  type AgentSessionMap,
} from "../../src/agent/session-map.ts";

function fakeStore() {
  const values = new Map<string, unknown>();
  const store: ConnectorStateStore = {
    async get<T>(key: string): Promise<T | undefined> {
      return values.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      values.set(key, value);
    },
    async delete(key: string): Promise<void> {
      values.delete(key);
    },
  };
  return { store, values };
}

const ENTRY: AgentSessionMap = {
  linearAgentSessionId: "lin-session-1",
  linearIssueId: "issue-uuid",
  harnessSessionId: "linear-lin-session-1",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

for (const [name, make] of [
  ["PersistentAgentSessionMapStore", () => new PersistentAgentSessionMapStore(fakeStore().store)],
  ["InMemoryAgentSessionMapStore", () => new InMemoryAgentSessionMapStore()],
] as const) {
  test(`${name}: create writes entry + reverse index, readable both ways`, async () => {
    const store = make();
    await store.create(ENTRY);
    expect(await store.getByLinearAgentSessionId("lin-session-1")).toEqual(ENTRY);
    expect(await store.getByHarnessSessionId("linear-lin-session-1")).toEqual(ENTRY);
    expect(await store.getByLinearAgentSessionId("missing")).toBeUndefined();
  });

  test(`${name}: touch bumps updatedAt on both keys`, async () => {
    const store = make();
    await store.create(ENTRY);
    await store.touch("lin-session-1", new Date("2026-08-16T00:00:00.000Z"));
    const entry = await store.getByLinearAgentSessionId("lin-session-1");
    expect(entry?.updatedAt).toBe("2026-08-16T00:00:00.000Z");
    expect((await store.getByHarnessSessionId("linear-lin-session-1"))?.updatedAt).toBe(
      "2026-08-16T00:00:00.000Z",
    );
  });

  test(`${name}: touch on a missing id is a no-op`, async () => {
    const store = make();
    await store.touch("missing");
  });

  test(`${name}: remove deletes both keys`, async () => {
    const store = make();
    await store.create(ENTRY);
    await store.remove("lin-session-1");
    expect(await store.getByLinearAgentSessionId("lin-session-1")).toBeUndefined();
    expect(await store.getByHarnessSessionId("linear-lin-session-1")).toBeUndefined();
  });

  test(`${name}: create overwrites an existing entry for the same linear id`, async () => {
    const store = make();
    await store.create(ENTRY);
    const updated = { ...ENTRY, updatedAt: "2026-08-17T00:00:00.000Z" };
    await store.create(updated);
    expect(await store.getByLinearAgentSessionId("lin-session-1")).toEqual(updated);
  });
}
