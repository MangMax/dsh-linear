/**
 * Retry policy unit tests (plan §34, Milestone 7).
 *
 * Covers the decision table without network: which error classes retry,
 * which never do, Linear's `retryAfter` backoff, the retry cap, the
 * mutation-only-429 safety rule, and AbortSignal propagation.
 */
import { expect, test } from "vite-plus/test";
import {
  GraphQLClientError,
  LinearError,
  LinearErrorType,
  RatelimitedLinearError,
  NetworkLinearError,
} from "@linear/sdk";
import {
  backoffDelay,
  retryableClient,
  shouldRetry,
  withLinearRetry,
} from "../../src/linear/retry.ts";

const DEFAULT = { baseDelayMs: 10, maxDelayMs: 1000 };

function rateLimited(retryAfter?: number): RatelimitedLinearError {
  const headers = new Headers();
  if (retryAfter !== undefined) headers.set("retry-after", String(retryAfter));
  const err = new RatelimitedLinearError({ response: { status: 429, headers } } as never, []);
  return err;
}

function http5xx(): LinearError {
  return new LinearError({ response: { status: 503, error: "unavailable" } } as never, []);
}

function networkError(): NetworkLinearError {
  return new NetworkLinearError({ response: { error: "fetch failed" } } as never, []);
}

function typedError(type: LinearErrorType): LinearError {
  return new LinearError({ response: {} } as never, [], type);
}

function badRequest(): LinearError {
  return new LinearError({ response: { status: 400, error: "bad input" } } as never, []);
}

test("429 rate limit retries, honoring Linear retryAfter", async () => {
  const calls: string[] = [];
  const err = rateLimited(2); // Linear says wait 2 s
  const result = await withLinearRetry(
    async () => {
      calls.push("call");
      if (calls.length === 1) throw err;
      return "ok";
    },
    { ...DEFAULT, maxRetries: 2 },
  );
  expect(result).toBe("ok");
  expect(calls).toEqual(["call", "call"]);
  // retryAfter (2 s) wins over the base delay, but the maxDelayMs cap applies.
  expect(backoffDelay(err, 0, DEFAULT)).toBe(1000);
});

test("rate limit without retryAfter falls back to capped exponential backoff", () => {
  expect(backoffDelay(rateLimited(undefined), 0, DEFAULT)).toBe(10);
  expect(backoffDelay(rateLimited(undefined), 1, DEFAULT)).toBe(20);
  expect(backoffDelay(rateLimited(undefined), 2, DEFAULT)).toBe(40);
});

test("backoff is capped at maxDelayMs", () => {
  const options = { baseDelayMs: 500, maxDelayMs: 1200 };
  expect(backoffDelay(http5xx(), 3, options)).toBe(1200);
});

test("5xx retries with exponential backoff for reads", async () => {
  const calls: string[] = [];
  const delays: number[] = [];
  await withLinearRetry(
    async () => {
      calls.push("call");
      if (calls.length <= 2) throw http5xx();
      return "ok";
    },
    {
      ...DEFAULT,
      maxRetries: 2,
      onRetry: (_attempt, _err, delayMs) => delays.push(delayMs),
    },
  );
  expect(calls).toEqual(["call", "call", "call"]); // 1 attempt + 2 retries
  expect(delays).toEqual([10, 20]);
});

test("network errors retry for reads", async () => {
  const calls: string[] = [];
  await withLinearRetry(
    async () => {
      calls.push("call");
      if (calls.length === 1) throw networkError();
      return "ok";
    },
    { ...DEFAULT },
  );
  expect(calls).toEqual(["call", "call"]);
});

test("fetch TypeError retries for reads", async () => {
  expect(shouldRetry(new TypeError("fetch failed"), 0, {})).toBe(true);
});

test("programmatic TypeErrors (coding bugs) never retry", () => {
  const options = { ...DEFAULT };
  const bug = new TypeError("project.updates is not a function");
  expect(shouldRetry(bug, 0, options)).toBe(false);
  expect(shouldRetry(bug, 0, { ...options, mutation: true })).toBe(false);
});

test("4xx, validation, permission and auth errors never retry", () => {
  const options = { ...DEFAULT };
  expect(shouldRetry(badRequest(), 0, options)).toBe(false);
  expect(shouldRetry(typedError(LinearErrorType.InvalidInput), 0, options)).toBe(false);
  expect(shouldRetry(typedError(LinearErrorType.Forbidden), 0, options)).toBe(false);
  expect(shouldRetry(typedError(LinearErrorType.AuthenticationError), 0, options)).toBe(false);
});

test("usage limit is a hard quota, not throttling — never retries, even for reads", async () => {
  const options = { ...DEFAULT };
  const usage = typedError(LinearErrorType.UsageLimitExceeded);
  expect(shouldRetry(usage, 0, options)).toBe(false);
  expect(shouldRetry(usage, 0, { ...options, mutation: true })).toBe(false);

  // End-to-end: the operation is attempted exactly once (M7: surfaced by the
  // real-Linear E2E against a quota-full workspace — retrying wasted requests
  // and time).
  const calls: string[] = [];
  await expect(
    withLinearRetry(async () => {
      calls.push("call");
      throw usage;
    }, options),
  ).rejects.toBe(usage);
  expect(calls).toEqual(["call"]);
});

test("GraphQLClientError maps by HTTP status", () => {
  const options = { ...DEFAULT };
  const gql429 = new GraphQLClientError({ error: "rate limited", status: 429 } as never, {
    query: "",
    variables: {},
  });
  expect(shouldRetry(gql429, 0, options)).toBe(true);
  const gql503 = new GraphQLClientError({ error: "boom", status: 503 } as never, {
    query: "",
    variables: {},
  });
  expect(shouldRetry(gql503, 0, options)).toBe(true);
  const gql400 = new GraphQLClientError({ error: "no", status: 400 } as never, {
    query: "",
    variables: {},
  });
  expect(shouldRetry(gql400, 0, options)).toBe(false);
});

test("mutations retry on 429 only — 5xx and network surface immediately", async () => {
  const options = { ...DEFAULT, mutation: true };
  expect(shouldRetry(rateLimited(1), 0, options)).toBe(true);

  const calls5xx: string[] = [];
  await expect(
    withLinearRetry(async () => {
      calls5xx.push("call");
      throw http5xx();
    }, options),
  ).rejects.toMatchObject({ status: 503 });
  expect(calls5xx).toEqual(["call"]); // no retry

  const callsNet: string[] = [];
  await expect(
    withLinearRetry(async () => {
      callsNet.push("call");
      throw new TypeError("fetch failed");
    }, options),
  ).rejects.toBeInstanceOf(TypeError);
  expect(callsNet).toEqual(["call"]); // no retry
});

test("retries stop at maxRetries and the last error surfaces", async () => {
  const calls: string[] = [];
  const err = rateLimited(undefined);
  await expect(
    withLinearRetry(
      async () => {
        calls.push("call");
        throw err;
      },
      { ...DEFAULT, maxRetries: 2 },
    ),
  ).rejects.toBe(err);
  expect(calls).toEqual(["call", "call", "call"]);
});

test("aborted signal is never retried and aborts the backoff sleep", async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const abortError = new DOMException("Aborted", "AbortError");
  const p = withLinearRetry(
    async () => {
      calls.push("call");
      throw abortError;
    },
    { ...DEFAULT, signal: controller.signal },
  );
  await expect(p).rejects.toBe(abortError);
  expect(calls).toEqual(["call"]);
  expect(shouldRetry(abortError, 0, {})).toBe(false);
});

test("retryableClient wraps promise-returning methods only (reads)", async () => {
  const client = {
    async issue(id: string) {
      attempts += 1;
      if (attempts === 1) throw rateLimited(undefined);
      return { id, title: `issue-${id}` };
    },
    ping(): string {
      return "pong";
    },
  };
  let attempts = 0;
  const wrapped = retryableClient(client, { baseDelayMs: 1 });
  await expect(wrapped.issue("abc")).resolves.toEqual({ id: "abc", title: "issue-abc" });
  expect(attempts).toBe(2);
  expect(wrapped.ping()).toBe("pong"); // non-promise passes through untouched
});

test("retryableClient classifies create/update methods as mutations", async () => {
  const client = {
    async createIssue() {
      throw http5xx();
    },
    async updateIssue() {
      throw http5xx();
    },
    async searchIssues() {
      throw http5xx();
    },
  };
  const wrapped = retryableClient(client, { baseDelayMs: 1 });
  await expect(wrapped.createIssue()).rejects.toMatchObject({ status: 503 });
  await expect(wrapped.updateIssue()).rejects.toMatchObject({ status: 503 });
  // read path retries → after exhausting, the last error surfaces
  await expect(wrapped.searchIssues()).rejects.toMatchObject({ status: 503 });
});

test("Milestone 8 agent mutations are classified as mutations (429-only)", async () => {
  const client = {
    async agentSessionUpdate(_id: string, _input: Record<string, unknown>) {
      throw http5xx();
    },
    async agentActivityCreate(_input: Record<string, unknown>) {
      throw http5xx();
    },
    async agentActivityCreatePrompt(_input: Record<string, unknown>) {
      throw http5xx();
    },
    async agentSessions() {
      throw http5xx();
    },
  };
  const wrapped = retryableClient(client, { baseDelayMs: 1 });
  // Mutations: 5xx surfaces immediately (no duplicate-send risk, §34).
  await expect(wrapped.agentSessionUpdate("id", {})).rejects.toMatchObject({ status: 503 });
  await expect(wrapped.agentActivityCreate({})).rejects.toMatchObject({ status: 503 });
  await expect(wrapped.agentActivityCreatePrompt({})).rejects.toMatchObject({ status: 503 });
  // Agent read queries keep the full read policy (they retry → last error surfaces).
  await expect(wrapped.agentSessions()).rejects.toMatchObject({ status: 503 });
});

test("retryableClient surfaces the retry count through onRetry", async () => {
  const client = {
    async teams() {
      throw http5xx();
    },
  };
  const retries: number[] = [];
  const wrapped = retryableClient(client, {
    baseDelayMs: 1,
    onRetry: (attempt) => retries.push(attempt),
  });
  await expect(wrapped.teams()).rejects.toMatchObject({ status: 503 });
  expect(retries).toEqual([1, 2]);
});
