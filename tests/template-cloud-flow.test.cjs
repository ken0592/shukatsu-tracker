const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const merge = require("../template-conflicts.js");
const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const version = n => `2026-09-27T00:00:0${n}.000Z`;
const original = () => ({ id: "template-a", kind: "ガクチカ", title: "元のタイトル", body: "元の本文", sortOrder: 0,
  createdAt: version(0), updatedAt: version(1) });
const row = (template) => ({ id: template.id, kind: template.kind, title: template.title, body: template.body,
  sort_order: template.sortOrder, created_at: template.createdAt, updated_at: template.updatedAt });
const success = template => ({ data: [row(template)], error: null });
const submit = () => ({ preventDefault() {} });

function load(context, names) {
  vm.createContext(context);
  for (const name of names) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `function ${name} exists`);
    const tail = source.slice(start);
    const next = tail.slice(1).search(/\n(?:async )?function /u);
    vm.runInContext(next < 0 ? tail : tail.slice(0, next + 1), context);
  }
}

function harness() {
  const requests = [], responses = [], messages = [], sync = [], choices = new Map();
  const state = { mode: "cloud", userScopeVersion: 0, session: { user: { id: "owner" } },
    templates: [original()], editingTemplateId: "template-a", editingBaseTemplate: original(),
    cloudTemplateSortOrderAvailable: true, templateSavePending: false, pendingEntryConflict: null };
  const control = (value = "") => ({ value, disabled: false, textContent: "", focus() {} });
  const els = {
    templateKindInput: control("ガクチカ"), templateTitleInput: control("PCのタイトル"), templateBodyInput: control("PCの本文"),
    saveTemplateButton: control(), resetTemplateButton: control(), templateDialogTitle: control(), templateBodyCount: control(),
    resolveConflictButton: control(), closeConflictButton: control(), cancelConflictButton: control(),
    saveConflictList: { innerHTML: "", textContent: "" },
    templateDialog: { open: true, close() { this.open = false; }, showModal() { this.open = true; } },
    saveConflictDialog: { open: false, close() { this.open = false; }, showModal() { this.open = true; } },
    templateForm: { reset() { els.templateKindInput.value = "ガクチカ"; els.templateTitleInput.value = ""; els.templateBodyInput.value = ""; } },
    saveConflictForm: { reset() { choices.clear(); }, elements: { namedItem: name => ({ value: choices.get(name) || "draft" }) } }
  };
  const context = {
    state, els, window: { SHUKATSU_TEMPLATE_CONFLICTS: merge }, document: { querySelector: () => control() },
    createId: () => "new-template", nextTemplateSortOrder: () => 1, formatCharCount: value => `${value.length}字`,
    showToast: message => messages.push(message), recordCloudSyncResult: (error, scope) => sync.push({ error, scope }),
    renderTemplateList() {}, renderTemplateOptions() {}, escapeHtml: value => String(value),
    cloudEntryErrorMessage: error => error.message,
    supabaseClient: {
      from(table) {
        const request = { table, filters: [], operation: "read" };
        const finish = () => {
          requests.push(request);
          assert.ok(responses.length, `unexpected ${request.operation} query`);
          const response = responses.shift();
          return typeof response === "function" ? response(request) : Promise.resolve(response);
        };
        const builder = {
          update(payload) { request.operation = "update"; request.payload = plain(payload); return builder; },
          insert(payload) { request.operation = "insert"; request.payload = plain(payload); return builder; },
          eq(key, value) { request.filters.push([key, value]); return builder; },
          select(columns) { request.columns = columns; return request.operation === "update" ? finish() : builder; },
          limit() { return finish(); }, single() { return finish(); }
        };
        return builder;
      }
    }
  };
  load(context, ["captureUserScope", "isCurrentUserScope", "isPlainRecord", "normalizeStoredText", "normalizeStoredTimestamp",
    "normalizeTemplate", "toDbTemplate", "fromDbTemplate", "updateCloudTemplate", "fetchCloudTemplate", "createCloudTemplate",
    "requestEntryConflictResolution", "renderEntryConflictDialog", "conflictChoiceMarkup", "conflictValuePreview",
    "cloneEntryFieldValue", "handleConflictSubmit", "finishEntryConflict", "cancelEntryConflict", "handleTemplateSubmit",
    "updateTemplateSaveControls", "resetTemplateForm", "updateTemplateBodyCount", "handleEditTemplate", "openTemplateEditor",
    "saveCloudTemplateOrder"]);
  return { h: context, state, els, requests, responses, messages, sync, choices,
    invalidate() { state.userScopeVersion += 1; state.session = { user: { id: "other-owner" } }; state.templates = [];
      state.templateSavePending = false; state.editingTemplateId = null; state.editingBaseTemplate = null; } };
}

async function until(predicate) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail("expected asynchronous state was not reached");
}

test("template updates are protected by identity, owner, and base timestamp", async () => {
  const x = harness(), base = original(), draft = { ...base, title: "変更" };
  x.responses.push(success({ ...draft, updatedAt: version(2) }));
  const saved = await x.h.updateCloudTemplate(draft, base);
  assert.deepEqual(x.requests[0].filters, [["id", base.id], ["user_id", "owner"], ["updated_at", base.updatedAt]]);
  assert.deepEqual(x.requests[0].payload, { kind: base.kind, title: "変更", body: base.body, sort_order: 0 });
  assert.equal(x.requests[0].table, "es_templates");
  assert.equal(saved.updatedAt, version(2));
});

test("different fields merge automatically and retry against the fetched latest timestamp", async () => {
  const x = harness(), base = original(), draft = { ...base, title: "PC" };
  const latest = { ...base, body: "スマホ本文", sortOrder: 3, updatedAt: version(2) };
  x.responses.push({ data: [] }, success(latest), success({ ...latest, title: draft.title, updatedAt: version(3) }));
  const saved = await x.h.updateCloudTemplate(draft, base);
  assert.equal(x.requests.length, 3);
  assert.deepEqual(x.requests[1].filters, [["id", base.id], ["user_id", "owner"]]);
  assert.deepEqual(x.requests[2].filters, [["id", base.id], ["user_id", "owner"], ["updated_at", latest.updatedAt]]);
  assert.deepEqual(x.requests[2].payload, { kind: base.kind, title: "PC", body: "スマホ本文", sort_order: 3 });
  assert.equal(saved.body, "スマホ本文");
  assert.equal(x.state.pendingEntryConflict, null);
});

test("overlapping edits wait for a choice and save chosen plus independent changes with latest CAS", async () => {
  const x = harness(), base = original();
  const draft = { ...base, title: "PCのタイトル", body: "PCの本文" };
  const latest = { ...base, title: "スマホのタイトル", kind: "自己PR", updatedAt: version(2) };
  x.responses.push({ data: [] }, success(latest));
  const work = x.h.updateCloudTemplate(draft, base);
  await until(() => x.state.pendingEntryConflict);
  assert.equal(x.state.pendingEntryConflict.kind, "template");
  assert.deepEqual(plain(x.state.pendingEntryConflict.conflicts.map(field => field.key)), ["title"]);
  assert.match(x.els.saveConflictList.innerHTML, /PCのタイトル/u);
  assert.match(x.els.saveConflictList.innerHTML, /スマホのタイトル/u);
  assert.equal(x.els.saveConflictDialog.open, true);
  x.choices.set("entry-conflict-0", "latest");
  const expected = { ...latest, body: draft.body, updatedAt: version(3) };
  x.responses.push(success(expected));
  await x.h.handleConflictSubmit(submit());
  assert.deepEqual(x.requests[2].payload, { kind: "自己PR", title: latest.title, body: draft.body, sort_order: 0 });
  assert.deepEqual(x.requests[2].filters, [["id", base.id], ["user_id", "owner"], ["updated_at", latest.updatedAt]]);
  assert.deepEqual(plain(await work), expected);
  assert.equal(x.state.pendingEntryConflict, null);
  assert.equal(x.els.saveConflictDialog.open, false);
});

test("another edit during choice confirmation returns to the retained editor without blind overwrite", async () => {
  const x = harness(), base = original();
  x.responses.push({ data: [] }, success({ ...base, title: "スマホ", updatedAt: version(2) }));
  const work = x.h.updateCloudTemplate({ ...base, title: "PC" }, base);
  await until(() => x.state.pendingEntryConflict);
  x.responses.push({ data: [] });
  await x.h.handleConflictSubmit(submit());
  assert.equal(await work, null);
  assert.equal(x.els.templateTitleInput.value, "PCのタイトル");
  assert.match(x.messages.at(-1), /確認中に別の更新/u);
});

test("remote deletion retains the edit and never resurrects the missing record", async () => {
  const x = harness();
  x.responses.push({ data: [] }, { data: [] });
  await x.h.handleTemplateSubmit(submit());
  assert.deepEqual(x.requests.map(request => request.operation), ["update", "read"]);
  assert.equal(x.state.editingTemplateId, "template-a");
  assert.equal(x.els.templateBodyInput.value, "PCの本文");
  assert.equal(x.els.templateDialog.open, true);
  assert.equal(x.state.templateSavePending, false);
  assert.match(x.messages.at(-1), /編集内容は残っています/u);
});

test("a changed account discards an in-flight save response and causes no new-account UI writes", async () => {
  const x = harness();
  let resolve;
  x.responses.push(() => new Promise(done => { resolve = done; }));
  const work = x.h.handleTemplateSubmit(submit());
  assert.equal(x.state.templateSavePending, true);
  x.invalidate();
  x.els.templateTitleInput.value = "新しいアカウントの内容";
  resolve(success({ ...original(), title: "古いアカウントの保存結果", updatedAt: version(2) }));
  await work;
  assert.equal(x.state.templates.length, 0);
  assert.equal(x.els.templateTitleInput.value, "新しいアカウントの内容");
  assert.equal(x.messages.length, 0);
  assert.equal(x.sync.length, 0);
});

test("scope cancellation resolves a pending choice and prevents it saving for the next account", async () => {
  const x = harness(), base = original();
  x.responses.push({ data: [] }, success({ ...base, title: "スマホ", updatedAt: version(2) }));
  const work = x.h.updateCloudTemplate({ ...base, title: "PC" }, base);
  await until(() => x.state.pendingEntryConflict);
  x.invalidate();
  await x.h.handleConflictSubmit(submit());
  assert.equal(x.requests.length, 2);
  x.h.finishEntryConflict(null);
  assert.equal(await work, null);
  assert.equal(x.els.saveConflictDialog.open, false);
});

test("saving twice sends one request and blocks reset and editing a second template", async () => {
  const x = harness();
  let resolve;
  x.state.templates.push({ ...original(), id: "template-b", title: "別の型" });
  x.responses.push(() => new Promise(done => { resolve = done; }));
  const work = x.h.handleTemplateSubmit(submit());
  await x.h.handleTemplateSubmit(submit());
  x.h.resetTemplateForm();
  x.h.handleEditTemplate("template-b");
  assert.equal(x.requests.length, 1);
  assert.equal(x.state.editingTemplateId, "template-a");
  assert.equal(x.els.templateBodyInput.disabled, true);
  resolve(success({ ...original(), title: "PCのタイトル", body: "PCの本文", updatedAt: version(2) }));
  await work;
  assert.equal(x.state.templates[0].title, "PCのタイトル");
  assert.equal(x.state.templates[1].title, "別の型");
  assert.equal(x.state.editingTemplateId, null);
  assert.equal(x.els.templateDialog.open, false);
  assert.equal(x.els.templateBodyInput.disabled, false);
});

test("refreshing the list during editing cannot replace the retained comparison base", async () => {
  const x = harness(), base = original();
  x.state.templates = [{ ...base, title: "最新のタイトル", updatedAt: version(2) }];
  x.responses.push(success({ ...base, title: "PCのタイトル", body: "PCの本文", updatedAt: version(3) }));
  await x.h.handleTemplateSubmit(submit());
  assert.deepEqual(x.requests[0].filters.at(-1), ["updated_at", version(1)]);
});

test("network failure leaves editable content and records synchronization failure", async () => {
  const x = harness();
  x.responses.push({ data: null, error: { message: "offline" } });
  await x.h.handleTemplateSubmit(submit());
  assert.equal(x.els.templateBodyInput.value, "PCの本文");
  assert.equal(x.state.editingTemplateId, "template-a");
  assert.equal(x.els.templateBodyInput.disabled, false);
  assert.equal(x.sync[0].error.message, "offline");
});

test("confirmation cannot submit twice and its failed save keeps choices available for retry", async () => {
  const x = harness(), base = original();
  x.responses.push({ data: [] }, success({ ...base, title: "スマホ", updatedAt: version(2) }));
  const work = x.h.updateCloudTemplate({ ...base, title: "PC" }, base);
  await until(() => x.state.pendingEntryConflict);
  x.choices.set("entry-conflict-0", "latest");
  let resolve;
  x.responses.push(() => new Promise(done => { resolve = done; }));
  const confirmation = x.h.handleConflictSubmit(submit());
  await x.h.handleConflictSubmit(submit());
  x.h.cancelEntryConflict();
  assert.equal(x.requests.length, 3);
  assert.equal(x.els.cancelConflictButton.disabled, true);
  resolve({ data: null, error: { message: "offline" } });
  await confirmation;
  assert.equal(x.state.pendingEntryConflict.saving, false);
  assert.equal(x.els.cancelConflictButton.disabled, false);
  assert.equal(x.els.saveConflictDialog.open, true);
  assert.equal(x.choices.get("entry-conflict-0"), "latest");
  x.h.cancelEntryConflict();
  assert.equal(await work, null);
});

test("continuous independent remote edits stop retries while retaining the original editor", async () => {
  const x = harness(), base = original();
  x.responses.push({ data: [] }, success({ ...base, body: "remote 1", updatedAt: version(2) }),
    { data: [] }, success({ ...base, body: "remote 2", updatedAt: version(3) }), { data: [] });
  const result = await x.h.updateCloudTemplate({ ...base, title: "PC" }, base);
  assert.equal(result, null);
  assert.equal(x.requests.filter(request => request.operation === "update").length, 3);
  assert.match(x.messages.at(-1), /更新が続いています/u);
  assert.equal(x.els.templateTitleInput.value, "PCのタイトル");
});

test("a delayed reorder response cannot replace a newer body saved while another reorder response is pending", async () => {
  const x = harness(), baseA = original(), baseB = { ...original(), id: "template-b", title: "別の型", sortOrder: 1 };
  const reorderedA = { ...baseA, sortOrder: 1, updatedAt: version(2) };
  const reorderedB = { ...baseB, sortOrder: 0, updatedAt: version(2) };
  x.state.templates = [{ ...baseA, sortOrder: 1 }, { ...baseB, sortOrder: 0 }];
  let resolveSecondReorder;
  x.responses.push(success(reorderedA), () => new Promise(resolve => { resolveSecondReorder = resolve; }));
  const reorderWork = x.h.saveCloudTemplateOrder([baseA, baseB]);
  assert.equal(x.requests.length, 2);
  assert.deepEqual(x.requests[0].payload, { sort_order: 1 });
  assert.deepEqual(x.requests[0].filters, [["id", baseA.id], ["user_id", "owner"], ["updated_at", baseA.updatedAt]]);

  // The edit still starts at v1: the server's v2 reorder forces a merge preserving the new order.
  const newer = { ...reorderedA, title: "PCのタイトル", body: "PCの本文", updatedAt: version(3) };
  x.responses.push({ data: [] }, success(reorderedA), success(newer));
  await x.h.handleTemplateSubmit(submit());
  assert.deepEqual(plain(x.state.templates[0]), newer);

  resolveSecondReorder(success(reorderedB));
  await reorderWork;
  assert.deepEqual(plain(x.state.templates[0]), newer);
  assert.deepEqual(plain(x.state.templates[1]), reorderedB);
  assert.equal(x.state.templates[0].body, "PCの本文");
  assert.equal(x.state.templates[0].updatedAt, version(3));
});
