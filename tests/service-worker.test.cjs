"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../service-worker.js"), "utf8");

function harness(response = new Response("ok")) {
  const listeners = {};
  const writes = [];
  const deletes = [];
  const context = vm.createContext({ URL,
    self: { location: { origin: "https://app.test" }, addEventListener(name, callback) { listeners[name] = callback; }, clients: { claim: async () => {} } },
    fetch: async () => response,
    caches: {
      keys: async () => ["shukatsu-tracker-v1", source.match(/const cacheName = "([^"]+)"/)[1], "another-app-v1"],
      delete: async (name) => deletes.push(name),
      open: async () => ({ put: async (request) => writes.push(request.url) })
    }
  });
  vm.runInContext(source, context);
  return { listeners, writes, deletes };
}

test("API・認証付き通信・外部通信にはサービスワーカーのキャッシュを介さない", () => {
  const h = harness();
  for (const [url, init] of [
    ["https://app.test/api/ai-cards"], ["https://app.test/api/ai-cards?status=1"],
    ["https://auth.test/session"], ["https://app.test/private", { headers: { Authorization: "Bearer test" } }]
  ]) {
    h.listeners.fetch({ request: new Request(url, init), respondWith() { assert.fail("private requests must not be handled"); } });
  }
});

test("成功した公開ファイルだけを保存し、別アプリのキャッシュは削除しない", async () => {
  for (const [response, expected] of [
    [new Response("ok"), 1],
    [new Response("missing", { status: 404 }), 0],
    [new Response("secret", { headers: { "Cache-Control": "no-store" } }), 0],
    [new Response("private", { headers: { "Cache-Control": "private, max-age=60" } }), 0]
  ]) {
    const h = harness(response);
    const pending = [];
    h.listeners.fetch({ request: new Request("https://app.test/app.js"), respondWith(promise) { pending.push(promise); }, waitUntil(promise) { pending.push(promise); } });
    await Promise.all(pending);
    await Promise.all(pending);
    assert.equal(h.writes.length, expected);
  }
  const h = harness();
  let activated;
  h.listeners.activate({ waitUntil(promise) { activated = promise; } });
  await activated;
  assert.deepEqual(h.deletes, ["shukatsu-tracker-v1"]);
});
