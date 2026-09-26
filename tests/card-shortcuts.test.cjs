const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const model = require('../company-groups.js');
function harness() {
  const entries = [
    {id:'a',companyName:'A社',trackType:'夏インターン',mypageUrl:'https://example.com/a',mypageId:'A-ID',memo:'Aの本文',sortOrder:0},
    {id:'bs',companyName:'B社',trackType:'夏インターン',mypageUrl:'https://example.com/b',mypageId:'SUMMER-ID',memo:'夏の本文',sortOrder:1},
    {id:'bw',companyName:'Ｂ社',trackType:'冬インターン',mypageUrl:'https://example.com/b',mypageId:'WINTER-ID',memo:'冬の本文',sortOrder:2}
  ];
  const items = new Map([['shukatsu-tracker-entries',JSON.stringify(entries)], ['shukatsu-tracker-templates','ESの本文']]);
  const copies = [], notices = [];
  const h = {URL, companyPinStoragePrefix:'shukatsu-tracker-company-pin:', state:{mode:'cloud',session:{user:{id:'owner-A'}},entries,filter:'all'},
    window:{SHUKATSU_GROUPS:model}, localStorage:{getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)},
    els:{companyList:{innerHTML:'',querySelectorAll:()=>[]}}, isTrashed:e=>Boolean(e.deletedAt),
    companyIconMarkup:()=>'',trackTag:t=>t,companyStatusPicker:()=>'',showToast:t=>notices.push(t),
    captureUserScope:()=>({userId:h.state.session?.user.id}),isCurrentUserScope:s=>s.userId===h.state.session?.user.id,
    copyTextToClipboard:async value=>{copies.push(value);return true;}};
  vm.createContext(h);
  for(const name of ['escapeHtml','escapeAttribute','normalizeExternalUrl','companyPinStorageKey','isCompanyPinned','toggleCompanyPin','copyCompanyMypageId','companyMypageLinks','renderCompanyGroups']) {
    const start=source.search(new RegExp('(?:async )?function '+name+'\\(')),tail=source.slice(start),end=tail.slice(1).search(/\n(?:async )?function /);
    assert.ok(start>=0,name);vm.runInContext(end<0?tail:tail.slice(0,end+1),h);
  }
  h.renderCompanyList=()=>h.renderCompanyGroups(entries);
  return {h,entries,items,copies,notices};
}
test('固定で企業単位の表示順だけ変わり、夏冬・ES・保存済みの順序を変更しない',()=>{
  const x=harness(),before=JSON.stringify(x.entries),stored=[...x.items];
  x.h.toggleCompanyPin('bw');
  assert.equal(x.h.isCompanyPinned(x.entries[1]),true);
  assert.ok(x.h.els.companyList.innerHTML.indexOf('data-company-id="bs"')<x.h.els.companyList.innerHTML.indexOf('data-company-id="a"'));
  x.h.renderCompanyGroups([x.entries[2]]); assert.ok(x.h.els.companyList.innerHTML.includes('is-pinned'));
  x.h.toggleCompanyPin('bs');
  assert.equal(x.h.isCompanyPinned(x.entries[2]),false);
  assert.equal(JSON.stringify(x.entries),before); assert.deepEqual([...x.items],stored);
});
test('固定は利用者ごとに分かれ、保存失敗や削除済みの企業では変更しない',()=>{
  const x=harness();x.h.toggleCompanyPin('a');
  x.h.state.session={user:{id:'owner-B'}};assert.equal(x.h.isCompanyPinned(x.entries[0]),false);
  x.h.localStorage.setItem=()=>{throw Error('quota');};x.h.toggleCompanyPin('a');assert.equal(x.h.isCompanyPinned(x.entries[0]),false);
  x.h.state.session=null;assert.equal(x.h.companyPinStorageKey(x.entries[0]),null);
  x.h.state.session={user:{id:'owner-A'}};assert.equal(x.h.isCompanyPinned(x.entries[0]),true);
  const before=[...x.items];x.entries[0].deletedAt='trash';x.h.toggleCompanyPin('a');assert.deepEqual([...x.items],before);
});
test('共通URLでも違うIDのコピー先を分け、同じIDならボタンをまとめる',()=>{
  const x=harness();const html=x.h.companyMypageLinks(x.entries.slice(1));
  assert.equal((html.match(/<a /g)||[]).length,1);
  assert.ok(html.includes('data-copy-mypage-id="bs"')); assert.ok(html.includes('data-copy-mypage-id="bw"'));
  assert.ok(html.includes('夏ID'));assert.ok(html.includes('冬ID'));assert.ok(!html.includes('SUMMER-ID'));
  assert.equal((x.h.companyMypageLinks([{...x.entries[1]},{...x.entries[2],mypageId:'SUMMER-ID'}]).match(/data-copy-mypage-id=/g)||[]).length,1);
  assert.equal(x.h.companyMypageLinks([{...x.entries[0],mypageId:'',mypageUrl:'javascript:alert(1)'}]),'');
  assert.ok(x.h.companyMypageLinks([{...x.entries[0],mypageUrl:''}]).includes('data-copy-mypage-id="a"'));
});
test('押した選考のIDだけコピーし、保存内容と別アカウントの表示を変えない',async()=>{
  const x=harness(),before=JSON.stringify(x.entries);
  await x.h.copyCompanyMypageId('bw');assert.deepEqual(x.copies,['WINTER-ID']);assert.equal(JSON.stringify(x.entries),before);
  x.entries[2].deletedAt='trash';await x.h.copyCompanyMypageId('bw');assert.equal(x.copies.length,1);
  x.h.copyTextToClipboard=async()=>{x.h.state.session=null;return true;};
  const count=x.notices.length;await x.h.copyCompanyMypageId('a');assert.equal(x.notices.length,count);
});