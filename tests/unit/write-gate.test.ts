/**
 * Write gate unit tests (plan §36–§37).
 *
 * The pure `writeGateDecision` mapping is tested here; the harness listener
 * (`registerWriteGate`) is exercised end to end in `tests/integration`.
 */
import { expect, test } from "vite-plus/test";
import { writeGateDecision } from "../../src/policy/write-gate.ts";

test("read tools always pass under any policy", () => {
  expect(writeGateDecision("ask", "linear_get_issue")).toEqual({ decision: "allow" });
  expect(writeGateDecision("allow", "linear_search_issues")).toEqual({ decision: "allow" });
  expect(writeGateDecision("deny", "linear_connection_status")).toEqual({ decision: "allow" });
});

test("write tools ask by default with a human reason", () => {
  const gate = writeGateDecision("ask", "linear_create_issue");
  expect(gate.decision).toBe("ask");
  expect(gate.reason).toMatch(/linear_create_issue/);
  expect(gate.reason).toMatch(/approve/);
  expect(writeGateDecision("ask", "linear_update_issue").decision).toBe("ask");
  expect(writeGateDecision("ask", "linear_add_comment").decision).toBe("ask");
});

test("write policy allow passes write tools through", () => {
  expect(writeGateDecision("allow", "linear_create_issue")).toEqual({ decision: "allow" });
  expect(writeGateDecision("allow", "linear_add_comment")).toEqual({ decision: "allow" });
});

test("write policy deny blocks write tools with a deny reason", () => {
  const gate = writeGateDecision("deny", "linear_update_issue");
  expect(gate.decision).toBe("deny");
  expect(gate.reason).toMatch(/writePolicy is set to deny/);
  expect(gate.reason).toMatch(/linear_update_issue/);
});

test("unknown tool names are treated as read (allow)", () => {
  expect(writeGateDecision("ask", "linear_raw_graphql")).toEqual({ decision: "allow" });
});
