import { expect, test } from "vite-plus/test";
import { TokenStore, type LinearOAuthTokenBundle } from "../../src/auth/token-store.ts";
import type { SecretStore } from "../../src/harness/credentials.ts";

function fakeStore(): SecretStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async get(ref) {
      return values.get(ref);
    },
    async set(ref, value) {
      values.set(ref, value);
    },
    async delete(ref) {
      values.delete(ref);
    },
  };
}

const bundle: LinearOAuthTokenBundle = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: Date.now() + 3600_000,
  scope: ["read", "write"],
  tokenType: "Bearer",
  actorMode: "user",
};

test("TokenStore roundtrips a bundle under one ref as a single secret", async () => {
  const store = fakeStore();
  const tokens = new TokenStore(store, "DSH_LINEAR_OAUTH");

  await tokens.write(bundle);
  expect(store.values.size).toBe(1);
  expect(store.values.get("DSH_LINEAR_OAUTH")).toContain("access-1");
  expect(store.values.get("DSH_LINEAR_OAUTH")).toContain("refresh-1");

  const read = await tokens.read();
  expect(read).toEqual(bundle);
});

test("TokenStore.read returns undefined when nothing is stored", async () => {
  const tokens = new TokenStore(fakeStore(), "DSH_LINEAR_OAUTH");
  expect(await tokens.read()).toBeUndefined();
});

test("TokenStore.delete removes the secret", async () => {
  const store = fakeStore();
  const tokens = new TokenStore(store, "DSH_LINEAR_OAUTH");

  await tokens.write(bundle);
  await tokens.delete();
  expect(await tokens.read()).toBeUndefined();
});
