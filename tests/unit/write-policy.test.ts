import { expect, test } from "vite-plus/test";
import { evaluateWritePolicy, isReadTool, isWriteTool } from "../../src/policy/write-policy.ts";

test("read tools are recognized and never gated", () => {
  expect(isReadTool("linear_get_issue")).toBe(true);
  expect(isWriteTool("linear_get_issue")).toBe(false);
  expect(evaluateWritePolicy("ask", "linear_get_issue")).toBe("allow");
});

test("write tools require ask by default", () => {
  expect(isWriteTool("linear_create_issue")).toBe(true);
  expect(evaluateWritePolicy("ask", "linear_create_issue")).toBe("ask");
  expect(evaluateWritePolicy("ask", "linear_update_issue")).toBe("ask");
  expect(evaluateWritePolicy("ask", "linear_add_comment")).toBe("ask");
});

test("write policy allow / deny override the default", () => {
  expect(evaluateWritePolicy("allow", "linear_create_issue")).toBe("allow");
  expect(evaluateWritePolicy("deny", "linear_create_issue")).toBe("deny");
});

test("unknown tool names are treated as read (allow)", () => {
  expect(evaluateWritePolicy("ask", "linear_raw_graphql")).toBe("allow");
});
