import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("corrupt persist file is quarantined and not overwritten with seed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "podai-store-"));
  const file = path.join(dir, "store.json");
  fs.writeFileSync(file, "{not-json");
  process.env.STORE_PERSIST_PATH = file;
  // fresh module load
  const id = Date.now();
  const mod = await import(`../../saas-store.js?corrupt=${id}`);
  await assert.rejects(() => mod.getState(), /store_persist_corrupt/);
  assert.ok(!fs.existsSync(file), "corrupt file moved aside");
  assert.ok(fs.readdirSync(dir).some(n => n.startsWith("store.json.corrupt-")));
  // must not have written seed over the path
  assert.ok(!fs.existsSync(file));
});
