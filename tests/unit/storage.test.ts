/**
 * Harness state store tests (plan §27, §42; Milestone 8).
 *
 * The storageDomain-backed store: open resolves the table, operations route
 * durably; when the facility cannot open the domain, operations degrade to an
 * in-memory overlay (plugin keeps working, restart durability is lost).
 */
import { expect, test } from "vite-plus/test";
import {
  HarnessConnectorStateStore,
  InMemoryConnectorStateStore,
  STATE_DOMAIN_NAME,
  STATE_DOMAIN_VERSION,
  type StorageDomainLike,
} from "../../src/harness/storage.ts";

function fakeFacility(openFailure?: unknown) {
  const values = new Map<string, unknown>();
  const openedSpecs: unknown[] = [];
  const facility: StorageDomainLike = {
    async open(spec) {
      openedSpecs.push(spec);
      if (openFailure) throw openFailure;
      return {
        table() {
          return {
            get(key: string) {
              return values.get(key);
            },
            async put(key: string, value: unknown) {
              values.set(key, value);
            },
            async delete(key: string) {
              return values.delete(key);
            },
          };
        },
      };
    },
  };
  return { facility, openedSpecs, values };
}

test("open passes the dsh-linear domain spec", async () => {
  const { facility, openedSpecs } = fakeFacility();
  const store = new HarnessConnectorStateStore(facility);
  await store.open();
  expect(openedSpecs).toEqual([
    expect.objectContaining({
      name: STATE_DOMAIN_NAME,
      version: STATE_DOMAIN_VERSION,
    }),
  ]);
});

test("operations route to the opened table", async () => {
  const { facility, values } = fakeFacility();
  const store = new HarnessConnectorStateStore(facility);
  await store.open();

  await store.set("k", { hello: "world" });
  expect(values.get("k")).toEqual({ hello: "world" });
  expect(await store.get("k")).toEqual({ hello: "world" });
  await store.delete("k");
  expect(values.has("k")).toBe(false);
});

test("open failure degrades to the in-memory overlay", async () => {
  const { facility } = fakeFacility(new Error("backend-not-found"));
  const store = new HarnessConnectorStateStore(facility);
  await expect(store.open()).rejects.toThrow("backend-not-found");

  await store.set("k", { v: 1 });
  expect(await store.get("k")).toEqual({ v: 1 });
  await store.delete("k");
  expect(await store.get("k")).toBeUndefined();
});

test("before open completes, operations buffer in memory", async () => {
  const { facility } = fakeFacility();
  const store = new HarnessConnectorStateStore(facility);
  // No open() call: writes must not throw (plugin registers the webhook
  // route only after open, but the store must stay safe regardless).
  await store.set("k", "v");
  expect(await store.get("k")).toBe("v");
});

test("in-memory store works standalone", async () => {
  const store = new InMemoryConnectorStateStore();
  await store.set("a", { x: 1 });
  expect(await store.get("a")).toEqual({ x: 1 });
  await store.delete("a");
  expect(await store.get("a")).toBeUndefined();
});
