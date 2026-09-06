const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ai = require("../ai.js");
const csv = require("../csv-import.js");
const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
const types = ["夏インターン", "冬インターン", "インターン", "早期選考", "本選考"];
function appHelpers() {
  const context = { state: { entries: types.map((trackType, id) => ({ id, companyName: "A社", trackType })), filter: "all" },
    trashFilterValue: "trash", isTrashed: (e) => Boolean(e.deletedAt), isActive: () => true, isFinished: () => false,
    matchesSearchQuery: () => true, matchesIndustryFilter: () => true, matchesDeadlineFilter: () => true, matchesPriorityFilter: () => true,
    escapeHtml: (s) => s, escapeAttribute: (s) => s, normalizeCompanyName: (s) => s,
    els: { detailHandoffSection: {}, detailHandoffMessage: {}, detailHandoffActions: {} } };
  context.activeEntries = () => context.state.entries.filter((e) => !e.deletedAt);
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf("const trackTypeHints ="), app.indexOf("const entryMergeFields =")), context);
  for (const name of ["matchesListFilter", "matchesStandaloneListFilter", "countEntriesForListFilter", "renderDetailHandoff", "trackTag", "detectAiBlockTrack", "stripAiTrackSuffix"]) {
    const tail = app.slice(app.indexOf(`function ${name}(`));
    const end = tail.slice(1).search(/\n(?:async )?function /);
    vm.runInContext(tail.slice(0, end + 1), context);
  }
  return context;
}

test("種類ごとの表示と件数が一致し、ゴミ箱のカードが混ざらない", () => {
  const h = appHelpers();
  h.state.entries.push({ trackType: "夏インターン", deletedAt: "2026-09-06" });
  for (const type of types) {
    h.state.filter = type;
    assert.equal(h.state.entries.filter(h.matchesListFilter).length, 1);
    assert.equal(h.countEntriesForListFilter(type), 1);
    assert.match(h.trackTag(type), new RegExp(type === "インターン" ? "未分類インターン" : type));
  }
  assert.equal(h.countEntriesForListFilter("all"), 5);
  assert.equal(h.countEntriesForListFilter("trash"), 1);
  h.matchesSearchQuery = () => false;
  assert.equal(h.countEntriesForListFilter("夏インターン"), 0);
});

test("夏・冬からも記録を残して早期選考・本選考へ引き継げる", () => {
  const h = appHelpers();
  h.state.entries = [];
  for (const type of ["夏インターン", "冬インターン"]) {
    h.renderDetailHandoff({ id: "source", companyName: "A社", trackType: type });
    assert.equal(h.els.detailHandoffSection.hidden, false);
    assert.match(h.els.detailHandoffActions.innerHTML, /早期選考へ引き継ぐ/);
    assert.match(h.els.detailHandoffActions.innerHTML, /本選考へ引き継ぐ/);
  }
});

test("CSVの夏冬を別カードとして保持し、予定の種類はインターンのまま", () => {
  const result = csv.importCsv("企業名,選考区分,予定種別\nA社,サマーインターン,夏インターン\nA社,冬季インターン,冬インターン\nA社,インターン,インターン");
  assert.deepEqual(result.cards.map((c) => c.trackType), ["夏インターン", "冬インターン", "インターン"]);
  assert.equal(new Set(result.cards.map(csv.cardIdentityKey)).size, 3);
  assert.ok(result.cards.every((c) => c.eventType === "インターン"));
  assert.equal(csv.normalizeTrackType("summer internship"), "夏インターン");
  assert.equal(csv.normalizeTrackType("winter internship"), "冬インターン");
});

test("AI取り込みでも夏冬のカードとマイページIDを混同しない", () => {
  const text = "株式会社テスト（夏インターン）\nマイページID: SUMMER-ID\n\n株式会社テスト（冬インターン）\nマイページID: WINTER-ID";
  const result = ai.extractLocalCredentialRecords(ai.deriveMemoBlocks(text));
  assert.deepEqual(result.records.map((r) => [r.trackType, r.mypageId]), [["夏インターン", "SUMMER-ID"], ["冬インターン", "WINTER-ID"]]);
  const cards = ai.mergeCardsByCompanyAndTrack(ai.sanitizeCards(types.map((trackType) => ({ companyName: "A社", trackType }))));
  assert.equal(cards.length, 5);
  const h = appHelpers();
  assert.equal(h.stripAiTrackSuffix("A社（サマーインターン）"), "A社");
  assert.equal(h.detectAiBlockTrack("A社（冬季インターン）"), "冬インターン");
  assert.equal(h.detectAiBlockTrack("インターン 締切2026年8月1日"), "インターン");
});
