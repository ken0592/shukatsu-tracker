const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../company-pins.js');

const entry = (companyName, id = companyName) => ({ companyName, id });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function makeCloud() {
  const rows = new Map();
  return {
    rows,
    read: async owner => [...rows.values()].filter(row => row.user_id === owner).map(row => ({ ...row })),
    seed: async seeds => { for (const row of seeds) if (!rows.has(`${row.user_id}:${row.company_key}`)) rows.set(`${row.user_id}:${row.company_key}`, { ...row }); },
    write: async row => { const saved = { ...row }; rows.set(`${row.user_id}:${row.company_key}`, saved); return saved; }
  };
}
function store(cloud, storage = memoryStorage(), extras = {}) {
  return createStore({ storage, ...cloud, keyOf: e => e.companyName.normalize('NFKC').toLowerCase().replace(/[\s　]+/gu, ''), ...extras });
}

test('pins sync across stores and an explicit unpin remains a cloud tombstone', async () => {
  const cloud = makeCloud(), first = store(cloud), second = store(cloud);
  first.setScope('u1', 1); second.setScope('u1', 1);
  assert.equal(await first.refresh([entry('A社')]), true);
  assert.equal(await second.refresh([entry('A社')]), true);
  assert.equal(await first.toggle('a社', []), true);
  assert.equal(first.isPinned('a社'), true);
  assert.equal(await second.refresh([entry('A社')]), true);
  assert.equal(second.isPinned('a社'), true);
  assert.equal(await second.toggle('a社'), true);
  assert.equal(cloud.rows.get('u1:a社').pinned, false);
  const third = store(cloud); third.setScope('u1', 1);
  assert.equal(await third.refresh([entry('A社')]), true);
  assert.equal(third.isPinned('a社'), false);
});

test('legacy positive pins seed missing cloud rows but cannot override an unpin', async () => {
  const cloud = makeCloud();
  cloud.rows.set('u1:a社', { user_id: 'u1', company_key: 'a社', pinned: false });
  cloud.rows.set('u1:b社', { user_id: 'u1', company_key: 'b社', pinned: true });
  const storage = memoryStorage({
    ['shukatsu-tracker-company-pin:' + JSON.stringify(['u1', 'a社'])]: '1',
    ['shukatsu-tracker-company-pin:' + JSON.stringify(['u1', 'b社'])]: '1',
    ['shukatsu-tracker-company-pin:' + JSON.stringify(['u1', 'c社'])]: '1'
  });
  const pins = store(cloud, storage); pins.setScope('u1', 1);
  assert.equal(pins.isPinned('a社'), true); // legacy display while the first read is pending
  assert.equal(await pins.refresh([entry('A社'), entry('B社'), { ...entry('Ｃ 社'), deletedAt: 'yesterday' }]), true);
  assert.equal(pins.isPinned('a社'), false);
  assert.equal(pins.isPinned('b社'), true);
  assert.equal(pins.isPinned('c社'), true);
  assert.equal(cloud.rows.get('u1:c社').pinned, true);
  assert.equal(storage.values.size, 0);
});

test('unconfirmed legacy keys are kept when cloud seeding fails', async () => {
  const storage = memoryStorage({ ['shukatsu-tracker-company-pin:' + JSON.stringify(['u1', 'a社'])]: '1' });
  const pins = store({ read: async () => [], seed: async () => { throw Error('offline'); }, write: async row => row }, storage);
  pins.setScope('u1', 1);
  assert.equal(await pins.refresh([entry('A社')]), false);
  assert.equal(storage.values.size, 1);
  assert.equal(pins.isPinned('a社'), true);
});

test('cloud operation works when local storage is inaccessible', async () => {
  const cloud = makeCloud();
  const storage = { getItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  const pins = store(cloud, storage); pins.setScope('u1', 1);
  assert.equal(await pins.refresh([entry('A社')]), true);
  assert.equal(await pins.toggle('a社'), true);
  assert.equal(pins.isPinned('a社'), true);
});

test('an initial toggle waits for cloud load, and setting the same scope again preserves it', async () => {
  const cloud = makeCloud(), pins = store(cloud);
  pins.setScope('u1', 1);
  const toggle = pins.toggle('a社', [entry('A社')]);
  assert.equal(pins.isPending('a社'), true);
  assert.equal(await toggle, true);
  pins.setScope('u1', 1);
  assert.equal(pins.isPinned('a社'), true);
});

test('an initial load failure permits another click to retry, and malformed writes fail', async () => {
  let readCount = 0;
  const cloud = makeCloud();
  const pins = store({ ...cloud, read: async owner => {
    readCount++;
    if (readCount === 1) throw Error('offline');
    return cloud.read(owner);
  }, write: async row => ({ ...row, company_key: 'wrong' }) });
  pins.setScope('u1', 1);
  assert.equal(await pins.toggle('a社', [entry('A社')]), false);
  assert.equal(pins.isPending('a社'), false);
  assert.equal(await pins.toggle('a社', [entry('A社')]), false);
  assert.equal(pins.isPinned('a社'), false);
});

test('pending key blocks repeated toggles and concurrent refreshes', async () => {
  const cloud = makeCloud();
  let finishWrite;
  const writing = store({ ...cloud, write: row => new Promise(resolve => { finishWrite = () => cloud.write(row).then(resolve); }) });
  writing.setScope('u1', 1); await writing.refresh([]);
  const toggle = writing.toggle('a社');
  assert.equal(writing.isPending('a社'), true);
  assert.equal(await writing.toggle('a社'), false);
  assert.equal(await writing.refresh([]), false);
  finishWrite();
  assert.equal(await toggle, true);
  assert.equal(writing.isPending('a社'), false);
});

test('a background read started before a toggle is discarded even before its write finishes', async () => {
  const cloud = makeCloud(), snapshot = deferred(), writeGate = deferred();
  let calls = 0;
  const racing = store({ ...cloud, read: async owner => {
    calls += 1;
    if (calls === 1) return cloud.read(owner);
    return snapshot.promise;
  }, write: async row => { await writeGate.promise; return cloud.write(row); } });
  racing.setScope('u1', 1); await racing.refresh([]);
  const oldRefresh = racing.refresh([]);
  const writing = racing.toggle('a社');
  snapshot.resolve([]);
  assert.equal(await oldRefresh, false);
  writeGate.resolve();
  assert.equal(await writing, true);
  assert.equal(racing.isPinned('a社'), true);
});

test('repeated polling reports the same refresh failure once until a refresh succeeds', async () => {
  let failures = 0, shouldFail = true;
  const cloud = makeCloud();
  const pins = store({ ...cloud, read: async () => {
    if (shouldFail) throw Error('offline');
    return [];
  } }, memoryStorage(), { onError: () => failures++ });
  pins.setScope('u1', 1);
  assert.equal(await pins.refresh([]), false);
  assert.equal(await pins.refresh([]), false);
  assert.equal(failures, 1);
  shouldFail = false;
  assert.equal(await pins.refresh([]), true);
  shouldFail = true;
  assert.equal(await pins.refresh([]), false);
  assert.equal(failures, 2);
});

test('stale reads and writes from an old scope cannot alter a new scope', async () => {
  const gate = deferred(), cloud = makeCloud();
  const pins = store({ ...cloud, read: owner => owner === 'old' ? gate.promise : cloud.read(owner) });
  pins.setScope('old', 1);
  const oldRefresh = pins.refresh([entry('A社')]);
  pins.setScope('new', 2);
  assert.equal(await pins.refresh([entry('A社')]), true);
  gate.resolve([{ company_key: 'a社', pinned: true }]);
  assert.equal(await oldRefresh, false);
  assert.equal(pins.isPinned('a社'), false);

  const writeGate = deferred();
  const changing = store({ ...cloud, write: async row => { await writeGate.promise; return row; } });
  changing.setScope('old', 1); await changing.refresh([]);
  const oldToggle = changing.toggle('a社');
  changing.setScope('new', 2);
  writeGate.resolve();
  assert.equal(await oldToggle, false);
  assert.equal(changing.isPinned('a社'), false);
});

