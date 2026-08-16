/**
 * HarnessSecretStore unit tests (plan §7, §25).
 */
import { expect, test } from "vite-plus/test";
import { HarnessSecretStore, type CredentialProviderLike } from "../../src/harness/secret-store.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";

function fakeProvider(): CredentialProviderLike & {
  calls: Array<{ op: string; ref: unknown; value?: string }>;
  values: Map<string, string>;
} {
  const calls: Array<{ op: string; ref: unknown; value?: string }> = [];
  const values = new Map<string, string>();
  return {
    calls,
    values,
    async resolve(ref) {
      calls.push({ op: "resolve", ref });
      const value = values.get(String(ref));
      return value ? { value, source: "env" } : undefined;
    },
    async set(ref, value) {
      calls.push({ op: "set", ref, value });
      values.set(String(ref), value);
    },
    async unset(ref) {
      calls.push({ op: "unset", ref });
      values.delete(String(ref));
    },
  };
}

test("get resolves the ref and returns the value", async () => {
  const provider = fakeProvider();
  provider.values.set("DSH_LINEAR_API_KEY", "lin_api_123");
  const store = new HarnessSecretStore(provider);

  await expect(store.get("DSH_LINEAR_API_KEY")).resolves.toBe("lin_api_123");
  expect(provider.calls[0]).toMatchObject({ op: "resolve", ref: "DSH_LINEAR_API_KEY" });
});

test("get returns undefined when the ref is unset", async () => {
  const store = new HarnessSecretStore(fakeProvider());
  await expect(store.get("DSH_LINEAR_API_KEY")).resolves.toBeUndefined();
});

test("set and delete delegate to the provider", async () => {
  const provider = fakeProvider();
  const store = new HarnessSecretStore(provider);

  await store.set("DSH_LINEAR_API_KEY", "lin_api_456");
  expect(provider.calls[0]).toMatchObject({ op: "set", value: "lin_api_456" });
  expect(provider.values.get("DSH_LINEAR_API_KEY")).toBe("lin_api_456");

  await store.delete("DSH_LINEAR_API_KEY");
  expect(provider.calls[1]).toMatchObject({ op: "unset" });
  expect(provider.values.has("DSH_LINEAR_API_KEY")).toBe(false);
});

test("invalid refs surface as VALIDATION_ERROR, never TypeError", async () => {
  const store = new HarnessSecretStore(fakeProvider());
  await expect(store.get("bad ref!")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(store.set("bad ref!", "x")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(store.delete("bad ref!")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});

test("errors are LinearConnectorError instances", async () => {
  const store = new HarnessSecretStore(fakeProvider());
  try {
    await store.get("bad ref!");
    throw new Error("expected get to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(LinearConnectorError);
  }
});
