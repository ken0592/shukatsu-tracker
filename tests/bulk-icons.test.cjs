const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const icons = require("../company-icons.js");
const entry = (id, extra = {}) => ({ id, companyName: "検証会社", logoUrl: "", updatedAt: "old", ...extra });

test("一括設定は空欄だけを保存し、同社の検索を再利用、途中の編集を保護する", async () => {
  let entries = [entry("a"), entry("manual", { logoUrl: "https://manual.example/icon.png" }),
    entry("trash", { deletedAt: "yesterday" }), entry("b"), entry("missing", { companyName: "不明会社" }),
    entry("edited", { companyName: "編集中" })];
  const lookedUp = [], saved = [];
  const result = await icons.fillMissingIcons({ entries, signal: new AbortController().signal,
    getEntry: (id) => entries.find((item) => item.id === id),
    findIcon: async (item) => {
      lookedUp.push(item.id);
      if (item.id === "edited") entries = entries.map((e) => e.id === item.id ? { ...e, logoUrl: "manual" } : e);
      return item.id === "missing" ? "" : "https://verified.example/favicon.ico";
    },
    save: async (item, url) => { saved.push(item.id); item.logoUrl = url; return "saved"; }
  });
  assert.deepEqual(lookedUp, ["a", "missing", "edited"]);
  assert.deepEqual(saved, ["a", "b"]);
  assert.deepEqual([result.total, result.completed, result.saved, result.missing, result.skipped], [4, 4, 2, 1, 1]);
  assert.equal(entries.find((e) => e.id === "edited").logoUrl, "manual");
});

test("中止後の検索結果は保存せず、保存済みの企業は再実行の対象外", async () => {
  const entries = [entry("a"), entry("b", { companyName: "別会社" }), entry("c")];
  const controller = new AbortController();
  const saved = [];
  const result = await icons.fillMissingIcons({ entries, signal: controller.signal,
    getEntry: (id) => entries.find((e) => e.id === id),
    findIcon: async (item) => { if (item.id === "b") controller.abort(); return "https://verified.example/favicon.ico"; },
    save: async (item, url) => { saved.push(item.id); item.logoUrl = url; return "saved"; }
  });
  assert.equal(result.stopped, true);
  assert.equal(result.saved, 1);
  assert.deepEqual(saved, ["a"]);
  assert.deepEqual(entries.filter(icons.needsIcon).map((e) => e.id), ["b", "c"]);
});

test("検索障害は記録し、混雑時と保存失敗時は残りを止める", async () => {
  for (const stopAt of ["search", "save"]) {
    const entries = [entry("a"), entry("b", { companyName: "別会社" }), entry("c")];
    const called = [];
    const result = await icons.fillMissingIcons({ entries, signal: new AbortController().signal,
      getEntry: (id) => entries.find((e) => e.id === id),
      findIcon: async (item) => {
        called.push(item.id);
        if (item.id === "a") throw new Error("temporary failure");
        if (stopAt === "search") throw Object.assign(new Error("混雑中"), { stopBatch: true });
        return "https://verified.example/favicon.ico";
      },
      save: async () => { throw Object.assign(new Error("保存失敗"), { stopBatch: true }); }
    });
    assert.deepEqual(called, ["a", "b"]);
    assert.equal(result.failed, 2);
    assert.equal(result.stopped, true);
    assert.equal(result.completed, 2);
  }
});

test("実画像の読み込みを確認し、候補が曖昧なら保存用URLを返さない", async () => {
  const originalImage = global.Image, originalFetch = global.fetch;
  const loaded = [];
  global.Image = class {
    removeAttribute() {}
    set src(url) { loaded.push(url); queueMicrotask(() => { this.naturalWidth = 32; url.endsWith(".svg") ? this.onload?.() : this.onerror?.(); }); }
  };
  try {
    global.fetch = async () => { throw new Error("公式URLでは検索不要"); };
    assert.equal(await icons.findAutomaticIcon(entry("a", { officialUrl: "https://verified.example/path?token=SECRET" }), { signal: new AbortController().signal }), "https://verified.example/favicon.svg");
    assert.deepEqual(loaded, ["https://verified.example/favicon.ico", "https://verified.example/favicon.svg"]);
    global.fetch = async () => Response.json({ candidates: [{ id: "Q1", website: "https://verified.example" }], automaticId: "" });
    assert.equal(await icons.findAutomaticIcon(entry("b"), { signal: new AbortController().signal }), "");
    assert.equal(loaded.length, 2);
    global.fetch = async () => new Response("", { status: 429 });
    await assert.rejects(icons.findAutomaticIcon(entry("c"), { signal: new AbortController().signal }), { stopBatch: true });
  } finally { global.Image = originalImage; global.fetch = originalFetch; }
});

function saveHarness(mode = "cloud") {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const body = source.slice(source.indexOf("async function saveBulkIcon("), source.indexOf("async function handleBulkIcons("));
  const state = { entries: [entry("a", { memo: "大切なメモ" })], mode, session: { user: { id: "u1" } } };
  const calls = [], scope = { userId: "u1" };
  let settle;
  const response = new Promise((resolve) => { settle = resolve; });
  const request = { update: (data) => { calls.push(["update", data]); return request; },
    eq: (key, value) => { calls.push([key, value]); return request; }, select: () => response };
  const context = { state, window: { SHUKATSU_ICONS: icons }, supabaseClient: { from: () => request },
    isCurrentUserScope: (s) => s.userId === state.session?.user.id,
    fromDbEntry: (row) => ({ ...state.entries[0], logoUrl: row.logo_url, updatedAt: row.updated_at }),
    renderCompanyList() {}, saveLocalEntries: () => true };
  vm.createContext(context); vm.runInContext(body, context);
  return { state, calls, scope, settle, context, save: context.saveBulkIcon };
}

test("クラウドはアイコン列だけを版指定で更新し、別端末の更新を上書きしない", async () => {
  const h = saveHarness();
  const result = h.save(h.state.entries[0], "https://verified.example/favicon.ico", h.scope);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [["update", { logo_url: "https://verified.example/favicon.ico" }], ["id", "a"], ["user_id", "u1"], ["updated_at", "old"]]);
  h.settle({ data: [] });
  assert.equal(await result, "skipped");
  assert.equal(h.state.entries[0].logoUrl, "");
  assert.equal(h.state.entries[0].memo, "大切なメモ");
});

test("保存中のアカウント変更や編集を保護し、端末の保存失敗を表示できる", async () => {
  for (const kind of ["account", "edit", "success"]) {
    const h = saveHarness();
    const result = h.save(h.state.entries[0], "https://verified.example/favicon.ico", h.scope);
    if (kind === "account") { h.state.session = null; h.state.entries = []; }
    if (kind === "edit") h.state.entries = [{ ...h.state.entries[0], memo: "新しいメモ", logoUrl: "manual" }];
    h.settle({ data: [{ logo_url: "https://verified.example/favicon.ico", updated_at: "new" }] });
    await result;
    if (kind === "account") assert.equal(h.state.entries.length, 0);
    else if (kind === "edit") assert.equal(h.state.entries[0].logoUrl, "manual");
    else { assert.equal(h.state.entries[0].updatedAt, "new"); assert.equal(h.state.entries[0].memo, "大切なメモ"); }
  }
  const h = saveHarness("local");
  h.context.saveLocalEntries = () => false;
  await assert.rejects(h.save(h.state.entries[0], "https://verified.example/favicon.ico", h.scope), { stopBatch: true });
  assert.equal(h.state.entries[0].logoUrl, "");
});
