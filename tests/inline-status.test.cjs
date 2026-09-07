const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const original = { id: 'summer', companyName: 'A社', trackType: '夏インターン', status: '気になる', memo: '残すメモ', esItems: [{ answer: '元の回答' }], updatedAt: 'v1' };
function harness(mode = 'local') {
  const entry = structuredClone(original), messages = [], writes = [], calls = [];
  const control = { dataset: { companyStatus: entry.id }, value: '選考中', disabled: false, closest: () => ({ setAttribute() {} }) };
  const scope = { userId: 'owner' };
  let current = true, renders = 0;
  const state = { mode, entries: [entry, { ...entry, id: 'winter', trackType: '冬インターン' }], pendingStatusChanges: new Set() };
  const h = { state, simpleStatuses: ['気になる', '応募済み', '選考中', '採用', '不採用'], activeStatuses: ['気になる', '応募済み', '選考中'], finishedStatuses: ['採用', '不採用'], document: { activeElement: control, body: {} },
    els: { companyList: { querySelectorAll: () => [] } },
    isTrashed: e => Boolean(e.deletedAt), captureUserScope: () => scope, isCurrentUserScope: () => current,
    showToast: s => messages.push(s), render: () => { renders++; control.disabled = false; control.value = state.entries.find(e => e.id === entry.id)?.status; },
    saveLocalEntries: rows => { writes.push(rows); return true; }, fromDbEntry: row => row,
    fetchCloudEntry: async () => ({ ...entry, status: '応募済み', memo: '別端末のメモ', updatedAt: 'v2' }) };
  const request = { update: data => { calls.push(['update', data]); return request; }, eq: (key, value) => { calls.push([key, value]); return request; },
    select: async () => ({ data: [{ ...entry, status: control.value, updatedAt: 'v2' }] }) };
  h.supabaseClient = { from: () => request };
  vm.createContext(h);
  const simpleStart = source.indexOf('function simpleStatus(');
  vm.runInContext(source.slice(simpleStart, source.indexOf('\nfunction statusTag(', simpleStart)), h);
  const start = source.indexOf('async function handleCompanyStatusChange(');
  const end = source.indexOf('\nfunction renderDetailBranches(', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end), h);
  return { h, state, control, calls, writes, messages, request, entry, renders: () => renders, invalidate: () => { current = false; state.entries = []; state.pendingStatusChanges = new Set(); } };
}
const plain = value => JSON.parse(JSON.stringify(value));
test('カードの進捗変更は対象の選考だけ保存し、ES・メモと他の選考を保持する', async () => {
  const x = harness();
  await x.h.handleCompanyStatusChange(x.control);
  assert.equal(x.state.entries[0].status, '選考中');
  assert.equal(x.state.entries[0].memo, original.memo);
  assert.deepEqual(plain(x.state.entries[0].esItems), original.esItems);
  assert.equal(x.state.entries[1].status, '気になる');
  assert.equal(x.writes.length, 1);
  assert.equal(x.state.pendingStatusChanges.size, 0);
});
test('未変更・不正な値・端末保存失敗で元の進捗を失わない', async () => {
  for (const status of ['気になる', 'invalid']) {
    const x = harness(); x.control.value = status;
    await x.h.handleCompanyStatusChange(x.control);
    assert.equal(x.writes.length, 0); assert.equal(x.control.value, '気になる');
  }
  const x = harness(); x.h.saveLocalEntries = () => false;
  await x.h.handleCompanyStatusChange(x.control);
  assert.equal(x.state.entries[0].status, '気になる');
  assert.equal(x.control.value, '気になる'); assert.equal(x.control.disabled, false);
});
test('クラウドでは進捗だけを所有者・更新日時で保護して保存し、二重送信しない', async () => {
  const x = harness('cloud'); let resolve;
  x.request.select = () => new Promise(done => { resolve = done; });
  const work = x.h.handleCompanyStatusChange(x.control);
  await x.h.handleCompanyStatusChange(x.control);
  assert.deepEqual(plain(x.calls), [['update', { status: '選考中' }], ['id', 'summer'], ['user_id', 'owner'], ['updated_at', 'v1']]);
  assert.equal(x.control.disabled, true);
  resolve({ data: [{ ...original, status: '選考中', updatedAt: 'v2' }] }); await work;
  assert.equal(x.state.entries[0].status, '選考中');
  assert.equal(x.state.entries[0].memo, original.memo);
  assert.equal(x.state.pendingStatusChanges.size, 0);
});
test('通信失敗・競合・ログアウト・途中の更新で古い応答を上書きしない', async () => {
  const failed = harness('cloud'); failed.request.select = async () => { throw new Error('offline'); };
  await failed.h.handleCompanyStatusChange(failed.control);
  assert.equal(failed.state.entries[0].status, '気になる');
  assert.equal(failed.control.disabled, false); assert.match(failed.messages[0], /保存できません/);
  const conflict = harness('cloud'); conflict.request.select = async () => ({ data: [] });
  await conflict.h.handleCompanyStatusChange(conflict.control);
  assert.equal(conflict.state.entries[0].status, '応募済み');
  assert.equal(conflict.state.entries[0].memo, '別端末のメモ'); assert.match(conflict.messages[0], /保存していません/);
  for (const signOut of [true, false]) {
    const x = harness('cloud'); let resolve;
    x.request.select = () => new Promise(done => { resolve = done; });
    const work = x.h.handleCompanyStatusChange(x.control);
    if (signOut) x.invalidate();
    else x.state.entries[0] = { ...original, status: '採用', updatedAt: 'v3' };
    resolve({ data: [{ ...original, status: '選考中', updatedAt: 'v2' }] }); await work;
    if (signOut) { assert.equal(x.state.entries.length, 0); assert.equal(x.renders(), 0); assert.equal(x.messages.length, 0); }
    else assert.equal(x.state.entries[0].status, '採用');
  }
});

test('旧進捗は5つの表示にまとめ、選択肢・編集フォーム・結果フィルターを揃える', () => {
  const x = harness();
  for (const name of ['companyStatusPicker', 'isActive', 'isFinished']) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), x.h);
  }
  x.h.escapeHtml = x.h.escapeAttribute = s => s;
  x.h.statusTag = s => x.h.simpleStatus(s);
  const groups = {
    '気になる': ['気になる', '応募予定'],
    '応募済み': ['応募済み', 'ES提出済み'],
    '選考中': ['選考中', '一次面接', '二次面接', '最終面接', 'Webテスト', '結果待ち', '選考通過'],
    '採用': ['採用', '内定', 'インターン選考通過', 'インターン参加決定', '参加済み'],
    '不採用': ['不採用', '落選', '辞退']
  };
  for (const [expected, legacy] of Object.entries(groups)) for (const status of legacy) {
    const entry = { ...original, status };
    assert.equal(x.h.simpleStatus(status), expected);
    const html = x.h.companyStatusPicker(entry);
    assert.equal((html.match(/<option /g) || []).length, 5);
    assert.ok(html.includes(`value="${expected}" selected`));
    assert.equal(x.h.isFinished(entry), ['採用', '不採用'].includes(expected));
    assert.equal(x.h.isActive(entry), !x.h.isFinished(entry));
    assert.equal(entry.status, status);
  }
  const expected = Object.keys(groups);
  const values = JSON.parse(source.match(/const simpleStatuses = (\[[^\n]+\]);/)[1]);
  assert.deepEqual(values, expected);
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const select = html.match(/<select id="statusInput"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual(Array.from(select.matchAll(/<option>(.*?)<\/option>/g), m => m[1]), expected);
});

test('新しい5つの進捗がAI・CSVの取り込みでも失われない', () => {
  const ai = require('../ai.js'), csv = require('../csv-import.js');
  for (const status of ['気になる', '応募済み', '選考中', '採用', '不採用']) {
    assert.equal(ai.sanitizeCards([{ companyName: 'A社', status }])[0].status, status);
    assert.equal(csv.importCsv(`企業名,ステータス\nA社,${status}`).cards[0].status, status);
  }
});
