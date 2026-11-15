const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const model = require('../company-groups.js');
const { createStore } = require('../company-pins.js');

const sampleEntries = () => [
  { id: 'a', companyName: 'A社', trackType: '夏インターン', mypageUrl: 'https://example.com/a', mypageId: 'A-ID', memo: 'Aの本文', sortOrder: 0 },
  { id: 'bs', companyName: 'B社', trackType: '夏インターン', mypageUrl: 'https://example.com/b', mypageId: 'SUMMER-ID', memo: '夏の本文', sortOrder: 1 },
  { id: 'bw', companyName: 'Ｂ社', trackType: '冬インターン', mypageUrl: 'https://example.com/b', mypageId: 'WINTER-ID', memo: '冬の本文', sortOrder: 2 }
];

function harness(mode = 'local') {
  const entries = sampleEntries();
  const items = new Map([['shukatsu-tracker-entries', JSON.stringify(entries)], ['shukatsu-tracker-templates', 'ESの本文']]);
  const copies = [], notices = [];
  const h = {
    URL,
    companyPinStoragePrefix: 'shukatsu-tracker-company-pin:',
    state: { mode, session: { user: { id: 'owner-A' } }, userScopeVersion: 0, entries, filter: 'all' },
    window: { SHUKATSU_GROUPS: model },
    localStorage: { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) },
    els: { companyList: { innerHTML: '', querySelectorAll: () => [] } },
    isTrashed: entry => Boolean(entry.deletedAt),
    companyIconMarkup: () => '', trackTag: track => track, companyStatusPicker: () => '', showToast: text => notices.push(text),
    companyPins: { isPending: () => false },
    captureUserScope: () => ({ userId: h.state.session?.user.id || '', version: h.state.userScopeVersion }),
    isCurrentUserScope: scope => scope.userId === (h.state.session?.user.id || '') && scope.version === h.state.userScopeVersion,
    copyTextToClipboard: async value => { copies.push(value); return true; }
  };
  vm.createContext(h);
  for (const name of ['escapeHtml', 'escapeAttribute', 'normalizeExternalUrl', 'companyPinStorageKey', 'isCompanyPinned', 'toggleCompanyPin', 'copyCompanyMypageId', 'companyMypageLinks', 'renderCompanyGroups', 'refreshCompanyPins']) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    const tail = source.slice(start);
    const end = tail.slice(1).search(/\n(?:async )?function /);
    assert.ok(start >= 0, name);
    vm.runInContext(end < 0 ? tail : tail.slice(0, end + 1), h);
  }
  h.renderCompanyList = () => h.renderCompanyGroups(entries);
  return { h, entries, items, copies, notices };
}

function cloudHarness(remote, options = {}) {
  const result = harness('cloud');
  const { h, items, notices } = result;
  h.companyPins = createStore({
    storage: () => h.localStorage,
    keyOf: model.key,
    read: async owner => [...remote.values()].filter(row => row.user_id === owner).map(row => ({ company_key: row.company_key, pinned: row.pinned })),
    seed: async rows => rows.forEach(row => {
      const key = `${row.user_id}:${row.company_key}`;
      if (!remote.has(key)) remote.set(key, structuredClone(row));
    }),
    write: async row => {
      if (options.writeError) throw options.writeError;
      remote.set(`${row.user_id}:${row.company_key}`, structuredClone(row));
      return { company_key: row.company_key, pinned: row.pinned };
    },
    onChange: () => h.renderCompanyList?.(),
    onError: error => notices.push(error.message)
  });
  return result;
}

test('固定で企業単位の表示順だけ変わり、夏冬・ES・保存済みの順序を変更しない', async () => {
  const { h, entries, items } = harness();
  const before = JSON.stringify(entries), stored = [...items];
  await h.toggleCompanyPin('bw');
  assert.equal(h.isCompanyPinned(entries[1]), true);
  assert.ok(h.els.companyList.innerHTML.indexOf('data-company-id="bs"') < h.els.companyList.innerHTML.indexOf('data-company-id="a"'));
  h.renderCompanyGroups([entries[2]]);
  assert.ok(h.els.companyList.innerHTML.includes('is-pinned'));
  await h.toggleCompanyPin('bs');
  assert.equal(h.isCompanyPinned(entries[2]), false);
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual([...items], stored);
});

test('クラウドの固定は同じアカウントの端末間で共有し、端末保存に依存しない', async () => {
  const remote = new Map();
  const first = cloudHarness(remote), second = cloudHarness(remote);
  const { h, entries, items } = first;
  const before = JSON.stringify(entries);
  await h.refreshCompanyPins();
  const localSnapshot = [...items];
  h.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  await h.toggleCompanyPin('bw');
  assert.equal(remote.get('owner-A:b社').pinned, true);
  assert.equal(h.isCompanyPinned(entries[1]), true);
  assert.ok(h.els.companyList.innerHTML.includes('is-pinned'));
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual([...items], localSnapshot);

  await second.h.refreshCompanyPins();
  assert.equal(second.h.isCompanyPinned(second.entries[1]), true);
  second.h.state.session = { user: { id: 'owner-B' } };
  second.h.state.userScopeVersion++;
  await second.h.refreshCompanyPins();
  assert.equal(second.h.isCompanyPinned(second.entries[1]), false);
  assert.equal(remote.get('owner-A:b社').pinned, true);
  second.h.state.session = null;
  assert.equal(second.h.companyPinStorageKey(second.entries[0]), null);
});

test('同期失敗は表示状態を変えず、端末保存の失敗と削除済みカードを守る', async () => {
  const remote = new Map();
  const cloud = cloudHarness(remote, { writeError: new Error('offline') });
  await cloud.h.refreshCompanyPins();
  await cloud.h.toggleCompanyPin('a');
  assert.equal(cloud.h.isCompanyPinned(cloud.entries[0]), false);
  assert.equal(remote.size, 0);

  const local = harness();
  local.h.localStorage.setItem = () => { throw new Error('quota'); };
  await local.h.toggleCompanyPin('a');
  assert.equal(local.h.isCompanyPinned(local.entries[0]), false);
  local.entries[0].deletedAt = 'trash';
  const before = [...local.items];
  await local.h.toggleCompanyPin('a');
  assert.deepEqual([...local.items], before);
});

test('共通URLでも違うIDのコピー先を分け、同じIDならボタンをまとめる', () => {
  const { h, entries } = harness();
  const html = h.companyMypageLinks(entries.slice(1));
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.ok(html.includes('data-copy-mypage-id="bs"'));
  assert.ok(html.includes('data-copy-mypage-id="bw"'));
  assert.ok(html.includes('夏ID'));
  assert.ok(html.includes('冬ID'));
  assert.ok(!html.includes('SUMMER-ID'));
  assert.equal((h.companyMypageLinks([{ ...entries[1] }, { ...entries[2], mypageId: 'SUMMER-ID' }]).match(/data-copy-mypage-id=/g) || []).length, 1);
  assert.equal(h.companyMypageLinks([{ ...entries[0], mypageId: '', mypageUrl: 'javascript:alert(1)' }]), '');
  assert.ok(h.companyMypageLinks([{ ...entries[0], mypageUrl: '' }]).includes('data-copy-mypage-id="a"'));
});

test('押した選考のIDだけコピーし、保存内容と別アカウントの表示を変えない', async () => {
  const { h, entries, copies, notices } = harness();
  const before = JSON.stringify(entries);
  await h.copyCompanyMypageId('bw');
  assert.deepEqual(copies, ['WINTER-ID']);
  assert.equal(JSON.stringify(entries), before);
  entries[2].deletedAt = 'trash';
  await h.copyCompanyMypageId('bw');
  assert.equal(copies.length, 1);
  h.copyTextToClipboard = async () => { h.state.session = null; return true; };
  const count = notices.length;
  await h.copyCompanyMypageId('a');
  assert.equal(notices.length, count);
});
