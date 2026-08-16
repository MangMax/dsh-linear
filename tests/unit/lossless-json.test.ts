/**
 * Lossless-JSON boundary tests (surfaced by the first real harness run).
 *
 * The harness tool pipeline snapshots every tool output with a strict
 * lossless-JSON walker: a single `undefined` property value, sparse array,
 * non-finite number or non-plain prototype rejects the WHOLE result
 * ("value is not lossless JSON"). These tests pin the two guards:
 * {@link stripUndefined} at the tool boundary and the cursor-omitting
 * {@link toPagedResult} shape.
 */
import { expect, test } from "vite-plus/test";
import { toPagedResult } from "../../src/linear/pagination.ts";
import { stripUndefined } from "../../src/tools/define.ts";

test("stripUndefined drops undefined property values recursively", () => {
  const cleaned = stripUndefined({
    items: [
      { id: "i1", title: "a", status: undefined, nested: { dueDate: undefined, label: "x" } },
      { id: "i2", title: undefined },
    ],
    hasMore: false,
    nextCursor: undefined,
    count: 3,
  });
  expect(cleaned).toEqual({
    items: [{ id: "i1", title: "a", nested: { label: "x" } }, { id: "i2" }],
    hasMore: false,
    count: 3,
  });
  expect(Object.hasOwn(cleaned, "nextCursor")).toBe(false);
});

test("stripUndefined keeps arrays, scalars and null intact", () => {
  expect(stripUndefined([1, "a", null, true])).toEqual([1, "a", null, true]);
  expect(stripUndefined(null)).toBe(null);
  expect(stripUndefined("x")).toBe("x");
  expect(stripUndefined(0)).toBe(0);
});

test("cleaned canonical tool output is lossless JSON (round trip)", () => {
  const raw = {
    items: [
      { id: "t1", key: "ENG", name: "Engineering", icon: undefined },
      { id: "t2", key: "DSGN", name: "Design", description: undefined },
    ],
    hasMore: true,
    nextCursor: "cursor-1",
  };
  const cleaned = stripUndefined(raw) as Record<string, unknown>;
  const roundTrip = JSON.parse(JSON.stringify(cleaned));
  expect(roundTrip).toEqual(cleaned);
  expect(JSON.stringify(cleaned)).not.toContain("undefined");
});

test("toPagedResult omits nextCursor when there are no more pages", () => {
  const done = toPagedResult([{ id: "i" }], { hasNextPage: false });
  expect(Object.hasOwn(done, "nextCursor")).toBe(false);
  expect(done).toEqual({ items: [{ id: "i" }], hasMore: false });
});

test("toPagedResult carries nextCursor only when a cursor exists", () => {
  const paged = toPagedResult([{ id: "i" }], { hasNextPage: true, endCursor: "c2" });
  expect(paged).toEqual({ items: [{ id: "i" }], hasMore: true, nextCursor: "c2" });

  const noCursor = toPagedResult([{ id: "i" }], { hasNextPage: true, endCursor: null });
  expect(Object.hasOwn(noCursor, "nextCursor")).toBe(false);
});
