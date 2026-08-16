import { expect, test } from "vite-plus/test";
import {
  InMemoryOAuthStateStore,
  OAUTH_STATE_TTL_MS,
  type PendingOAuthState,
} from "../../src/auth/oauth-state.ts";

function entry(state: string, createdAt = Date.now()): PendingOAuthState {
  return { state, codeVerifier: "verifier", redirectUri: "http://127.0.0.1/callback", createdAt };
}

test("take consumes a valid pending state exactly once", () => {
  const store = new InMemoryOAuthStateStore();
  store.put(entry("s1"));

  const first = store.take("s1");
  expect(first?.state).toBe("s1");
  expect(store.take("s1")).toBeUndefined();
});

test("take rejects unknown states", () => {
  const store = new InMemoryOAuthStateStore();
  expect(store.take("nope")).toBeUndefined();
});

test("take rejects expired states (TTL 10 min)", () => {
  const store = new InMemoryOAuthStateStore();
  store.put(entry("old", Date.now() - OAUTH_STATE_TTL_MS - 1));
  expect(store.take("old")).toBeUndefined();
});

test("prune removes expired entries and keeps fresh ones", () => {
  const store = new InMemoryOAuthStateStore();
  store.put(entry("fresh", Date.now()));
  store.put(entry("stale", Date.now() - OAUTH_STATE_TTL_MS - 60_000));

  store.prune();

  expect(store.take("fresh")?.state).toBe("fresh");
  expect(store.take("stale")).toBeUndefined();
});
