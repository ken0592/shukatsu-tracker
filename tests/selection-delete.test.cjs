const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const model=require('../company-groups.js'),source=fs.readFileSync(require.resolve('../app.js'),'utf8');
function load(h,names){vm.createContext(h);for(const name of names){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));const tail=source.slice(start),end=tail.slice(1).search(/\n(?:async )?function /);assert.ok(start>=0&&end>0,name);vm.runInContext(tail.slice(0,end+1),h);}return h;}
const plain=v=>JSON.parse(JSON.stringify(v));
function harness(mode='local'){
 const rows=['summer','winter','other'].map((id,i)=>({id,companyName:i===2?'別会社':'A社',trackType:i===1?'冬インターン':'夏インターン',memo:id+'のメモ',esItems:[{question:'設問',variants:[{answer:id+'の回答'}]}],esContent:id+'のES',mypageId:id+'のID',logoUrl:'https://example.com/icon.png',status:'選考中',deletedAt:'',updatedAt:'v1'}));
 const writes=[],calls=[],messages=[],scope={userId:'owner'};let current=true,confirm=true,closed=0;
 const state={mode,entries:rows,pendingSelectionChanges:new Set(),pendingStatusChanges:new Set(),templates:[{body:'共通の型'}]};
 const h={state,isTrashed:e=>Boolean(e.deletedAt),captureUserScope:()=>scope,isCurrentUserScope:()=>current,canUseCloudTrash:()=>true,saveLocalEntries:next=>{writes.push(plain(next));return true;},fromDbEntry:r=>r,showToast:m=>messages.push(m),render(){},updateSelectionDeleteControls(){},confirmSelectionDelete:async()=>confirm,hasUnsavedSelectionDetails:()=>false,resetEntryForm(){},closeCompanyDetail(){closed++;},els:{entryDialog:{close(){closed++;}}}};
 const req={update:p=>{calls.push(['update',p]);return req;},eq:(k,v)=>{calls.push([k,v]);return req;},select:async()=>({data:[{...rows[1],deletedAt:'trash-date',updatedAt:'v2'}]})};
 h.supabaseClient={from:name=>{assert.equal(name,'entries');return req;}};
 load(h,['selectionLabel','handleDeleteEntry','handleRestoreEntry','setSelectionTrashed']);
 return {h,state,rows,writes,calls,messages,scope,req,closed:()=>closed,cancel:()=>{confirm=false;},invalidate:()=>{current=false;state.entries=[];state.pendingSelectionChanges=new Set();}};
}

test('冬だけを削除・復元し、夏・別企業・共通の型と全保存内容を保持する',async()=>{
 const x=harness(),before=structuredClone(x.state);
 await x.h.handleDeleteEntry('winter');
 assert.ok(x.state.entries[1].deletedAt);
 assert.equal(x.state.entries[0],x.rows[0]);assert.equal(x.state.entries[2],x.rows[2]);
 for(const key of Object.keys(x.rows[1]).filter(k=>!['deletedAt','updatedAt'].includes(k)))assert.deepEqual(plain(x.state.entries[1][key]),plain(x.rows[1][key]));
 assert.deepEqual(x.state.templates,before.templates);
 assert.equal(model.branches(x.state.entries,x.rows[0]).length,1);
 assert.deepEqual(model.restorableBranches(x.state.entries,x.rows[0]).map(e=>e.id),['winter']);
 assert.equal(await x.h.handleRestoreEntry('winter'),true);
 assert.equal(x.state.entries[1].deletedAt,'');
 assert.equal(model.branches(x.state.entries,x.rows[0]).length,2);
 assert.deepEqual(plain(x.state.entries[1].esItems),x.rows[1].esItems);
 assert.equal(x.writes.length,2);
});

test('キャンセル・未保存の詳細・保存失敗では何も削除しない',async()=>{
 for(const reason of ['cancel','unsaved','save-failure']){
  const x=harness(),before=plain(x.state.entries);
  if(reason==='cancel')x.cancel();
  if(reason==='unsaved')x.h.hasUnsavedSelectionDetails=()=>true;
  if(reason==='save-failure')x.h.saveLocalEntries=()=>false;
  await x.h.handleDeleteEntry('winter');
  assert.deepEqual(plain(x.state.entries),before);assert.equal(x.closed(),0);
 }
});

test('確認中に更新された選考・ログアウト後の選考は削除しない',async()=>{
 for(const logout of [true,false]){
  const x=harness();
  x.h.confirmSelectionDelete=async()=>{if(logout)x.invalidate();else x.state.entries[1]={...x.rows[1],memo:'新しいメモ'};return true;};
  await x.h.handleDeleteEntry('winter');
  assert.equal(x.writes.length,0);
  if(!logout)assert.equal(x.state.entries[1].memo,'新しいメモ');
 }
});

test('クラウド削除は対象ID・所有者・更新日時を指定し、削除フラグ以外を送らない',async()=>{
 const x=harness('cloud');
 await x.h.handleDeleteEntry('winter');
 const call=plain(x.calls);
 assert.deepEqual(Object.keys(call[0][1]),['deleted_at']);assert.ok(call[0][1].deleted_at);
 assert.deepEqual(call.slice(1),[['id','winter'],['user_id','owner'],['updated_at','v1']]);
 assert.equal(x.state.entries[0],x.rows[0]);assert.equal(x.state.entries[2],x.rows[2]);
});

test('クラウド復元でも対象行の削除フラグだけを更新する',async()=>{
 const x=harness('cloud');x.rows[1].deletedAt='trash-date';
 x.req.select=async()=>({data:[{...x.rows[1],deletedAt:'',updatedAt:'v2'}]});
 assert.equal(await x.h.handleRestoreEntry('winter'),true);
 assert.deepEqual(plain(x.calls[0]),['update',{deleted_at:null}]);
 assert.equal(x.state.entries[0],x.rows[0]);assert.equal(x.state.entries[2],x.rows[2]);
});

test('競合・権限不足・通信失敗で他の削除処理に切り替えない',async()=>{
 for(const failure of ['conflict','wrong-row','permission','offline','missing-owner','missing-version']){
  const x=harness('cloud'),before=plain(x.state.entries);
  if(failure==='conflict')x.req.select=async()=>({data:[]});
  if(failure==='wrong-row')x.req.select=async()=>({data:[x.rows[0]]});
  if(failure==='permission')x.req.select=async()=>({error:new Error('RLS')});
  if(failure==='offline')x.req.select=async()=>{throw new Error('offline');};
  if(failure==='missing-owner')x.scope.userId='';
  if(failure==='missing-version'){x.rows[1].updatedAt='';before[1].updatedAt='';}
  await x.h.handleDeleteEntry('winter');
  assert.deepEqual(plain(x.state.entries),before);
  assert.equal(x.state.pendingSelectionChanges.size,0);
 }
});

test('二重操作を防ぎ、ログアウトや途中の最新データに古い応答を上書きしない',async()=>{
 for(const logout of [true,false]){
  const x=harness('cloud');let resolve;
  x.req.select=()=>new Promise(done=>resolve=done);
  const job=x.h.setSelectionTrashed(x.rows[1],true,x.scope);
  assert.equal(await x.h.setSelectionTrashed(x.rows[1],true,x.scope),false);
  assert.equal(x.calls.filter(c=>c[0]==='update').length,1);
  if(logout)x.invalidate();else x.state.entries[1]={...x.rows[1],memo:'別の新しいメモ',updatedAt:'v3'};
  resolve({data:[{...x.rows[1],deletedAt:'trash-date',updatedAt:'v2'}]});await job;
  if(logout){assert.equal(x.state.entries.length,0);assert.equal(x.messages.length,0);}
  else{assert.equal(x.state.entries[1].memo,'別の新しいメモ');assert.equal(x.state.entries[1].deletedAt,'');}
 }
});

test('削除後も開いている別の選考の編集画面を閉じない',async()=>{
 const x=harness();x.state.detailEditingId='summer';x.state.editingId='other';
 await x.h.handleDeleteEntry('winter');assert.equal(x.closed(),0);
});

test('最後の選考も保存データを保持し、ゴミ箱から単独で復元できる',async()=>{
 const x=harness();x.state.entries=[x.rows[1]];
 await x.h.handleDeleteEntry('winter');assert.equal(x.state.entries.length,1);assert.ok(x.state.entries[0].deletedAt);
 await x.h.handleRestoreEntry('winter');assert.equal(x.state.entries[0].deletedAt,'');assert.deepEqual(plain(x.state.entries[0].esItems),x.rows[1].esItems);
});
