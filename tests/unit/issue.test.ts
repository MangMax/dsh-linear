import { expect, test } from "vite-plus/test";
import { priorityLabel, priorityToValue } from "../../src/model/issue.ts";

test("priorityToValue maps tool inputs to Linear numeric priorities", () => {
  expect(priorityToValue("urgent")).toBe(1);
  expect(priorityToValue("high")).toBe(2);
  expect(priorityToValue("medium")).toBe(3);
  expect(priorityToValue("low")).toBe(4);
  expect(priorityToValue("none")).toBe(0);
  expect(priorityToValue(undefined)).toBeUndefined();
});

test("priorityLabel maps Linear numeric priorities to labels", () => {
  expect(priorityLabel(0)).toBe("No priority");
  expect(priorityLabel(1)).toBe("Urgent");
  expect(priorityLabel(2)).toBe("High");
  expect(priorityLabel(3)).toBe("Medium");
  expect(priorityLabel(4)).toBe("Low");
});

test("priorityLabel handles null / undefined / unknown values", () => {
  expect(priorityLabel(null)).toBe("No priority");
  expect(priorityLabel(undefined)).toBe("No priority");
  expect(priorityLabel(99)).toBe("Priority 99");
});
