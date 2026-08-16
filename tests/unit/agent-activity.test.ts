/**
 * Agent activity model + Linear mapper tests (plan §43; Milestone 8).
 *
 * Verifies the canonical kinds, the exact Linear `content` payload shapes
 * (validated server-side by Linear — this mapper is the single alignment
 * point), the ephemeral-only-for-thought/action rule, and the truncation
 * guards that keep mirror summaries user-comprehensible (§43).
 */
import { expect, test } from "vite-plus/test";
import {
  clampSummary,
  createAgentActivity,
  ephemeralAllowed,
  toLinearActivityContent,
} from "../../src/agent/activity.ts";

test("thought maps to { type: thought, body } with markdown summary", () => {
  const activity = createAgentActivity("thought", {
    summary: "正在检查与该 Issue 相关的实现。",
    ephemeral: true,
  });
  expect(ephemeralAllowed("thought")).toBe(true);
  expect(activity.ephemeral).toBe(true);
  expect(toLinearActivityContent(activity)).toEqual({
    type: "thought",
    body: "正在检查与该 Issue 相关的实现。",
  });
});

test("elicitation maps to { type: elicitation, body }", () => {
  const activity = createAgentActivity("elicitation", {
    summary: "请确认要修改哪个模块？",
  });
  expect(ephemeralAllowed("elicitation")).toBe(false);
  expect(activity.ephemeral).toBeUndefined();
  expect(toLinearActivityContent(activity)).toEqual({
    type: "elicitation",
    body: "请确认要修改哪个模块？",
  });
});

test("response maps to { type: response, body }", () => {
  const activity = createAgentActivity("response", {
    summary: "已完成修改，测试通过。",
  });
  expect(toLinearActivityContent(activity)).toEqual({
    type: "response",
    body: "已完成修改，测试通过。",
  });
});

test("error maps to { type: error, body }", () => {
  const activity = createAgentActivity("error", {
    summary: "Agent 运行失败：配额不足。",
  });
  expect(toLinearActivityContent(activity)).toEqual({
    type: "error",
    body: "Agent 运行失败：配额不足。",
  });
});

test("action maps to { type: action, action, parameter } (no result)", () => {
  const activity = createAgentActivity("action", {
    summary: "搜索 Issue（ENG-123）",
    action: "搜索 Issue",
    parameter: "ENG-123",
    ephemeral: true,
  });
  expect(toLinearActivityContent(activity)).toEqual({
    type: "action",
    action: "搜索 Issue",
    parameter: "ENG-123",
  });
});

test("action_result maps to { type: action, action, parameter, result }", () => {
  const activity = createAgentActivity("action_result", {
    summary: "搜索 Issue 完成：ENG-123 存在",
    action: "搜索 Issue",
    parameter: "ENG-123",
    result: "ENG-123 存在，标题 Fix accessibility",
  });
  expect(toLinearActivityContent(activity)).toEqual({
    type: "action",
    action: "搜索 Issue",
    parameter: "ENG-123",
    result: "ENG-123 存在，标题 Fix accessibility",
  });
});

test("ephemeral is dropped for kinds Linear does not allow", () => {
  for (const kind of ["elicitation", "response", "error", "action_result"] as const) {
    const activity = createAgentActivity(kind, { summary: "x", ephemeral: true });
    expect(activity.ephemeral, kind).toBeUndefined();
  }
});

test("clampSummary truncates long summaries with an ellipsis", () => {
  const long = "x".repeat(5000);
  const clamped = clampSummary(long, 100);
  expect(clamped.length).toBe(100);
  expect(clamped.endsWith("…")).toBe(true);
  expect(clampSummary(" short ", 100)).toBe("short");
});

test("action parameter is clamped to the Linear-friendly size", () => {
  const activity = createAgentActivity("action", {
    summary: "a",
    action: "a",
    parameter: "p".repeat(500),
  });
  const content = toLinearActivityContent(activity) as { parameter: string };
  expect(content.parameter.length).toBe(120);
  expect(content.parameter.endsWith("…")).toBe(true);
});
