const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function load(context, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const tail = source.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /);
  assert.ok(start >= 0 && end > 0);
  vm.runInContext(tail.slice(0, end + 1), context);
}
test('画面から外した業種・予定・面接メモは基本編集や詳細保存で消えない', async () => {
  const original = { id: 'a', companyName: '検証A社', industry: '旧業種', eventDate: '2026-10-01', eventType: '面接', interviewNotes: '保存済みの面接メモ', memo: '元のメモ', priority: '中', trackType: '夏インターン', status: '気になる', esItems: [], esContent: '', updatedAt: 'v1', createdAt: 'v0' };
  const values = { companyName: '検証A社', trackType: '夏インターン', status: '気になる', deadline: '', priority: '最優先', mypageId: '', officialUrl: '', logoUrl: '', mypageUrl: '', esContent: '', memo: '編集したメモ' };
  const state = { entries: [original], editingId: 'a', editingBaseEntry: original, entryDraft: null, mode: 'local', detailEditingId: 'a', detailBaseEntry: original };
  const context = vm.createContext({ state, FormData: class { get(name) { return values[name] ?? null; } },
    els: { entryForm: {}, entryDialog: { close() {} }, detailMemoInput: { value: '詳細のメモ' } },
    normalizeEntry: e => ({ ...e }), entryEsText: e => e.esContent, normalizeEsItems: () => [], esItemsToLegacyText: () => '',
    aiImportIdentityKey: e => e.companyName + e.trackType, nextCompanySortOrder: () => 0, getEntryCelebration: () => null, updateEntrySaveButton() {}, updateDetailSaveButton() {},
    saveLocalEntries: () => true, resetEntryForm() {}, closeCompanyDetail() {}, render() {}, showToast() {}, collectDetailEsItems: () => [] });
  load(context, 'handleEntrySubmit'); load(context, 'handleDetailSubmit');
  await context.handleEntrySubmit({ preventDefault() {} });
  assert.equal(state.entries[0].priority, '最優先');
  assert.equal(state.entries[0].memo, '編集したメモ');
  for (const field of ['industry', 'eventDate', 'eventType', 'interviewNotes']) assert.equal(state.entries[0][field], original[field]);
  state.detailBaseEntry = state.entries[0];
  await context.handleDetailSubmit({ preventDefault() {} });
  assert.equal(state.entries[0].memo, '詳細のメモ');
  for (const field of ['industry', 'eventDate', 'eventType', 'interviewNotes']) assert.equal(state.entries[0][field], original[field]);
});
test('志望度4段階はAI・CSVと優先順位の並びで維持される', () => {
  const ai = require('../ai.js'), csv = require('../csv-import.js');
  const context = vm.createContext({}); load(context, 'priorityScore');
  for (const [i, priority] of ['最優先', '高', '中', '低'].entries()) {
    assert.equal(ai.sanitizeCards([{ companyName: 'A社', priority }])[0].priority, priority);
    assert.equal(csv.importCsv(`企業名,志望度\nA社,${priority}`).cards[0].priority, priority);
    assert.equal(context.priorityScore(priority), i);
  }
  assert.equal(csv.importCsv('企業名,志望度\nA社,第一志望').cards[0].priority, '最優先');
  assert.equal(context.priorityScore('未定'), 4);
});
