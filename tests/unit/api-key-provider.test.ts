import { expect, test } from "vite-plus/test";
import { ApiKeyProvider } from "../../src/auth/api-key-provider.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";
import type { SecretStore } from "../../src/harness/credentials.ts";

function fakeStore(
  initial?: Record<string, string>,
): SecretStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial ?? {}));
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

test("resolve returns the key from the secret store", async () => {
  const provider = new ApiKeyProvider(
    fakeStore({ DSH_LINEAR_API_KEY: "lin_api_123" }),
    "DSH_LINEAR_API_KEY",
  );
  const resolved = await provider.resolve();
  expect(resolved).toEqual({ type: "apiKey", apiKey: "lin_api_123" });
});

test("resolve throws NOT_CONNECTED when the ref is unset", async () => {
  const provider = new ApiKeyProvider(fakeStore(), "DSH_LINEAR_API_KEY");
  await expect(provider.resolve()).rejects.toBeInstanceOf(LinearConnectorError);
  await expect(provider.resolve()).rejects.toMatchObject({ code: "NOT_CONNECTED" });
});

test("disconnect removes the credential", async () => {
  const store = fakeStore({ DSH_LINEAR_API_KEY: "lin_api_123" });
  const provider = new ApiKeyProvider(store, "DSH_LINEAR_API_KEY");

  await provider.disconnect();
  expect(store.values.has("DSH_LINEAR_API_KEY")).toBe(false);
});
