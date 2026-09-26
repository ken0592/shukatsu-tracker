const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const h = vm.createContext({
  normalizeEntry: entry => ({ deadline: '', deadlineTime: '', esItems: [], ...entry }),
  normalizeEsItems: items => items || [], esItemsToLegacyText: () => ''
});
vm.runInContext(source.slice(source.indexOf('const entryMergeFields ='), source.indexOf('const quoteMonthDays =')), h);
for (const name of ['mergeEntryVersions', 'entryFieldEquals', 'cloneEntryFieldValue']) {
  const start = source.indexOf('function ' + name + '('), next = source.slice(start + 1).search(/\n(?:async )?function /);
  vm.runInContext(source.slice(start, start + next + 1), h);
}
const base = { id: 'e', deadline: '2026-09-27', deadlineTime: '12:00', memo: '元メモ', esItems: [], updatedAt: 'v1' };
test('別端末で締切日と時刻を別々に変えても、存在しなかった日時を自動合成しない', () => {
  const result = h.mergeEntryVersions(base, { ...base, deadlineTime: '23:59' }, { ...base, deadline: '2026-09-28', updatedAt: 'v2' });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, 'deadline');
  assert.equal(result.entry.deadline, '2026-09-28');
  assert.equal(result.entry.deadlineTime, '12:00');
});
test('締切変更と別端末のメモ変更はまとめ、同じ日時への変更は競合しない', () => {
  const draft = { ...base, deadlineTime: '23:59' };
  const merged = h.mergeEntryVersions(base, draft, { ...base, memo: '別端末メモ', updatedAt: 'v2' });
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.entry.deadlineTime, '23:59');
  assert.equal(merged.entry.memo, '別端末メモ');
  assert.equal(h.mergeEntryVersions(base, draft, { ...draft, updatedAt: 'v2' }).conflicts.length, 0);
});
