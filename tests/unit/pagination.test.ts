import { expect, test } from "vite-plus/test";
import { DEFAULT_LIMIT, MAX_LIMIT, normalizeLimit } from "../../src/model/pagination.ts";

test("normalizeLimit defaults to 20 when absent or invalid", () => {
  expect(normalizeLimit()).toBe(DEFAULT_LIMIT);
  expect(normalizeLimit(undefined)).toBe(DEFAULT_LIMIT);
  expect(normalizeLimit(Number.NaN)).toBe(DEFAULT_LIMIT);
});

test("normalizeLimit clamps to the [1, 50] window", () => {
  expect(normalizeLimit(0)).toBe(1);
  expect(normalizeLimit(-5)).toBe(1);
  expect(normalizeLimit(MAX_LIMIT + 100)).toBe(MAX_LIMIT);
});

test("normalizeLimit floors fractional values", () => {
  expect(normalizeLimit(10.9)).toBe(10);
});
