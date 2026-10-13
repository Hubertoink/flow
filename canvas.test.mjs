import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await readFile('dist/index.html','utf8');
const source=await readFile('dist/app.js','utf8')+'\n'+await readFile('dist/canvas.js','utf8');
function boot(saved){
  const dom=new JSDOM(html,{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.structuredClone=structuredClone;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.HTMLElement.prototype.setPointerCapture=function(){};
  if(saved)w.localStorage.setItem('flow-plan-v1',JSON.stringify(saved));
  w.eval(source);return dom;
}
const dom=boot(),w=dom.window,d=w.document,q=s=>d.querySelector(s),all=s=>[...d.querySelectorAll(s)];
const saved=()=>JSON.parse(w.localStorage.getItem('flow-plan-v1'));
const submit=s=>q(s).dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(all('.shift').length,19);assert.equal(q('.token time').textContent,'8 h');
assert.equal(q('.save-status'),null);assert.equal(all('#add-person svg').length,1);
// Migration preserves times and labels; v2 reload must preserve independent lengths.
let snapshot=saved();assert.equal(snapshot.version,2);assert.equal(snapshot.shifts[0].length,8);assert.equal(snapshot.shifts[0].segments[2].offset,3);
q('#next').click();q('.day-head').click();
q('.day-cell').getBoundingClientRect=()=>({left:0,width:1200});
q('.token').click();q('.day-cell').getBoundingClientRect=()=>({left:0,width:1200});
q('.day-cell').dispatchEvent(new w.MouseEvent('click',{clientX:200,bubbles:true}));
assert.equal(all('.shift').length,1);assert.match(q('.shift').getAttribute('aria-label'),/10:00 bis 18:00/);
assert.equal(saved().shifts.at(-1).segments.length,0);
q('.shift').click();q('#tool-add').click();q('#task-label').value='Werkstatt';q('#task-label').dispatchEvent(new w.Event('change'));
assert.equal(saved().shifts.at(-1).length,8);assert.equal(saved().shifts.at(-1).segments[0].label,'Werkstatt');
q('#tool-start').value='19:00';q('#tool-end').value='20:00';submit('#toolkit-form');assert.match(q('#tool-error').textContent,/innerhalb/);
q('#whole-shift').click();q('#tool-start').value='09:00';q('#tool-end').value='18:00';submit('#toolkit-form');assert.equal(saved().shifts.at(-1).length,9);
// Pointer resize updates the length in quarter-hour increments.
function resize(edge,delta){const el=q('.shift'),cell=el.parentElement;cell.getBoundingClientRect=()=>({width:1200});el.onpointerdown({button:0,currentTarget:el,target:el.querySelector(`[data-edge="${edge}"]`),clientX:500,clientY:50,pointerId:1});d.dispatchEvent(new w.MouseEvent('pointermove',{clientX:500+delta,clientY:50,bubbles:true,cancelable:true}));d.dispatchEvent(new w.Event('pointerup'));}
resize('end',100);assert.equal(saved().shifts.at(-1).length,10);
resize('start',50);assert.equal(saved().shifts.at(-1).start,9.5);assert.equal(saved().shifts.at(-1).segments[0].duration,.5);
// Exit day is inclusive; later days and weeks hide the employee, retaining history.
q('#add-person').click();q('[data-edit-person="kayla"]').click();const mondayDate=saved().shifts.at(-1).date;
q('[name=until]').value=mondayDate;submit('#person-form');q('#modal-close').click();assert.equal(all('.token').length,4);
q('#next').click();assert.equal(all('.token').length,3);assert.equal(all('.person-name').length,3);assert.equal(saved().shifts.length,20);
q('#prev').click();assert.equal(all('.token').length,4);q('.day-head').click();q('.day-head').click();
q('#add-person').click();q('#new-person').click();q('[name=name]').value='Mira';q('[name=hours]').value='7';q('[name=from]').value='2030-01-01';q('[name=until]').value='2029-01-01';submit('#person-form');assert.match(q('#person-error').textContent,/Zeitraum/);assert.equal(saved().people.length,4);
q('[name=until]').value='';submit('#person-form');assert.equal(saved().people.length,5);assert.equal(all('.token').length,4);
snapshot=saved();const reload=boot(snapshot);assert.deepEqual(JSON.parse(reload.window.localStorage.getItem('flow-plan-v1')),snapshot);reload.window.close();
// Explicit legacy fixture, including custom task labels.
const legacy={version:1,people:[{id:'p',name:'Alt',start:9,end:16,color:'#ad95df'}],settings:{weekend:false},shifts:[{id:'s',person:'p',date:'2026-10-13',start:9,segments:[{type:'open',duration:7,label:'Behalten'}]}]};
const old=boot(legacy),migrated=JSON.parse(old.window.localStorage.getItem('flow-plan-v1'));assert.equal(migrated.people[0].hours,7);assert.equal(migrated.shifts[0].segments[0].label,'Behalten');assert.equal(migrated.shifts[0].length,7);old.window.close();
console.log('PASS: migration, persistence, duration placement, task naming, time validation, edge resizing, inclusive employment dates, history retention, invalid dates, future employees, clean controls.');
w.close();
