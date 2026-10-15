import test from "node:test";
import assert from "node:assert/strict";
import { getSafePostLoginPath } from "../src/lib/authRedirect.js";

const origin = "https://hey.example";

test("post-login redirect preserves safe in-app routes", () => {
  assert.equal(getSafePostLoginPath("/projects?tab=recent#one", origin), "/projects?tab=recent#one");
});

test("post-login redirect rejects external and malformed URL forms", () => {
  for (const candidate of ["https://evil.example", "//evil.example/path", "/\\evil.example", "/bad\u0000path", "/bad\u001fpath", "javascript:alert(1)", "", null]) {
    assert.equal(getSafePostLoginPath(candidate, origin), "/chat");
  }
});
