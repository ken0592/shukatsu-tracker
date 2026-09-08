const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const { createStore, keyFor } = require("../scratchpad.js");
function memory() {
  const items = new Map([["shukatsu-tracker-entries", "企業の保存内容"], ["shukatsu-tracker-templates", "ESの保存内容"]]);
  return { items, getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
}
function locks() {
  let queue = Promise.resolve();
  return { request: (_, fn) => { const next = queue.then(fn); queue = next.catch(() => {}); return next; } };
}
test("改行・空白・日本語を保ち、メモ以外の保存先を変更しない", async () => {
  const storage = memory(), store = createStore(() => storage, locks());
  const text = "  思いつき\n\n・志望理由 🍁\n ";
  assert.equal((await store.save("local", text, null)).ok, true);
  assert.equal(createStore(() => storage).read("local").text, text);
  assert.equal(storage.items.get("shukatsu-tracker-entries"), "企業の保存内容");
  assert.equal(storage.items.get("shukatsu-tracker-templates"), "ESの保存内容");
});
test("アカウントと端末モードのメモが混ざらない", async () => {
  const store = createStore(memory);
  // Use a shared storage object to check all owners together.
  const storage = memory(), shared = createStore(() => storage);
  for (const owner of ["local", "user:A", "user:B"]) await shared.save(owner, owner + "専用", null);
  for (const owner of ["local", "user:A", "user:B"]) assert.equal(shared.read(owner).text, owner + "専用");
  assert.equal((await store.save(null, "", null)).ok, false);
});
test("別タブの同時保存は古い内容で上書きせず競合として返す", async () => {
  const storage = memory(), lock = locks();
  const a = createStore(() => storage, lock), b = createStore(() => storage, lock);
  const results = await Promise.all([a.save("user:A", "先に保存", null), b.save("user:A", "別の下書き", null)]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].reason, "conflict");
  assert.equal(a.read("user:A").text, "先に保存");
});
test("容量不足や壊れたメモを空欄で上書きしない", async () => {
  const storage = memory(), store = createStore(() => storage);
  const saved = await store.save("local", "残す内容", null);
  storage.setItem = () => { throw Error("QuotaExceededError"); };
  assert.equal((await store.save("local", "新しい下書き", saved.raw)).reason, "write");
  assert.equal(store.read("local").text, "残す内容");
  storage.items.set(keyFor("user:A"), "{broken");
  assert.equal(store.read("user:A").ok, false);
  assert.equal((await store.save("user:A", "", "{broken")).ok, false);
  assert.equal(storage.items.get(keyFor("user:A")), "{broken");
  assert.equal(createStore(() => { throw Error("SecurityError"); }).read("local").ok, false);
});

function uiHarness(lock) {
  const storage = memory(), elements = new Map(), events = {};
  const doc = { activeElement: null, querySelector(id) {
    if (!elements.has(id)) elements.set(id, { value: "", hidden: true, dataset: {}, handlers: {}, attrs: {},
      addEventListener(event, fn) { this.handlers[event] = fn; }, setAttribute(k,v) { this.attrs[k] = v; },
      focus() { doc.activeElement = this; }, select() {} });
    return elements.get(id);
  } };
  const sandbox = { document: doc, localStorage: storage, navigator: { locks: lock },
    addEventListener: (event, fn) => { events[event] = fn; }, setTimeout, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../scratchpad.js"), "utf8"), sandbox);
  const ui = sandbox.module.exports.mount(), el = id => doc.querySelector("#" + id);
  return { ui, storage, events, el, type(text) { el("scratchpadInput").value = text; el("scratchpadInput").handlers.input(); },
    click(id) { return el(id).handlers.click(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test("連続入力を保存し、閉じて開いても本文を保持する", async () => {
  const h = uiHarness(locks()); h.ui.setScope("local"); h.click("openScratchpadButton");
  h.type("途中"); h.type("途中\n追記した最終行"); await tick();
  assert.equal(JSON.parse(h.storage.getItem(keyFor("local"))).text, "途中\n追記した最終行");
  assert.equal(h.el("scratchpadPanel").dataset.saveState, "saved");
  h.click("closeScratchpadButton"); assert.equal(h.el("scratchpadPanel").hidden, true);
  h.click("openScratchpadButton"); assert.equal(h.el("scratchpadInput").value, "途中\n追記した最終行");
});
test("保存待ちにログアウトしても他アカウントへ本文・保存結果が出ない", async () => {
  let release;
  const h = uiHarness({ request: (_, fn) => new Promise(resolve => { release = () => resolve(fn()); }) });
  h.ui.setScope("user:A"); h.click("openScratchpadButton"); h.type("Aの本文");
  h.ui.setScope(null); assert.equal(h.el("scratchpadInput").value, ""); assert.equal(h.el("openScratchpadButton").disabled, true);
  h.ui.setScope("user:B"); release(); await tick();
  assert.equal(h.el("scratchpadInput").value, "");
  assert.equal(h.storage.getItem(keyFor("user:B")), null);
  assert.equal(JSON.parse(h.storage.getItem(keyFor("user:A"))).text, "Aの本文");
});
test("保存失敗でも下書きを保持し、終了前に未保存を検出する", async () => {
  const h = uiHarness(); h.ui.setScope("local");
  h.storage.setItem = () => { throw Error("full"); };
  h.type("保存できなくても残す本文"); await tick();
  assert.equal(h.el("scratchpadStatus").textContent, "未保存");
  h.click("closeScratchpadButton"); h.click("openScratchpadButton");
  assert.equal(h.el("scratchpadInput").value, "保存できなくても残す本文");
  let blocked = false; h.events.beforeunload({ preventDefault() { blocked = true; } }); assert.equal(blocked, true);
});
test("競合時の明示操作で両方のメモを残す", async () => {
  const h = uiHarness(locks()); h.ui.setScope("local");
  const external = createStore(() => h.storage, locks()); await external.save("local", "他の画面の本文", null);
  h.type("こちらの追記"); await tick();
  assert.equal(h.el("scratchpadPanel").dataset.saveState, "conflict");
  assert.equal(h.el("scratchpadInput").value, "こちらの追記");
  h.click("mergeScratchpadButton"); await tick();
  const text = external.read("local").text;
  assert.ok(text.includes("他の画面の本文")); assert.ok(text.includes("こちらの追記"));
  assert.equal(h.el("scratchpadPanel").dataset.saveState, "saved");
});
