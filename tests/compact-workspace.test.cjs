const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../company-groups.js');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function load(context, names) {
  vm.createContext(context);
  for (const name of names) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, name);
    const tail = source.slice(start), end = tail.slice(1).search(/\n(?:async )?function /);
    vm.runInContext(end < 0 ? tail : tail.slice(0, end + 1), context);
  }
  return context;
}
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test('pagination keeps every company and its branches together, and clamps shrinking pages', () => {
  const rows = Array.from({length: 14}, (_, i) => ({id: 's'+i, companyName: 'Company '+i, trackType: '夏インターン'}));
  rows.push({id:'w11', companyName:'Company 11', trackType:'冬インターン'});
  const h = load({state:{entries: rows, companyPage:0, filter:'all'}, window:{SHUKATSU_GROUPS:model}, els:{companyList:{}, companyPagination:{}}, escapeHtml:escape, escapeAttribute:escape, companyIconMarkup:()=>'', trackTag:escape, companyStatusPicker:()=>''}, ['paginateItems','renderPagination','renderCompanyGroups']);
  h.renderCompanyGroups(rows,12);
  assert.equal((h.els.companyList.innerHTML.match(/data-company-card/g)||[]).length,12);
  assert.match(h.els.companyList.innerHTML,/data-detail-id="w11"/);
  h.state.companyPage = 1;
  h.renderCompanyGroups(rows,12);
  assert.equal((h.els.companyList.innerHTML.match(/data-company-card/g)||[]).length,2);
  assert.doesNotMatch(h.els.companyList.innerHTML,/data-detail-id="w11"/);
  h.renderCompanyGroups(rows.slice(0,1),12);
  assert.equal(h.state.companyPage,0);
  assert.equal(h.paginateItems([],99,12).total,0);
  assert.equal(h.paginateItems(rows,-1,12).page,0);
});

test('compact calendar opens all items on a date and escapes imported text', () => {
  const entries = Array.from({length:6},(_,i)=>({id:'entry-'+i,companyName:i===0?'<img src=x>':'Company '+i,trackType:'夏インターン',deadline:'2026-09-25'}));
  entries[0].eventDate = '2026-09-25';
  entries[0].eventType = '面接';
  entries.push({id:'trash', deletedAt:'today', deadline:'2026-09-25'});
  let opened=0;
  const h = load({activeEntries:()=>entries.filter(e=>!e.deletedAt), state:{calendarYear:2026,calendarMonth:8},els:{calendarMonthLabel:{},calendarGrid:{},calendarDayTitle:{},calendarDayList:{},calendarDayDialog:{showModal(){opened++;}}}, toDateInputValue:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,formatDate:s=>s,escapeHtml:escape,escapeAttribute:escape,emptyState:s=>s},['calendarItemsFor','renderCalendar','openCalendarDay']);
  h.renderCalendar();
  assert.match(h.els.calendarGrid.innerHTML,/2026年9月25日、7件/);
  h.openCalendarDay('2026-09-25');
  assert.equal(opened,1);
  assert.equal((h.els.calendarDayList.innerHTML.match(/data-detail-id=/g)||[]).length,7);
  assert.doesNotMatch(h.els.calendarDayList.innerHTML,/<img|data-detail-id="trash"/);
  assert.match(h.els.calendarDayList.innerHTML,/&lt;img/);
  h.openCalendarDay('bad');
  assert.equal(opened,1);
});

test('template dialog preserves its draft after a failed save and closes only after success', async () => {
  let saveOk=false, resets=0, closes=0;
  const h=load({state:{mode:'local',templates:[],templatePage:2},els:{templateKindInput:{value:'ガクチカ'},templateTitleInput:{value:'Draft'},templateBodyInput:{value:'Draft body'},templateDialog:{close(){closes++;}}},normalizeTemplate:t=>t,createId:()=> 'new',nextTemplateSortOrder:()=>0,saveLocalTemplates:()=>saveOk,showToast(){},resetTemplateForm(){resets++;},renderTemplateList(){},renderTemplateOptions(){}},['handleTemplateSubmit']);
  await h.handleTemplateSubmit({preventDefault(){}});
  assert.equal(resets,0); assert.equal(closes,0); assert.equal(h.state.templates.length,0);
  assert.equal(h.els.templateBodyInput.value,'Draft body');
  saveOk=true;
  await h.handleTemplateSubmit({preventDefault(){}});
  assert.equal(resets,1); assert.equal(closes,1); assert.equal(h.state.templates[0].body,'Draft body');
});

test('reordering one template page preserves templates and order on other pages', async () => {
  const templates=Array.from({length:7},(_,i)=>({id:'t'+i,sortOrder:i,body:'body'+i}));
  const h=load({state:{mode:'local',templates},els:{templateList:{querySelectorAll:()=>['t5','t3','t4'].map(id=>({dataset:{templateId:id}}))}},sortTemplates:(a,b)=>a.sortOrder-b.sortOrder,saveLocalTemplates:()=>true},['persistTemplateOrderFromDom']);
  await h.persistTemplateOrderFromDom();
  assert.deepEqual([...h.state.templates].sort(h.sortTemplates).map(t=>t.id),['t0','t1','t2','t5','t3','t4','t6']);
  assert.deepEqual(h.state.templates.map(t=>t.body), templates.map(t=>t.body));
});
