import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginPage = await readFile(new URL("../src/LoginPage.jsx", import.meta.url), "utf8");

test("login page reports unavailable auth and disables requests without Supabase config", () => {
  assert.match(loginPage, /import \{ isSupabaseConfigured \} from "\.\/lib\/supabase\.js"/);
  assert.match(loginPage, /Authentication is not configured in this local build/);
  assert.match(loginPage, /disabled=\{loading \|\| !isSupabaseConfigured\}/);
  assert.match(loginPage, /disabled=\{resetLoading \|\| !isSupabaseConfigured\}/);
  assert.match(loginPage, /Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/);
});

test("login and password reset recover from thrown service errors", () => {
  assert.equal((loginPage.match(/catch \{/g) || []).length, 2);
  assert.equal((loginPage.match(/finally \{/g) || []).length, 2);
  assert.match(loginPage, /HEY could not reach the authentication service/);
});
