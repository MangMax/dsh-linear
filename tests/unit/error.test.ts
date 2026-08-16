import { expect, test } from "vite-plus/test";
import { LinearConnectorError } from "../../src/linear/error.ts";

test("factories produce stable codes and friendly messages", () => {
  const notFound = LinearConnectorError.notFound("issue", "ENG-123");
  expect(notFound.code).toBe("NOT_FOUND");
  expect(notFound.message).toContain('"ENG-123"');

  const ambiguous = LinearConnectorError.ambiguous("assignee", "Alex", ["Alex Chen", "Alex Liu"]);
  expect(ambiguous.code).toBe("AMBIGUOUS_REFERENCE");
  expect(ambiguous.message).toContain("- Alex Chen");
  expect(ambiguous.message).toContain("- Alex Liu");

  expect(LinearConnectorError.notConnected().code).toBe("NOT_CONNECTED");
  expect(LinearConnectorError.validation("bad input").code).toBe("VALIDATION_ERROR");
});

test("errors are instanceof LinearConnectorError and Error", () => {
  const error = LinearConnectorError.notConnected();
  expect(error).toBeInstanceOf(LinearConnectorError);
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("LinearConnectorError");
});

test("cause is preserved when provided", () => {
  const cause = new Error("graphql failed");
  const error = new LinearConnectorError("LINEAR_API_ERROR", "boom", { cause });
  expect(error.cause).toBe(cause);
});
