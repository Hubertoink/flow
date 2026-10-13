import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await readFile('dist/index.html','utf8');
const source=await readFile('dist/app.js','utf8')+'\n'+await readFile('dist/canvas.js','utf8');
function boot(saved){const dom=new JSDOM(html,{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLElement.prototype.setPointerCapture=function(){};if(saved)w.localStorage.setItem('flow-plan-v1',JSON.stringify(saved));w.eval(source);return dom;}
const dom=boot(),w=dom.window,d=w.document,q=s=>d.querySelector(s),all=s=>[...d.querySelectorAll(s)],saved=()=>JSON.parse(w.localStorage.getItem('flow-plan-v1')),submit=s=>q(s).dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(all('.shift').length,0);assert.equal(all('.person-name').length,0);assert.equal(all('.token').length,4);assert.equal(q('.token time').textContent,'8 h');assert.equal(q('.save-status'),null);assert.equal(all('#add-person svg').length,1);
q('.day-head').click();assert.equal(all('.day-head').length,5);assert.equal(all('.expanded').length,1);
function place(person,x,y){q(`[data-person="${person}"]`).click();const cell=q('.day-cell');cell.getBoundingClientRect=()=>({left:0,top:0,width:1200});cell.dispatchEvent(new w.MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));}
place('niko',100,180);place('kayla',200,70);assert.equal(all('.shift').length,2);assert.ok(saved().shifts[1].y<saved().shifts[0].y);assert.equal(saved().shifts[1].length,8);assert.equal(saved().shifts[1].start,10);
const kayla=()=>q(`[data-shift="${saved().shifts[1].id}"]`);
kayla().querySelector('.shift-edit').click();q('[data-type="open"]').click();assert.equal(saved().shifts[1].segments[0].duration,8);
q('[data-type="admin"]').click();assert.equal(saved().shifts[1].segments.length,2);
function pointerTask(edge,dx,dy=0,cancel=false){const el=kayla(),target=el.querySelector('.segment:last-child'),node=edge?target.querySelector(`[data-edge="${edge}"]`):target;el.parentElement.getBoundingClientRect=()=>({width:1200});el.getBoundingClientRect=()=>({left:0,right:1200,top:0,bottom:44});el.onpointerdown({button:0,currentTarget:el,target:node,clientX:300,clientY:25,pointerId:1});d.dispatchEvent(new w.MouseEvent('pointermove',{clientX:300+dx,clientY:25+dy,bubbles:true,cancelable:true}));d.dispatchEvent(new w.Event(cancel?'pointercancel':'pointerup'));}
pointerTask('task-end',100);let s=saved().shifts[1];assert.equal(s.segments.find(t=>t.type==='admin').duration,2);assert.equal(s.segments.find(t=>t.type==='open').duration,6);assert.equal(s.length,8);
const before=JSON.stringify(s);pointerTask('task-end',100,0,true);assert.equal(JSON.stringify(saved().shifts[1]),before);
pointerTask(null,0,120);assert.equal(saved().shifts[1].segments.length,1);assert.equal(saved().shifts[1].segments[0].duration,8);q('#toast button').click();assert.equal(saved().shifts[1].segments.length,2);
await new Promise(r=>setTimeout(r,1));kayla().querySelector('.shift-edit').click();q('[data-type="flex"]').click();q('#task-label').value='Werkstatt';q('#task-label').dispatchEvent(new w.Event('change'));assert.ok(saved().shifts[1].segments.some(t=>t.label==='Werkstatt'));
q('#add-person').click();q('#new-preset').click();q('#preset-form [name=name]').value='Sport';submit('#preset-form');assert.ok(all('.legend-item').some(e=>e.textContent==='Sport'));
q('[data-edit-person="kayla"]').click();q('[name=until]').value=saved().shifts[1].date;submit('#person-form');q('#modal-close').click();assert.equal(all('.token').length,4);q('#next').click();assert.equal(all('.token').length,3);assert.equal(saved().shifts.length,2);
q('#add-person').click();q('#new-person').click();q('[name=name]').value='Mira';q('[name=from]').value='2030-01-01';q('[name=until]').value='2029-01-01';submit('#person-form');assert.match(q('#person-error').textContent,/Zeitraum/);assert.equal(saved().people.length,4);
q('[name=until]').value='';submit('#person-form');assert.equal(saved().people.length,5);assert.equal(all('.token').length,3);
const snapshot=saved(),reload=boot(snapshot);assert.deepEqual(JSON.parse(reload.window.localStorage.getItem('flow-plan-v1')),snapshot);reload.window.close();
const legacy={version:1,people:[{id:'p',name:'Alt',start:9,end:16,color:'#ad95df'}],settings:{weekend:false},shifts:[{id:'s',person:'p',date:'2026-10-13',start:9,segments:[{type:'open',duration:7,label:'Behalten'}]}]};const old=boot(legacy),migrated=JSON.parse(old.window.localStorage.getItem('flow-plan-v1'));assert.equal(migrated.people[0].hours,7);assert.equal(migrated.shifts[0].segments[0].label,'Behalten');assert.equal(migrated.shifts[0].length,7);assert.equal(migrated.shifts[0].y,32);old.window.close();
console.log('PASS: blank canvas, free employee order, day focus, duration placement, neighboring task resize, cancel, drag-out removal/undo, flexible labels, configurable presets, employment dates, migration and reload.');w.close();
