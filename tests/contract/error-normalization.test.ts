/**
 * Error normalization contract tests (plan §35, §53.2).
 *
 * Mock boundary: the @linear/sdk error classes. Every failure that can reach
 * the model must normalize into a stable LinearConnectorError code with a
 * single-line, sanitized message — no GraphQL noise, no stack traces.
 */
import { expect, test } from "vite-plus/test";
import { GraphQLClientError, LinearError, LinearErrorType } from "@linear/sdk";
import { LinearConnectorError, normalizeLinearError } from "../../src/linear/error.ts";

test("LinearConnectorError passes through unchanged", () => {
  const original = LinearConnectorError.notFound("issue", "ENG-123");
  expect(normalizeLinearError(original)).toBe(original);
});

test("429 status maps to RATE_LIMITED before type mapping", () => {
  const err = new LinearError({ response: { status: 429 } }, [], LinearErrorType.Ratelimited);
  expect(normalizeLinearError(err)).toMatchObject({ code: "RATE_LIMITED" });
});

test("authentication failure maps to AUTH_EXPIRED", () => {
  const err = new LinearError({}, [], LinearErrorType.AuthenticationError);
  expect(normalizeLinearError(err)).toMatchObject({ code: "AUTH_EXPIRED" });
});

test("forbidden and feature-inaccessible map to PERMISSION_DENIED", () => {
  const forbidden = new LinearError({}, [], LinearErrorType.Forbidden);
  expect(normalizeLinearError(forbidden)).toMatchObject({ code: "PERMISSION_DENIED" });
  const inaccessible = new LinearError({}, [], LinearErrorType.FeatureNotAccessible);
  expect(normalizeLinearError(inaccessible)).toMatchObject({ code: "PERMISSION_DENIED" });
});

test("rate limit and usage limit types map to RATE_LIMITED", () => {
  const limited = new LinearError({}, [], LinearErrorType.Ratelimited);
  expect(normalizeLinearError(limited)).toMatchObject({ code: "RATE_LIMITED" });
  const usage = new LinearError({}, [], LinearErrorType.UsageLimitExceeded);
  const normalized = normalizeLinearError(usage);
  expect(normalized).toMatchObject({ code: "RATE_LIMITED" });
  // Usage limit is a plan quota, not throttling — the message must say so
  // (M7: surfaced by the real-Linear E2E against a quota-full workspace).
  expect(normalized.message).toContain("usage limit");
  expect(normalized.message).not.toContain("rate limit");
});

test("network errors map to NETWORK_ERROR", () => {
  const linear = new LinearError({}, [], LinearErrorType.NetworkError);
  expect(normalizeLinearError(linear)).toMatchObject({ code: "NETWORK_ERROR" });
  expect(normalizeLinearError(new TypeError("fetch failed"))).toMatchObject({
    code: "NETWORK_ERROR",
  });
  expect(
    normalizeLinearError(new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") })),
  ).toMatchObject({ code: "NETWORK_ERROR" });
});

test("programmatic TypeErrors map to LINEAR_API_ERROR with the real message", () => {
  const bug = new TypeError("project.updates is not a function");
  const normalized = normalizeLinearError(bug);
  expect(normalized).toMatchObject({ code: "LINEAR_API_ERROR" });
  expect(normalized.message).toContain("project.updates is not a function");
});

test("invalid input maps to VALIDATION_ERROR", () => {
  const err = new LinearError({}, [], LinearErrorType.InvalidInput);
  expect(normalizeLinearError(err)).toMatchObject({ code: "VALIDATION_ERROR" });
});

test("unknown SDK errors map to LINEAR_API_ERROR with a sanitized message", () => {
  const err = new LinearError(
    {},
    [
      {
        type: LinearErrorType.GraphqlError,
        message: "GraphQL request failed at issue()\n  at <anonymous>",
      },
    ],
    LinearErrorType.GraphqlError,
  );
  const normalized = normalizeLinearError(err);
  expect(normalized).toMatchObject({ code: "LINEAR_API_ERROR" });
  expect(normalized.message).toBe("GraphQL request failed at issue()");
  expect(normalized.message).not.toContain("at <anonymous>");
});

test("long messages are truncated", () => {
  const long = "x".repeat(500);
  const err = new LinearError(
    {},
    [{ type: LinearErrorType.Unknown, message: long }],
    LinearErrorType.Unknown,
  );
  const normalized = normalizeLinearError(err);
  expect(normalized.message.length).toBeLessThanOrEqual(301);
});

test("GraphQLClientError maps by status", () => {
  const server = new GraphQLClientError<unknown, Record<string, unknown>>(
    { status: 500, error: "internal" },
    { query: "query", variables: {} },
  );
  expect(normalizeLinearError(server)).toMatchObject({ code: "NETWORK_ERROR" });

  const badRequest = new GraphQLClientError<unknown, Record<string, unknown>>(
    { status: 400, error: "bad input" },
    { query: "query", variables: {} },
  );
  expect(normalizeLinearError(badRequest)).toMatchObject({ code: "LINEAR_API_ERROR" });
});

test("generic and non-error values map to LINEAR_API_ERROR", () => {
  expect(normalizeLinearError(new Error("boom"))).toMatchObject({
    code: "LINEAR_API_ERROR",
    message: "boom",
  });
  expect(normalizeLinearError("raw string")).toMatchObject({ code: "LINEAR_API_ERROR" });
});
