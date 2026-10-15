import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Tasks page uses its responsive layout styles", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../src/TasksPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/TasksPage.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /import\s+["']\.\/TasksPage\.css["']/);
  assert.match(page, /className="hey-tasks-layout"/);
  assert.match(page, /className="hey-tasks-card-heading"/);
  assert.match(page, /className="hey-tasks-stats"/);
  assert.match(page, /className="hey-tasks-sidebar"/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(260px, 360px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /@media\s*\(max-width:\s*480px\)[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media\s*\(max-width:\s*480px\)[\s\S]*?\.hey-tasks-card-heading > button[\s\S]*?width:\s*100%/);
});
