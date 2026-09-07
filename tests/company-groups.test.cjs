const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const model = require("../company-groups.js");
const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
const entry = (id, trackType = "インターン", extra = {}) => ({ id, companyName: "A社", trackType, memo: "残すメモ", esItems: [{ answer: "元のES" }], status: "一次面接", updatedAt: "old", ...extra });
function load(context, names) {
  vm.createContext(context);
  for (const name of names) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    const tail = source.slice(start);
    const end = tail.slice(1).search(/\n(?:async )?function /);
    vm.runInContext(tail.slice(0, end + 1), context);
  }
  return context;
}

test("同じ企業の選考は1グループにまとまり、全選考の記録を保持する", () => {
  const rows = [entry("s", "夏インターン", { companyName: "Ａ 社" }), entry("w", "冬インターン"), entry("b", "本選考", { companyName: "B社" })];
  const groups = model.group(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].entries.map((e) => e.id), ["s", "w"]);
  assert.equal(model.branches([...rows, entry("trash", "本選考", { deletedAt: "today" })], rows[0]).length, 2);
  assert.equal(rows[0].esItems[0].answer, "元のES");
});

test("新しい枝は企業情報だけを引き継ぎ、他の枝のES・メモ・進捗に触れない", () => {
  const original = entry("s", "夏インターン", { mypageUrl: "https://company.example", deadline: "2026-08-01", logoUrl: "https://company.example/icon.png" });
  const draft = model.branchDraft(original, "冬インターン", "w", "now");
  assert.equal(draft.companyName, original.companyName);
  assert.equal(draft.mypageUrl, original.mypageUrl);
  assert.equal(draft.logoUrl, original.logoUrl);
  assert.equal(draft.status, "応募予定");
  assert.equal(draft.memo, "");
  assert.equal(draft.deadline, "");
  assert.deepEqual(draft.esItems, []);
  assert.equal(original.memo, "残すメモ");
  assert.equal(model.branchDraft(original, "invalid", "x", "now"), null);
  assert.deepEqual(model.availableTracks([original, entry("trash", "冬インターン", { deletedAt: "today" })], original), ["早期選考", "本選考"]);
});

function migrationHarness(mode = "local") {
  const state = { mode, entries: [entry("a"), entry("b", "インターン", { companyName: "B社" })], session: { user: { id: "owner" } } };
  const scope = { userId: "owner" }, calls = [];
  let current = true;
  const context = { state, window: { SHUKATSU_GROUPS: model }, captureUserScope: () => scope,
    isCurrentUserScope: () => current, activeEntries: () => state.entries.filter((e) => !e.deletedAt),
    renderSummerMigration() {}, renderCompanyList() {}, render() {}, saveLocalEntries: () => true,
    fromDbEntry: (row) => row };
  const request = { update: (data) => { calls.push(["update", data]); return request; }, eq: (key, value) => { calls.push([key, value]); return request; }, select: async () => ({ data: [] }) };
  context.supabaseClient = { from: () => request };
  load(context, ["handleSummerMigration"]);
  return { context, state, calls, request, invalidate: () => { current = false; state.entries = []; state.summerMigration = null; } };
}

test("未分類の一括移動は種類だけを変え、再実行や重複でも記録を失わない", async () => {
  const h = migrationHarness();
  const originals = structuredClone(h.state.entries);
  await h.context.handleSummerMigration();
  assert.equal(h.state.summerMigration.saved, 2);
  h.state.entries.forEach((e, i) => assert.deepEqual(JSON.parse(JSON.stringify(e)), { ...originals[i], trackType: "夏インターン", updatedAt: e.updatedAt }));
  await h.context.handleSummerMigration();
  assert.equal(h.state.summerMigration.saved, 0);
  assert.equal(model.canMoveToSummer([entry("a"), entry("summer", "夏インターン")], entry("a")), false);
  const failed = migrationHarness();
  failed.context.saveLocalEntries = () => false;
  await failed.context.handleSummerMigration();
  assert.equal(failed.state.entries[0].trackType, "インターン");
  assert.match(failed.state.summerMigration.error, /保存できなかった/);
});

test("クラウド移動は所有者と更新日時で保護し、ログアウト後の応答を破棄する", async () => {
  const h = migrationHarness("cloud");
  let resolve;
  h.request.select = () => new Promise((done) => { resolve = done; });
  const work = h.context.handleSummerMigration();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [["update", { track_type: "夏インターン" }], ["id", "a"], ["user_id", "owner"], ["track_type", "インターン"], ["updated_at", "old"]]);
  h.invalidate(); resolve({ data: [entry("a", "夏インターン")] }); await work;
  assert.equal(h.state.entries.length, 0);
});

test("枝の切り替えでは未保存の変更を先に保存し、失敗時は移動しない", async () => {
  let saves = 0, closed = 0;
  const opened = [];
  const state = { detailEditingId: "a", detailBaseEntry: { esItems: [], memo: "before", interviewNotes: "" }, entries: [entry("a"), entry("b", "冬インターン")] };
  const context = { state, els: { companyDetailDialog: { open: true }, detailMemoInput: { value: "after" }, detailInterviewNotesInput: { value: "" } },
    captureUserScope: () => ({}), isCurrentUserScope: () => true, collectDetailEsItems: () => [],
    closeCompanyDetail: () => { closed++; }, openCompanyDetail: (id) => opened.push(id), isTrashed: (e) => Boolean(e.deletedAt),
    handleDetailSubmit: async () => { saves++; return false; } };
  load(context, ["prepareBranchNavigation", "switchCompanyBranch"]);
  await context.switchCompanyBranch("b");
  assert.equal(saves, 1); assert.deepEqual(opened, []); assert.equal(closed, 0);
  context.handleDetailSubmit = async () => true;
  await context.switchCompanyBranch("b");
  assert.deepEqual(opened, ["b"]);
  context.els.detailMemoInput.value = "before";
  await context.prepareBranchNavigation();
  assert.equal(closed, 1);
});
