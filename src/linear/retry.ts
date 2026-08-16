/**
 * Linear API retry policy (plan §34, Milestone 7).
 *
 * Rules (plan §34):
 *
 * ```text
 * 429        → back off per Linear retry info (RatelimitedLinearError.retryAfter)
 * 5xx        → capped exponential backoff
 * network    → small number of retries (exponential)
 * 4xx        → no retry
 * GraphQL validation → no retry
 * permission → no retry
 * max retries = 2
 * ```
 *
 * SAFETY — mutations retry on 429 only: a rate-limit rejection happens before
 * the mutation executes, so re-sending is safe. A 5xx / network failure after
 * a mutation may already have executed server-side (Linear mutations have no
 * idempotency key); re-sending could create duplicates, so writes surface the
 * error instead of retrying (the read path still gets full retry coverage).
 *
 * AbortSignal propagation (plan §34): an aborted signal aborts both the
 * in-flight fetch (the SDK passes the signal through to `fetch`) and the
 * backoff sleep; abort errors are never retried.
 *
 * The seam is {@link retryableClient}: a transparent Proxy over the
 * `LinearClient` returned by {@link LinearClientFactory}. Every SDK method
 * call that returns a promise is wrapped in {@link withLinearRetry} — domain
 * services and tools are untouched, and the contract-test mock boundary stays
 * at the client (plan §53.2).
 */
import {
  GraphQLClientError,
  LinearError,
  LinearErrorType,
  RatelimitedLinearError,
} from "@linear/sdk";
import { isNetworkTypeError } from "./error.ts";

export interface LinearRetryOptions {
  /** Retries after the first attempt; default 2 (plan §34). */
  maxRetries?: number;
  /** Base delay for exponential backoff; default 500 ms. */
  baseDelayMs?: number;
  /** Cap for any single backoff; default 10 s. */
  maxDelayMs?: number;
  /** True for mutation calls: only 429 is retried (see module docs). */
  mutation?: boolean;
  /** Abort signal from the caller; propagated to fetch and backoff (§34). */
  signal?: AbortSignal;
  /** Observability hook: 1-based retry number, the error, the chosen delay (plan §60). */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Decide whether `err` justifies retry number `attempt` (0-based). */
export function shouldRetry(
  err: unknown,
  attempt: number,
  options: LinearRetryOptions = {},
): boolean {
  const { maxRetries = 2, mutation = false } = options;
  if (attempt >= maxRetries) return false;
  if (isAbortError(err)) return false;

  if (err instanceof LinearError) {
    const status = err.status;
    // 429 / Ratelimited is rate limiting — retry after Linear's info.
    // UsageLimitExceeded is a hard plan/quota cap, NOT throttling: retrying
    // wastes quota requests and cannot succeed, so it never retries.
    if (status === 429 || err.type === LinearErrorType.Ratelimited) {
      return true;
    }
    // Everything below may have executed server-side for a mutation.
    if (mutation) return false;
    if (err.type === LinearErrorType.NetworkError) return true;
    if (status !== undefined && status >= 500) return true;
    return false; // 4xx, usage limit, validation, permission, auth, unknown — never.
  }

  if (err instanceof GraphQLClientError) {
    const status = err.response?.status;
    if (status === 429) return true;
    if (mutation) return false;
    if (status !== undefined && status >= 500) return true;
    return false;
  }

  // fetch-level failures surface as TypeError (ENOTFOUND / ECONNREFUSED / …).
  // Programmatic TypeErrors ("x is not a function") are coding bugs — never
  // retried (§34 network retry is for actual network failures).
  if (isNetworkTypeError(err)) return !mutation;

  return false;
}

function exponentialDelay(attempt: number, options: LinearRetryOptions): number {
  const { baseDelayMs = 500, maxDelayMs = 10_000 } = options;
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

/** Backoff for retry `attempt` (0-based), honoring Linear's retry info on 429. */
export function backoffDelay(
  err: unknown,
  attempt: number,
  options: LinearRetryOptions = {},
): number {
  const { maxDelayMs = 10_000, baseDelayMs = 500 } = options;

  // 429: prefer Linear's own retryAfter (seconds) when it is provided (§34).
  if (err instanceof RatelimitedLinearError) {
    if (typeof err.retryAfter === "number" && err.retryAfter > 0) {
      return Math.min(Math.max(err.retryAfter * 1000, baseDelayMs), maxDelayMs);
    }
  }
  if (err instanceof LinearError) {
    if (err.status === 429 || err.type === LinearErrorType.Ratelimited) {
      return exponentialDelay(attempt, options);
    }
  }
  if (err instanceof GraphQLClientError && err.response?.status === 429) {
    return exponentialDelay(attempt, options);
  }

  return exponentialDelay(attempt, options);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Run `operation` with the plan §34 retry policy. `operation` is invoked for
 * the first attempt and re-invoked on every retry, so a retry re-sends the
 * request.
 */
export function withLinearRetry<T>(
  operation: () => Promise<T> | T,
  options: LinearRetryOptions = {},
): Promise<T> {
  return retryFirst((async () => operation())(), operation, options);
}

/**
 * Retry engine: the first attempt is the already-started promise `first`;
 * retries re-invoke `reInvoke` (which must re-send the request, not memoize).
 * Aborts propagate to both the in-flight request and the backoff sleep.
 */
async function retryFirst<T>(
  first: Promise<T>,
  reInvoke: () => Promise<T> | T,
  options: LinearRetryOptions,
): Promise<T> {
  const { signal } = options;
  let attempts = 0;
  let current = first;
  for (;;) {
    signal?.throwIfAborted();
    try {
      return await current;
    } catch (err) {
      if (!shouldRetry(err, attempts, options)) throw err;
      const delayMs = backoffDelay(err, attempts, options);
      options.onRetry?.(attempts + 1, err, delayMs);
      await sleep(delayMs, signal);
      attempts += 1;
      current = Promise.resolve(reInvoke());
    }
  }
}

/**
 * SDK methods whose names start with these prefixes are mutations. Only 429
 * is retried for them (see module docs); everything else surfaces directly.
 */
const MUTATION_METHOD =
  /^(create|update|delete|archive|unarchive|rotate|revoke|add|remove|set|clear|attach|detach|import|export|move|shift|merge|suspend|unsuspend|change|reset|log|track)/i;

/**
 * Milestone 8 agent-mode mutations: the SDK names them with the `agent`
 * prefix (`agentSessionUpdate`, `agentActivityCreate`, …), which the generic
 * prefix test above cannot see. Same safety rule as every other mutation —
 * only 429 retries (the §34 duplicate-mutation rationale applies verbatim).
 */
const AGENT_MUTATION_METHOD =
  /^agent(Session|Activity)(Update|Create|Delete|Rotate|Unarchive|Archive)|^agentSession(CreateOnIssue|CreateOnComment|UpdateExternalUrl)/i;

/**
 * Wrap a `LinearClient` so every promise-returning method call runs through
 * the §34 retry policy. Reads get the full policy; mutations retry on 429
 * only. The method is invoked exactly once per attempt (no double request on
 * the success path), and synchronous methods pass through untouched.
 * Domain services keep calling the client exactly as before.
 */
export function retryableClient<T extends object>(client: T, options: LinearRetryOptions = {}): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const mutation =
        typeof prop === "string" &&
        (MUTATION_METHOD.test(prop) || AGENT_MUTATION_METHOD.test(prop));
      return function (this: unknown, ...args: unknown[]) {
        const result = value.apply(target, args);
        if (!result || typeof (result as Promise<unknown>).then !== "function") return result;
        return retryFirst(
          result as Promise<unknown>,
          () => value.apply(target, args) as Promise<unknown>,
          { ...options, mutation },
        );
      };
    },
  });
}
