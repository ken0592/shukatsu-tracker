"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const normalizeStart = appSource.indexOf("function isPlainRecord(");
const normalizeEnd = appSource.indexOf("function toDbTemplate(", normalizeStart);
const urlStart = appSource.indexOf("function normalizeExternalUrl(");
const urlEnd = appSource.indexOf("function companyIconText(", urlStart);
const backupValidationStart = appSource.indexOf("function isValidBackup(");
const backupValidationEnd = appSource.indexOf("function mergeById(", backupValidationStart);
const importedIdStart = appSource.indexOf("function normalizeImportedRecordId(");
const importedIdEnd = appSource.indexOf("function cloudEntryErrorMessage(", importedIdStart);
const dbEntryStart = appSource.indexOf("function toDbEntry(");
const dbEntryEnd = appSource.indexOf("function fromDbEntry(", dbEntryStart);
const dbTemplateStart = appSource.indexOf("function toDbTemplate(");
const dbTemplateEnd = appSource.indexOf("function fromDbTemplate(", dbTemplateStart);
assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart, "data normalizers must remain extractable");
assert.ok(urlStart >= 0 && urlEnd > urlStart, "URL normalizers must remain extractable");
assert.ok(backupValidationStart >= 0 && backupValidationEnd > backupValidationStart, "backup validators must remain extractable");
assert.ok(importedIdStart >= 0 && importedIdEnd > importedIdStart, "imported id validator must remain extractable");
assert.ok(dbEntryStart >= 0 && dbEntryEnd > dbEntryStart, "entry payload builder must remain extractable");
assert.ok(dbTemplateStart >= 0 && dbTemplateEnd > dbTemplateStart, "template payload builder must remain extractable");

let idCounter = 0;
const context = vm.createContext({
  activeStatuses: ["気になる", "応募済み"],
  finishedStatuses: ["内定", "落選"],
  trackTypeHints: {
    インターン: "",
    夏インターン: "",
    冬インターン: "",
    早期選考: "",
    本選考: "",
    説明会: "",
    面談: "",
    "OB/OG訪問": ""
  },
  createId: () => `safe-id-${++idCounter}`,
  formatCharCount: () => "",
  countCharacters: (value) => Array.from(String(value || "")).length,
  URL,
  Date,
  Set,
  Object,
  Array,
  String,
  Number,
  state: {
    session: { user: { id: "user-1" } },
    cloudDeletedAtAvailable: true
  },
  console
});

vm.runInContext(
  `${appSource.slice(urlStart, urlEnd)}\n${appSource.slice(normalizeStart, normalizeEnd)}\n`
    + `${appSource.slice(backupValidationStart, backupValidationEnd)}\n`
    + `${appSource.slice(importedIdStart, importedIdEnd)}\n`
    + `${appSource.slice(dbEntryStart, dbEntryEnd)}\n${appSource.slice(dbTemplateStart, dbTemplateEnd)}\n`
    + "globalThis.hardening = { normalizeEntry, normalizeTemplate, normalizeEsItems, normalizeExternalUrl, normalizeExternalImageUrl, isPublicWebHostname, isValidBackup, normalizeImportedRecordId, toDbEntry, toDbTemplate };",
  context
);

const helpers = context.hardening;

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

test("malformed backup field types and enum prototypes become safe defaults", () => {
  const entry = helpers.normalizeEntry({
    id: { unsafe: true },
    companyName: ["A社"],
    industry: {},
    status: "__proto__",
    trackType: "constructor",
    priority: [],
    deadline: "2026-02-30",
    eventDate: { value: "2026-08-01" },
    memo: { html: "<img>" }
  });

  assert.match(entry.id, /^safe-id-/u);
  assert.equal(entry.companyName, "");
  assert.equal(entry.industry, "");
  assert.equal(entry.status, "気になる");
  assert.equal(entry.trackType, "本選考");
  assert.equal(entry.priority, "未定");
  assert.equal(entry.deadline, "");
  assert.equal(entry.eventDate, "");
  assert.equal(entry.memo, "");
});

test("card links reject active protocols and automatic images use public HTTPS only", () => {
  assert.equal(helpers.normalizeExternalUrl("javascript:alert(1)"), "");
  assert.equal(helpers.normalizeExternalUrl("https://user:pass@example.com/"), "");
  assert.equal(helpers.normalizeExternalUrl("https://example.com/path"), "https://example.com/path");

  assert.equal(helpers.normalizeExternalImageUrl("http://example.com/logo.png"), "");
  assert.equal(helpers.normalizeExternalImageUrl("https://127.0.0.1/logo.png"), "");
  assert.equal(helpers.normalizeExternalImageUrl("https://router.local/logo.png"), "");
  assert.equal(helpers.normalizeExternalImageUrl("https://cdn.example.com/logo.png?token=x"), "");
  assert.equal(helpers.normalizeExternalImageUrl("https://cdn.example.com/logo.png"), "https://cdn.example.com/logo.png");

  const stored = helpers.normalizeEntry({
    companyName: "A社",
    logoUrl: "https://cdn.example.com/logo.png?width=128"
  });
  assert.equal(stored.logoUrl, "https://cdn.example.com/logo.png?width=128");
});

test("nested ES and template values are bounded and non-object", () => {
  const items = helpers.normalizeEsItems([{
    id: {},
    question: { unsafe: true },
    variants: [{ id: [], label: {}, answer: { unsafe: true } }]
  }], "legacy");
  assert.equal(items.length, 1);
  assert.equal(items[0].question, "");
  assert.equal(typeof items[0].variants[0].answer, "string");

  const template = helpers.normalizeTemplate({
    id: {},
    kind: [],
    title: { unsafe: true },
    body: ["secret"]
  });
  assert.match(template.id, /^safe-id-/u);
  assert.equal(template.kind, "ガクチカ");
  assert.equal(template.title, "");
  assert.equal(template.body, "");
});

test("an unanswered ES question remains byte-stable after repeated normalization", () => {
  const source = {
    id: "entry-stable",
    companyName: "A社",
    esItems: [{
      id: "question-stable",
      question: "志望動機を教えてください。",
      variants: [{ id: "variant-stable", label: "", answer: "" }],
      activeVariantId: "variant-stable"
    }]
  };
  const first = helpers.normalizeEntry(source);
  const second = helpers.normalizeEntry(first);
  assert.equal(first.esItems[0].variants[0].id, "variant-stable");
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test("malformed backup ids, URLs, and field types fail safely", () => {
  const maliciousValue = { toString: null };
  assert.doesNotThrow(() => helpers.normalizeEntry({ companyName: "A社", officialUrl: maliciousValue }));
  assert.equal(helpers.normalizeEntry({ companyName: "A社", officialUrl: maliciousValue }).officialUrl, "");
  assert.match(helpers.normalizeImportedRecordId(maliciousValue), /^safe-id-/u);

  assert.equal(helpers.isValidBackup({
    app: "shukatsu-tracker",
    version: 3,
    entries: [{ id: maliciousValue, companyName: "A社" }],
    templates: []
  }), false);
  assert.equal(helpers.isValidBackup({
    app: "shukatsu-tracker",
    version: 3,
    entries: [{ id: "11111111-1111-4111-8111-111111111111", companyName: [] }],
    templates: []
  }), false);
  assert.equal(helpers.isValidBackup({
    app: "shukatsu-tracker",
    version: 99,
    entries: [{ companyName: "A社" }],
    templates: []
  }), false);
  assert.equal(helpers.isValidBackup({
    app: "shukatsu-tracker",
    version: 3,
    entries: [{ companyName: "A社", esItems: [{ question: {}, variants: [] }] }],
    templates: []
  }), false);
});

test("cloud backup payloads include saved ordering only when requested", () => {
  const entry = helpers.normalizeEntry({
    id: "entry-order",
    companyName: "A社",
    sortOrder: 7
  });
  const template = helpers.normalizeTemplate({
    id: "template-order",
    title: "志望動機",
    sortOrder: 3
  });
  assert.equal(Object.hasOwn(helpers.toDbEntry(entry), "sort_order"), false);
  assert.equal(helpers.toDbEntry(entry, { includeSortOrder: true }).sort_order, 7);
  assert.equal(Object.hasOwn(helpers.toDbTemplate(template), "sort_order"), false);
  assert.equal(helpers.toDbTemplate(template, { includeSortOrder: true }).sort_order, 3);
});

test("seasonal tracks survive storage and cloud payload normalization", () => {
  for (const trackType of ["夏インターン", "冬インターン", "インターン", "早期選考", "本選考"]) {
    const original = { id: "season", companyName: "A社", trackType, memo: "残すメモ", esItems: [{ question: "設問", answer: "回答" }] };
    const saved = helpers.normalizeEntry(JSON.parse(JSON.stringify(helpers.normalizeEntry(original))));
    assert.equal(saved.trackType, trackType);
    assert.equal(helpers.toDbEntry(saved).track_type, trackType);
    assert.equal(saved.memo, "残すメモ");
    assert.equal(saved.esItems[0].variants[0].answer, "回答");
  }
});

console.log("7 data hardening tests passed");

test("four priority levels survive normalization and database serialization", () => {
  for (const priority of ["最優先", "高", "中", "低"]) {
    const entry = helpers.normalizeEntry({ id: "test-entry", companyName: "A社", priority });
    assert.equal(entry.priority, priority);
    assert.equal(helpers.toDbEntry(entry).priority, priority);
  }
});
