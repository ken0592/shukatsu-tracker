"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const icons = require("../company-icons.js");
const handler = require("../api/company-icons.js");
const entity = (id, name, website) => ({ id, labels: { ja: { value: name } }, aliases: {}, claims: { P856: [{ mainsnak: { datavalue: { value: website } } }] } });

test("公開ドメインだけを使い、認証URL・IP・ローカルホストを拒否する", () => {
  for (const value of ["https://127.0.0.1", "http://2130706433", "https://router.local", "https://[::1]", "https://user:pass@corp.example", "https://corp.example:8443", "javascript:alert(1)"])
    assert.equal(icons.publicSite(value), "");
  assert.equal(icons.domainHint("https://recruit.corp.example/app?id=PRIVATE#token"), "recruit.corp.example");
  assert.equal(icons.domainHint("https://job.axol.jp/hy/s/corp_27/entry?id=PRIVATE"), "");
  assert.equal(icons.recruitingTenant("https://job.axol.jp/hy/s/corp_27/entry?id=PRIVATE"), "corp");
  assert.equal(icons.recruitingTenant("https://hrmos.co/pages/corp/jobs/123?token=PRIVATE"), "corp");
  assert.equal(icons.recruitingTenant("https://unknown.example/SECRET"), "");
  assert.deepEqual(icons.iconSources("http://corp.example/path?token=PRIVATE"), ["https://corp.example/favicon.ico", "https://corp.example/favicon.svg", "https://corp.example/apple-touch-icon.png"]);
});

test("社名を基本に照合し、同名企業はURLの手がかりで絞る", () => {
  const first = entity("Q1", "株式会社サンプル", "https://sample.example");
  const second = entity("Q2", "サンプル", "https://other.example");
  const entities = { Q1: first, Q2: second };
  assert.equal(icons.companyKey("株式会社 サンプル"), icons.companyKey("サンプル株式会社"));
  assert.equal(icons.makeCandidates({ Q1: first }, "サンプル").automaticId, "Q1");
  assert.equal(icons.makeCandidates(entities, "サンプル").automaticId, "");
  assert.equal(icons.makeCandidates(entities, "サンプル", "recruit.other.example").automaticId, "Q2");
  assert.equal(icons.makeCandidates(entities, "サンプル", "", "sample").automaticId, "Q1");
  assert.equal(icons.makeCandidates({ Q1: first }, "サンプル", "unrelated.example").automaticId, "");
  assert.equal(icons.makeCandidates({ Q1: first }, "名前が違う").automaticId, "");
  assert.equal(icons.makeCandidates({ Q1: entity("Q1", "秘密", "https://127.0.0.1") }, "秘密").candidates.length, 0);
  const product = { ...first, descriptions: { ja: { value: "携帯型ゲーム機" } } };
  assert.equal(icons.makeCandidates({ Q1: product }, "サンプル").candidates.length, 0);
});

function responseObject() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("検索APIはWikidataだけを参照し、同じ企業の検索を再利用する", async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return Response.json(new URL(url).searchParams.get("action") === "wbsearchentities"
      ? { search: [{ id: "Q10" }] } : { entities: { Q10: entity("Q10", "検証株式会社", "https://verified.example") } });
  };
  try {
    const request = { method: "POST", headers: { "content-type": "application/json" }, body: { name: "検証株式会社", hint: "https://evil.example/private?token=SECRET", tenant: "verified" } };
    const first = responseObject(); await handler(request, first);
    assert.equal(first.code, 200);
    assert.equal(first.body.automaticId, "Q10");
    const second = responseObject(); await handler(request, second);
    assert.equal(second.code, 200);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((url) => new URL(url).origin === "https://www.wikidata.org"));
    assert.equal(calls.join("\n").includes("SECRET"), false);
    const bad = responseObject(); await handler({ ...request, body: { name: "user@example.com" } }, bad);
    assert.equal(bad.code, 400); assert.equal(calls.length, 2);
    const unavailable = responseObject(); global.fetch = async () => Response.json({}, { status: 503 });
    await handler({ ...request, body: { name: "未取得株式会社" } }, unavailable);
    assert.equal(unavailable.code, 502);
  } finally { global.fetch = original; }
});

function pickerHarness() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.handlers = {}; this.dataset = {}; this.value = ""; this.naturalWidth = 0; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    append(...children) { this.children.push(...children); }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text || ""; }
  }
  const fields = Object.fromEntries(["companyName", "mypageUrl", "officialUrl", "logoUrl"].map((name) => [name, new Element("input")]));
  fields.companyName.value = "株式会社サンプル";
  fields.mypageUrl.value = "https://recruit.sample.example/login?id=SECRET";
  const panel = new Element("panel"), button = new Element("button"), timers = [], bodies = [];
  const candidate = { id: "Q1", name: "サンプル", website: "https://sample.example", description: "企業" };
  const context = vm.createContext({ URL, AbortController, document: { createElement: (tag) => new Element(tag) },
    setTimeout: (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; }, clearTimeout: (timer) => { if (timer) timer.cancelled = true; },
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return Response.json({ candidates: [candidate], automaticId: "Q1" }); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../company-icons.js"), "utf8"), context);
  const picker = context.SHUKATSU_ICONS.createPicker({ form: { elements: fields }, panel, button });
  const run = async () => { picker.schedule(); await timers.findLast((timer) => timer.delay === 800 && !timer.cancelled)?.fn(); };
  const image = () => panel.children.find((child) => child.tag === "div").children.find((child) => child.tag === "img");
  return { fields, panel, button, picker, run, image, bodies };
}

test("読み込めた画像だけ自動設定し、URLの秘密部分を送らない", async () => {
  const h = pickerHarness(); await h.run();
  assert.equal(h.fields.logoUrl.value, "");
  const image = h.image(); image.naturalWidth = 32; image.handlers.load();
  assert.equal(h.fields.logoUrl.value, "https://sample.example/favicon.ico");
  assert.equal(JSON.stringify(h.bodies).includes("SECRET"), false);
  h.fields.companyName.value = "別企業";
  h.fields.companyName.handlers.input();
  assert.equal(h.fields.logoUrl.value, "");
});

test("手動URLを優先し、閉じた画面への遅い画像読み込みを無視する", async () => {
  const manual = pickerHarness(); manual.fields.logoUrl.value = "https://manual.example/logo.png"; await manual.run();
  assert.equal(manual.bodies.length, 0);
  const stale = pickerHarness(); await stale.run(); const image = stale.image();
  stale.picker.reset(); image.naturalWidth = 32; image.handlers.load();
  assert.equal(stale.fields.logoUrl.value, "");
  const changed = pickerHarness(); await changed.run(); const late = changed.image();
  changed.fields.logoUrl.value = "https://manual.example/logo.png"; changed.fields.logoUrl.handlers.input();
  late.naturalWidth = 32; late.handlers.load();
  assert.equal(changed.fields.logoUrl.value, "https://manual.example/logo.png");
});

test("画像の取得失敗では別形式を試し、壊れたURLを保存しない", async () => {
  const h = pickerHarness(); await h.run(); const image = h.image();
  image.handlers.error(); assert.match(image.src, /favicon\.svg$/);
  image.handlers.error(); assert.match(image.src, /apple-touch-icon\.png$/);
  image.handlers.error(); assert.equal(image.hidden, true);
  assert.equal(h.fields.logoUrl.value, "");
});
