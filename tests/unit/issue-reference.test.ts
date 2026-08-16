/**
 * parseIssueReference unit tests (plan §31).
 */
import { expect, test } from "vite-plus/test";
import { parseIssueReference } from "../../src/linear/issue-reference.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";

test("accepts uppercase and lowercase identifiers", () => {
  expect(parseIssueReference("ENG-123")).toEqual({ kind: "identifier", value: "ENG-123" });
  expect(parseIssueReference("eng-123")).toEqual({ kind: "identifier", value: "ENG-123" });
});

test("accepts Linear issue URLs with and without a slug", () => {
  expect(parseIssueReference("https://linear.app/mang/issue/ENG-123")).toEqual({
    kind: "identifier",
    value: "ENG-123",
  });
  expect(
    parseIssueReference("https://linear.app/mang/issue/ENG-123/Fix-login-token-refresh"),
  ).toEqual({
    kind: "identifier",
    value: "ENG-123",
  });
  expect(parseIssueReference("https://linear.app/mang/issue/ENG-123?query=1#frag")).toEqual({
    kind: "identifier",
    value: "ENG-123",
  });
});

test("accepts Linear 16-char ids and canonical UUIDs", () => {
  expect(parseIssueReference("d5e4f3a2b1c0d9e8")).toEqual({
    kind: "id",
    value: "d5e4f3a2b1c0d9e8",
  });
  expect(parseIssueReference("12345678-1234-5678-1234-567812345678")).toEqual({
    kind: "id",
    value: "12345678-1234-5678-1234-567812345678",
  });
});

test("accepts an id embedded in a URL path", () => {
  expect(parseIssueReference("https://linear.app/mang/issue/d5e4f3a2b1c0d9e8/Some-title")).toEqual({
    kind: "id",
    value: "d5e4f3a2b1c0d9e8",
  });
});

test("trims surrounding whitespace", () => {
  expect(parseIssueReference("  eng-123 \n")).toEqual({ kind: "identifier", value: "ENG-123" });
});

test("rejects garbage with a stable VALIDATION_ERROR", () => {
  for (const ref of ["", "   ", "123", "ENG", "https://example.com/ENG-123", "ENG-123-extra"]) {
    try {
      parseIssueReference(ref);
      throw new Error("expected parseIssueReference to throw for " + JSON.stringify(ref));
    } catch (err) {
      expect(err).toBeInstanceOf(LinearConnectorError);
      expect((err as LinearConnectorError).code).toBe("VALIDATION_ERROR");
    }
  }
});
