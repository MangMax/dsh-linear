/**
 * Per-mode credential ref resolution (M7 live switching).
 *
 * One settings field serves both auth modes: apiKey mode falls back to
 * DSH_LINEAR_API_KEY when the configured ref still names the OAuth default,
 * so flipping authMode live always lands on the right credential; explicit
 * custom refs are honored verbatim.
 */
import { expect, test } from "vite-plus/test";
import {
  DEFAULT_API_KEY_REF,
  DEFAULT_CREDENTIAL_REF,
  credentialRefFor,
} from "../../src/harness/settings.ts";

test("apiKey mode with the default (OAuth) ref falls back to the API key ref", () => {
  expect(credentialRefFor("apiKey", undefined)).toBe(DEFAULT_API_KEY_REF);
  expect(credentialRefFor("apiKey", DEFAULT_CREDENTIAL_REF)).toBe(DEFAULT_API_KEY_REF);
});

test("oauth mode keeps the OAuth ref", () => {
  expect(credentialRefFor("oauth", undefined)).toBe(DEFAULT_CREDENTIAL_REF);
  expect(credentialRefFor("oauth", DEFAULT_CREDENTIAL_REF)).toBe(DEFAULT_CREDENTIAL_REF);
});

test("explicit custom refs are honored verbatim in both modes", () => {
  expect(credentialRefFor("apiKey", "MY_KEY_REF")).toBe("MY_KEY_REF");
  expect(credentialRefFor("oauth", "MY_OAUTH_REF")).toBe("MY_OAUTH_REF");
});
