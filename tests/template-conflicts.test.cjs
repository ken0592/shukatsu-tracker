const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { templateMergeFields, mergeTemplateVersions } = require("../template-conflicts.js");

const base = () => ({ id: "template-a", kind: "ガクチカ", title: "元のタイトル", body: "元の本文", sortOrder: 0,
  createdAt: "created", updatedAt: "base-version" });

test("different fields merge without changing latest metadata or input records", () => {
  const original = Object.freeze(base());
  const draft = Object.freeze({ ...original, title: "PCのタイトル", updatedAt: "draft-version" });
  const latest = Object.freeze({ ...original, body: "スマホの本文", sortOrder: 2, updatedAt: "latest-version" });
  const result = mergeTemplateVersions(original, draft, latest);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.template, { ...latest, title: draft.title });
  assert.equal(original.title, "元のタイトル");
  assert.equal(latest.title, "元のタイトル");
});

test("concurrent differences require a choice for each overlapping field", () => {
  const original = base();
  const draft = { ...original, kind: "自己PR", title: "PC", body: "PC本文", sortOrder: 1 };
  const latest = { ...original, kind: "志望動機", title: "スマホ", body: "スマホ本文", sortOrder: 2 };
  const result = mergeTemplateVersions(original, draft, latest);
  assert.deepEqual(result.conflicts, templateMergeFields);
  assert.deepEqual(result.template, latest);
});

test("the same edit on both devices does not conflict", () => {
  const original = base();
  const draft = { ...original, title: "一致", body: "一致本文", sortOrder: 3 };
  const latest = { ...draft, updatedAt: "latest" };
  const result = mergeTemplateVersions(original, draft, latest);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.template, latest);
});

test("an intentional empty body remains an edit and conflicts with a different remote body", () => {
  const original = base();
  const result = mergeTemplateVersions(original, { ...original, body: "" }, { ...original, body: "最新" });
  assert.deepEqual(result.conflicts.map(field => field.key), ["body"]);
  assert.equal(mergeTemplateVersions(original, { ...original, body: "" }, original).template.body, "");
});

test("missing legacy order values compare consistently and finite order changes are preserved", () => {
  const original = { ...base(), sortOrder: Number.NaN };
  const draft = { ...original, title: "編集", sortOrder: undefined };
  const latest = { ...original, sortOrder: null };
  assert.deepEqual(mergeTemplateVersions(original, draft, latest).conflicts, []);
  assert.equal(mergeTemplateVersions(original, { ...draft, sortOrder: 0 }, latest).template.sortOrder, 0);
  assert.deepEqual(mergeTemplateVersions(original, { ...draft, sortOrder: 0 }, { ...latest, sortOrder: 4 })
    .conflicts.map(field => field.key), ["sortOrder"]);
});

test("latest identity and creation timestamp cannot be overwritten by draft metadata", () => {
  const original = base();
  const result = mergeTemplateVersions(original, { ...original, createdAt: "draft-created", updatedAt: "draft", title: "変更" },
    { ...original, createdAt: "server-created", updatedAt: "server" });
  assert.equal(result.template.createdAt, "server-created");
  assert.equal(result.template.updatedAt, "server");
});

test("missing or mismatched records cannot silently resurrect or overwrite a different template", () => {
  assert.throws(() => mergeTemplateVersions(base(), base(), null), TypeError);
  assert.throws(() => mergeTemplateVersions(base(), { ...base(), id: "other" }, base()), TypeError);
  assert.throws(() => mergeTemplateVersions(base(), base(), { ...base(), id: "other" }), TypeError);
});

test("browser global exposes the same merge API without CommonJS", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../template-conflicts.js"), "utf8"), context);
  assert.equal(typeof context.window.SHUKATSU_TEMPLATE_CONFLICTS.mergeTemplateVersions, "function");
  const result = context.window.SHUKATSU_TEMPLATE_CONFLICTS.mergeTemplateVersions(base(), { ...base(), title: "変更" }, base());
  assert.equal(result.template.title, "変更");
});
