"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../app.js"), "utf8");

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  const asyncStart = app.indexOf(`async function ${name}(`);
  const at = start < 0 ? asyncStart : asyncStart >= 0 ? Math.min(start, asyncStart) : start;
  assert.ok(at >= 0, `${name} should exist`);
  const next = app.slice(at + 1).search(/\n(?:async )?function /u);
  return app.slice(at, next < 0 ? undefined : at + next + 1);
}

function makeEntryHelpers() {
  let ids = 0;
  const context = vm.createContext({
    Date, Set, Object, Array, String, Number, URL,
    activeStatuses: ["気になる", "応募済み"], finishedStatuses: ["内定", "落選"],
    trackTypeHints: { インターン: "", 夏インターン: "", 秋インターン: "", 冬インターン: "", 早期選考: "", 本選考: "", 説明会: "", 面談: "", "OB/OG訪問": "" },
    createId: () => `generated-${++ids}`,
    normalizeExternalUrl: (value) => typeof value === "string" ? value : "",
    normalizeExternalImageUrl: (value) => typeof value === "string" ? value : "",
    isPublicWebHostname: () => true,
    state: { session: { user: { id: "u1" } }, cloudDeletedAtAvailable: true, cloudDeadlineTimeAvailable: true }
  });
  const from = app.indexOf("function isPlainRecord(");
  const to = app.indexOf("function toDbTemplate(", from);
  assert.ok(from >= 0 && to > from, "entry normalization block should be extractable");
  vm.runInContext(`${app.slice(from, to)}\n${functionSource("toDbEntry")}\n${functionSource("fromDbEntry")}\n${functionSource("normalizeDeadlineTime")}\nglobalThis.api={normalizeEntry,toDbEntry,fromDbEntry,normalizeDeadlineTime,restoreLocalCollectionSnapshot};`, context);
  return { context, api: context.api };
}

test("締切時刻はHH:mmだけを保持し、日付なしでは消え、DB往復と旧schema制御が働く", () => {
  const { context, api } = makeEntryHelpers();
  assert.equal(api.normalizeDeadlineTime("23:59"), "23:59");
  for (const invalid of ["24:00", "12:60", "9:00", "12:00:00", "１２:００", null]) assert.equal(api.normalizeDeadlineTime(invalid), "");
  const entry = api.normalizeEntry({ id: "e1", companyName: "A社", trackType: "夏インターン", status: "応募済み", deadline: "2026-09-27", deadlineTime: "12:00", memo: "keep" });
  assert.equal(entry.deadlineTime, "12:00");
  const payload = api.toDbEntry(entry);
  assert.equal(payload.deadline_time, "12:00");
  assert.equal(api.fromDbEntry({ ...payload, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" }).deadlineTime, "12:00");
  assert.equal(api.normalizeEntry({ ...entry, deadline: "", deadlineTime: "12:00" }).deadlineTime, "");
  context.state.cloudDeadlineTimeAvailable = false;
  assert.throws(() => api.toDbEntry(entry), /締切時刻の保存先/u);
  assert.equal(api.toDbEntry({ ...entry, deadlineTime: "" }).deadline_time, undefined);
});

test("バックアップ復元は締切時刻を壊さず、ローカルsnapshotにも保持する", () => {
  const { api, context } = makeEntryHelpers();
  const storage = new Map();
  context.localStorage = { removeItem: (key) => storage.delete(key), setItem: (key, value) => storage.set(key, value) };
  vm.runInContext(functionSource("isValidLocalCollection"), context);
  vm.runInContext(functionSource("restoreLocalCollectionSnapshot"), context);
  const raw = JSON.stringify([api.normalizeEntry({ id: "e", companyName: "A", deadline: "2026-09-27", deadlineTime: "23:59" })]);
  assert.equal(context.restoreLocalCollectionSnapshot("main", "pending", "backup", raw), true);
  assert.equal(JSON.parse(storage.get("backup"))[0].deadlineTime, "23:59");
  assert.equal(api.normalizeEntry(JSON.parse(storage.get("main"))[0]).deadlineTime, "23:59");
});

test("締切超過判定はJSTの正午・23:59境界と時刻未設定を区別する", () => {
  const context = vm.createContext({ Date });
  vm.runInContext(`${functionSource("normalizeDeadlineTime")}\n${functionSource("isDeadlineOverdue")}\nglobalThis.check=isDeadlineOverdue;`, context);
  const deadline = { deadline: "2026-09-27", deadlineTime: "12:00" };
  assert.equal(context.check(deadline, new Date("2026-09-27T02:59:59.000Z")), false);
  assert.equal(context.check(deadline, new Date("2026-09-27T03:00:01.000Z")), true);
  assert.equal(context.check({ deadline: "2026-09-27", deadlineTime: "23:59" }, new Date("2026-09-27T14:58:59.000Z")), false);
  assert.equal(context.check({ deadline: "2026-09-27", deadlineTime: "23:59" }, new Date("2026-09-27T14:59:01.000Z")), true);
  assert.equal(context.check({ deadline: "2026-09-27", deadlineTime: "" }, new Date("2026-09-27T14:59:59.000Z")), false);
  assert.equal(context.check({ deadline: "2026-09-27", deadlineTime: "" }, new Date("2026-09-28T00:00:00.000Z")), true);
});

function syncHarness() {
  const state = { session: { user: { id: "u1" } }, syncRequestId: 0, entries: [{ id: "old" }], templates: [{ id: "old-template" }], cloudDeletedAtAvailable: true, cloudDeadlineTimeAvailable: true };
  let scopeVersion = 1, entriesResponse, templatesResponse;
  const scope = () => ({ userId: state.session?.user?.id || "", version: scopeVersion });
  const sameScope = (captured) => captured.version === scopeVersion && captured.userId === (state.session?.user?.id || "");
  const client = { from: (table) => ({ select: () => ({ order: async () => table === "entries" ? entriesResponse : templatesResponse }) }) };
  const context = vm.createContext({ state, supabaseClient: client, captureUserScope: scope, isCurrentUserScope: sameScope,
    refreshCloudEntryColumnSupport: async () => {}, fromDbEntry: (row) => ({ ...row, type: "entry" }), fromDbTemplate: (row) => ({ ...row, type: "template" }),
    renderMode() {}, render() {}, showToast(message) { state.toast = message; }, recordCloudSyncResult(error) { state.syncError = error ? "failed" : ""; },
    Promise, Date, console });
  vm.runInContext(functionSource("refreshCloudCollections"), context);
  return { context, state, setResponses(entries, templates) { entriesResponse = entries; templatesResponse = templates; }, switchUser(id) { state.session = { user: { id } }; scopeVersion++; }, bumpRequest() { state.syncRequestId++; } };
}

test("クラウド同期の成功・失敗・再試行は成功済みデータと型を保つ", async () => {
  const h = syncHarness();
  h.setResponses({ data: [{ id: "fresh" }] }, { data: [{ id: "fresh-template" }] });
  await h.context.refreshCloudCollections(false);
  assert.equal(h.state.entries[0].type, "entry");
  assert.equal(h.state.templates[0].type, "template");
  h.setResponses({ error: new Error("offline") }, { error: new Error("offline") });
  await h.context.refreshCloudCollections(false);
  assert.equal(h.state.entries[0].id, "fresh");
  assert.equal(h.state.templates[0].id, "fresh-template");
  assert.equal(h.state.syncError, "failed");
  h.setResponses({ data: [{ id: "retry" }] }, { data: [{ id: "retry-template" }] });
  await h.context.refreshCloudCollections(false);
  assert.equal(h.state.entries[0].id, "retry");
  assert.equal(h.state.templates[0].id, "retry-template");
  assert.equal(h.state.syncError, "");
});

test("クラウド同期はアカウント変更と遅い旧リクエストの結果を破棄する", async () => {
  const h = syncHarness();
  let resolve;
  h.setResponses(new Promise((done) => { resolve = done; }), { data: [{ id: "template-old" }] });
  const pending = h.context.refreshCloudCollections(false);
  h.switchUser("u2");
  resolve({ data: [{ id: "entry-old" }] });
  await pending;
  assert.equal(h.state.entries[0].id, "old");
  assert.equal(h.state.templates[0].id, "old-template");
  h.setResponses({ data: [{ id: "new-user" }] }, { data: [{ id: "new-user-template" }] });
  await h.context.refreshCloudCollections(false);
  assert.equal(h.state.entries[0].id, "new-user");
});

function trackHarness(mode = "local") {
  const entry = { id: "e1", companyName: "A社", trackType: "夏インターン", updatedAt: "revision-1", esItems: [{ answer: "ES" }], memo: "memo", interviewNotes: "interview", status: "応募済み", deadline: "2026-09-30", deadlineTime: "12:00" };
  const state = { mode, entries: [entry], pendingSelectionChanges: new Set(), pendingStatusChanges: new Set(), entrySavePending: false, detailSavePending: false, session: { user: { id: "u1" } } };
  const scope = { userId: "u1" }; let current = true; const calls = [];
  const query = { update(data) { calls.push(["update", data]); return query; }, eq(key, value) { calls.push([key, value]); return query; }, select: async () => ({ data: [{ ...entry, track_type: "秋インターン", created_at: "2026-09-01", updated_at: "revision-2" }] }) };
  const context = vm.createContext({ state, window: { SHUKATSU_GROUPS: { key: (item) => item.companyName.normalize("NFKC").toLowerCase() } },
    isTrashed: (item) => Boolean(item.deletedAt), captureUserScope: () => scope, isCurrentUserScope: () => current,
    supabaseClient: { from: () => query }, fromDbEntry: (row) => ({ ...entry, trackType: row.track_type, updatedAt: row.updated_at }),
    saveLocalEntries: (next) => { calls.push(["local-save", next]); return true; }, recordCloudSyncResult: () => {}, showToast: (message) => calls.push(["toast", message]), render() {},
    Date, Set, Promise, console });
  vm.runInContext(functionSource("handleCompanyTrackChange"), context);
  return { state, context, calls, entry, invalidate() { current = false; state.session = null; } };
}

test("季節変更は選考区分だけを変え、ES・メモ・進捗・締切を保持する", async () => {
  const h = trackHarness();
  const control = { dataset: { companyTrack: "e1" }, value: "秋インターン", disabled: false };
  await h.context.handleCompanyTrackChange(control);
  const saved = h.state.entries[0];
  assert.equal(saved.trackType, "秋インターン");
  for (const field of ["esItems", "memo", "interviewNotes", "status", "deadline", "deadlineTime"]) assert.deepEqual(JSON.parse(JSON.stringify(saved[field])), h.entry[field]);
});

test("同じ企業の変更先はゴミ箱の枝も含めて重複拒否し、クラウド更新はCAS条件付き", async () => {
  const duplicate = trackHarness();
  duplicate.state.entries.push({ id: "trash", companyName: "a社", trackType: "秋インターン", deletedAt: "2026-09-01" });
  await duplicate.context.handleCompanyTrackChange({ dataset: { companyTrack: "e1" }, value: "秋インターン" });
  assert.equal(duplicate.state.entries[0].trackType, "夏インターン");
  assert.equal(duplicate.calls.some(([kind]) => kind === "update"), false);
  const h = trackHarness("cloud");
  await h.context.handleCompanyTrackChange({ dataset: { companyTrack: "e1" }, value: "秋インターン" });
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.filter(([key]) => ["id", "user_id", "updated_at"].includes(key)))), [["id", "e1"], ["user_id", "u1"], ["updated_at", "revision-1"]]);
});

test("季節変更の応答後にユーザーscopeが切り替われば古い結果を破棄する", async () => {
  const h = trackHarness("cloud");
  let resolve;
  h.context.supabaseClient.from = () => ({ update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ select: () => new Promise((done) => { resolve = done; }) }) }) }) }) });
  const pending = h.context.handleCompanyTrackChange({ dataset: { companyTrack: "e1" }, value: "秋インターン", disabled: false });
  h.invalidate();
  resolve({ data: [{ track_type: "秋インターン", updated_at: "revision-2" }] });
  await pending;
  assert.equal(h.state.entries[0].trackType, "夏インターン");
});
