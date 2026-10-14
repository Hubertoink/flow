import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await readFile('dist/index.html','utf8');
const source=await readFile('dist/icons.js','utf8')+'\n'+await readFile('dist/app.js','utf8')+'\n'+await readFile('dist/canvas.js','utf8');
function boot(saved,setup){const dom=new JSDOM(html,{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLElement.prototype.setPointerCapture=function(){};if(saved)w.localStorage.setItem('flow-plan-v1',JSON.stringify(saved));setup?.(w);w.eval(source+'\nwindow.runCanvasCode=code=>eval(code);');return dom;}
const dom=boot(),w=dom.window,d=w.document,q=s=>d.querySelector(s),all=s=>[...d.querySelectorAll(s)],saved=()=>JSON.parse(w.localStorage.getItem('flow-plan-v1')),submit=s=>q(s).dispatchEvent(new w.Event('submit',{cancelable:true}));
{
  for(const weekend of [false,true]){
    const plan={version:3,people:[],shifts:[],settings:{weekend}};
    const weekendDom=boot(plan),ww=weekendDom.window,wd=ww.document;
    assert.equal(wd.querySelectorAll('.day-head').length,weekend?7:5);
    const initial=JSON.parse(ww.localStorage.getItem('flow-plan-v1')).settings;
    assert.equal(initial.saturday,weekend);assert.equal(initial.sunday,weekend);
    ww.runCanvasCode('openSettings()');
    for(const [saturday,sunday] of [[true,false],[false,true],[true,true],[false,false]]){
      for(const [id,checked] of [['saturday',saturday],['sunday',sunday]]){
        const input=wd.querySelector('#'+id);input.checked=checked;input.dispatchEvent(new ww.Event('change'));
      }
      const indices=ww.runCanvasCode('dates().map(date=>(date.getDay()+6)%7)');
      assert.deepEqual([...indices],[0,1,2,3,4,...(saturday?[5]:[]),...(sunday?[6]:[])]);
      const state=JSON.parse(ww.localStorage.getItem('flow-plan-v1'));
      assert.equal(state.settings.saturday,saturday);assert.equal(state.settings.sunday,sunday);
      const reloaded=boot(state);
      assert.equal(reloaded.window.document.querySelectorAll('.day-head').length,5+Number(saturday)+Number(sunday));
      reloaded.window.close();
    }
    const sundayInput=wd.querySelector('#sunday');sundayInput.checked=true;sundayInput.dispatchEvent(new ww.Event('change'));
    ww.runCanvasCode('expandDay(dateKey(addDays(week,6)))');
    sundayInput.checked=false;sundayInput.dispatchEvent(new ww.Event('change'));
    assert.equal(ww.runCanvasCode('focusDate'),null);
    weekendDom.window.close();
  }
}
assert.equal(all('.shift').length,0);assert.equal(all('.person-name').length,0);assert.equal(all('.token').length,4);assert.equal(q('.token time').textContent,'8 h');assert.equal(q('.save-status'),null);assert.equal(all('#settings-button svg').length,1);assert.equal(q('#settings-button').closest('.header-actions')!==null,true);assert.equal(q('#dock-toggle'),null);
{
  const clickDom=boot(),cw=clickDom.window,cq=s=>cw.document.querySelector(s),run=code=>cw.runCanvasCode(code);
  run(`data.shifts=[
    {id:'click-empty',person:'lea',date:dateKey(week),start:10,length:4,y:32,segments:[]},
    {id:'click-task',person:'niko',date:dateKey(week),start:10,length:4,y:88,segments:[{id:'click-admin',type:'admin',offset:0,duration:2}]}
  ];persist();refresh()`);
  const before=cw.localStorage.getItem('flow-plan-v1');
  cq('[data-shift="click-empty"]').click();assert.equal(run('editing'),'click-empty');
  assert.equal(cq('[data-shift="click-empty"] .shift-edit').getAttribute('aria-pressed'),'true');
  cq('[data-shift="click-empty"]').click();assert.equal(run('editing'),'click-empty');
  cq('[data-task="click-admin"] .task-caption').click();assert.equal(run('editing'),'click-task');
  assert.equal(cq('[data-shift="click-empty"]').classList.contains('editing'),false);
  assert.equal(cq('#detail').hidden,true);
  cq('[data-task="click-admin"]').click();assert.equal(cq('#detail').hidden,false);
  cq('[data-shift="click-task"] .shift-edit').click();assert.equal(run('editing'),null);
  // An actual move suppresses its trailing click; dragging must not open a shift.
  const el=cq('[data-shift="click-empty"]');el.parentElement.getBoundingClientRect=()=>({width:1200});
  el.getBoundingClientRect=()=>({left:0,right:1200,top:0,bottom:44});
  cw.document.elementFromPoint=()=>el.parentElement;
  el.onpointerdown({button:0,currentTarget:el,target:el,pointerId:1,clientX:100,clientY:20});
  cw.document.dispatchEvent(new cw.MouseEvent('pointermove',{clientX:120,clientY:20,bubbles:true,cancelable:true}));
  cw.document.dispatchEvent(new cw.Event('pointercancel'));
  cq('[data-shift="click-empty"]').click();assert.equal(run('editing'),null);
  assert.equal(cw.localStorage.getItem('flow-plan-v1'),before);
  cw.close();
}
{
  const layoutDom=boot(),lw=layoutDom.window,ld=lw.document,run=code=>lw.runCanvasCode(code);
  run(`data.shifts=[
    {id:'fixed',person:'lea',date:dateKey(week),start:10,length:4,y:200,segments:[]},
    {id:'moving',person:'niko',date:dateKey(week),start:10,length:4,y:320,segments:[]}
  ];compactShifts();refresh()`);
  assert.equal(run('data.shifts[0].y'),32);
  assert.equal(run('data.shifts[1].y'),88);
  assert.equal(run('freeY(dateKey(week),16,"moving")'),32);
  assert.equal(run('freeY(dateKey(week),48,"moving")'),88);
  assert.equal(run('freeY(dateKey(week),900,"moving")'),88);
  function moveTo(wanted,{cancel=false,zoom=1,grab=7}={}){
    run(`data.settings.zoom=${zoom};zoom=${zoom};refresh()`);
    const el=ld.querySelector('[data-shift="moving"]'),cell=el.parentElement,previous=run('data.shifts[1].y');
    cell.getBoundingClientRect=()=>({left:0,top:50,width:1200});
    el.getBoundingClientRect=()=>({left:0,top:50+previous*zoom,width:300,height:44*zoom});
    ld.elementFromPoint=()=>cell;
    el.onpointerdown({button:0,currentTarget:el,target:el,clientX:300,clientY:50+(previous+grab)*zoom,pointerId:1});
    ld.dispatchEvent(new lw.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:300,clientY:50+(wanted+grab)*zoom}));
    const preview=run('data.shifts[1].y');
    ld.dispatchEvent(new lw.Event(cancel?'pointercancel':'pointerup'));
    return {preview,final:run('data.shifts[1].y'),previous};
  }
  assert.deepEqual(moveTo(16),{preview:32,final:32,previous:88});
  assert.equal(run('data.shifts[0].y'),88);
  assert.deepEqual(moveTo(104,{zoom:1.5,grab:35}),{preview:88,final:88,previous:32});
  assert.deepEqual(moveTo(900),{preview:88,final:88,previous:88});
  assert.deepEqual(moveTo(16,{cancel:true}),{preview:32,final:88,previous:88});
  assert.equal(run('data.shifts[0].y'),32);
  // Native drag previews and placement must resolve to the same nearest gap.
  const cell=ld.querySelector('.day-cell'),dt={setData(){},effectAllowed:'',dropEffect:''};
  const event={preventDefault(){},target:cell,dataTransfer:dt,clientX:300,clientY:50+900+20};
  ld.querySelector('[data-person="kayla"]').ondragstart(event);
  cell.ondragover(event);
  assert.equal(parseFloat(cell.querySelector('.drop-preview').style.top),144);
  cell.ondrop(event);
  assert.equal(run('data.shifts.at(-1).y'),144);
  const stored=JSON.parse(lw.localStorage.getItem('flow-plan-v1')),again=boot(stored);
  assert.equal(again.window.runCanvasCode('data.shifts.at(-1).y'),144);again.window.close();
  layoutDom.window.close();
}
{
  const zeroDom=boot(),zw=zeroDom.window,zd=zw.document,zq=s=>zd.querySelector(s),run=code=>zw.runCanvasCode(code);
  const originalHours=run('JSON.stringify(data.people[0].weekdayHours)'),originalTarget=run('data.people[0].weeklyHours');
  run('data.settings.saturday=true;data.settings.sunday=true;data.settings.breakRules=[{after:2,minutes:30}];refresh()');
  const person=run('data.people[0].id'),saturday=zd.querySelectorAll('.day-cell')[5],sunday=zd.querySelectorAll('.day-cell')[6];
  saturday.getBoundingClientRect=()=>({left:0,top:0,width:1200});
  const dt={setData(){},effectAllowed:'',dropEffect:''},event={preventDefault(){},dataTransfer:dt,target:saturday,clientX:1200,clientY:100};
  zq(`[data-person="${person}"]`).ondragstart(event);
  saturday.ondragenter(event);
  assert.equal(dt.dropEffect,'copy');assert.equal(saturday.querySelector('.drop-preview').style.width,'18.75%');
  assert.match(saturday.querySelector('.drop-preview').textContent,/21:00 · 3 h/);
  saturday.ondrop(event);
  const weekendShift=run(`data.shifts.find(s=>s.date==='${saturday.dataset.date}')`);
  assert.equal(weekendShift.length,3);assert.equal(weekendShift.start,21);
  assert.equal(run('workTotals(data.shifts).net'),2.5);
  // Click placement on Sunday uses the same default; copies retain their duration.
  zq(`[data-person="${person}"]`).click();
  const sundayCell=zd.querySelector(`.day-cell[data-date="${sunday.dataset.date}"]`);
  sundayCell.getBoundingClientRect=()=>({left:0,top:0,width:1200});
  sundayCell.dispatchEvent(new zw.MouseEvent('click',{bubbles:true,clientX:150,clientY:100}));
  assert.equal(run(`data.shifts.find(s=>s.date==='${sunday.dataset.date}').length`),3);
  run(`data.shifts[0].length=4;copyShift(data.shifts[0].id);placeCopy(dateKey(week))`);
  assert.equal(run('data.shifts.at(-1).length'),4);
  assert.equal(run('JSON.stringify(data.people[0].weekdayHours)'),originalHours);
  assert.equal(run('data.people[0].weeklyHours'),originalTarget);
  run(`drag={kind:'person',id:'${person}'}`);
  assert.match(run(`dropBlocked('${saturday.dataset.date}')`),/bereits eingeplant/);
  run(`data.people[0].until=dateKey(week)`);
  assert.match(run(`dropBlocked('${sunday.dataset.date}')`),/nicht im Team/);
  zeroDom.window.close();
}
q('.day-head').click();assert.equal(all('.day-head').length,5);assert.equal(all('.expanded').length,1);
function place(person,x,y){q(`[data-person="${person}"]`).click();const cell=q('.day-cell');cell.getBoundingClientRect=()=>({left:0,top:0,width:1200});cell.dispatchEvent(new w.MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));}
place('niko',100,180);place('kayla',200,40);assert.equal(all('.shift').length,2);assert.ok(saved().shifts[1].y<saved().shifts[0].y);assert.equal(saved().shifts[1].length,8);assert.equal(saved().shifts[1].start,10.75);
const kayla=()=>q(`[data-shift="${saved().shifts[1].id}"]`);
kayla().querySelector('.shift-edit').click();assert.equal(q('#detail').hidden,true);assert.equal(kayla().querySelector('.shift-edit').getAttribute('aria-pressed'),'true');kayla().querySelector('.shift-edit').click();assert.equal(kayla().classList.contains('editing'),false);
const transfer={setData(){},effectAllowed:'',dropEffect:''};q('[data-person="kayla"]').ondragstart({dataTransfer:transfer});q('.day-cell').ondragover({preventDefault(){},dataTransfer:transfer,target:q('.day-cell'),clientX:100,clientY:100});assert.equal(transfer.dropEffect,'none');assert.match(q('.drop-rejection').textContent,/bereits eingeplant/);assert.equal(q('.drop-preview'),null);q('[data-person="kayla"]').ondragend();
// Entering a free day must immediately restore dropping after a rejected day.
{
  const rd=boot(saved()),rw=rd.window,rq=s=>rw.document.querySelector(s);
  const cells=[...rw.document.querySelectorAll('.day-cell')];
  cells.forEach(cell=>cell.getBoundingClientRect=()=>({left:0,top:0,width:1200}));
  const dt={setData(){},effectAllowed:'',dropEffect:''};
  const event=target=>({preventDefault(){},dataTransfer:dt,target,clientX:100,clientY:100});
  rq('[data-person="kayla"]').ondragstart(event(rq('[data-person="kayla"]')));
  cells[0].ondragenter(event(cells[0]));
  assert.equal(dt.dropEffect,'none');
  assert.match(rq('.drop-rejection').textContent,/bereits eingeplant/);
  cells[2].ondragenter(event(cells[2]));
  assert.equal(dt.dropEffect,'copy');
  assert.equal(rq('.drop-rejection'),null);
  assert.ok(cells[2].querySelector('.drop-preview'));
  cells[2].ondrop(event(cells[2]));
  const state=JSON.parse(rw.localStorage.getItem('flow-plan-v1'));
  assert.equal(state.shifts.filter(s=>s.person==='kayla'&&s.date===cells[2].dataset.date).length,1);
  assert.equal(state.shifts.filter(s=>s.person==='kayla'&&s.date===cells[0].dataset.date).length,1);
  rw.runCanvasCode(`copyShift('${state.shifts.find(s=>s.person==='kayla').id}')`);
  rq('#copy-badge').ondragstart(event(rq('#copy-badge')));
  const currentCells=[...rw.document.querySelectorAll('.day-cell')];
  currentCells[0].ondragenter(event(currentCells[0]));
  assert.equal(dt.dropEffect,'none');
  const freeHead=rw.document.querySelectorAll('.day-head')[3];
  freeHead.ondragenter(event(freeHead));
  assert.equal(dt.dropEffect,'copy');
  assert.equal(rq('.drop-rejection'),null);
  freeHead.ondrop(event(freeHead));
  assert.equal(JSON.parse(rw.localStorage.getItem('flow-plan-v1')).shifts.filter(s=>s.person==='kayla').length,3);
  // Leaving a header cancels its delayed expansion, even over a blocked day.
  rw.runCanvasCode('expandDay(null)');
  rq('[data-person="kayla"]').ondragstart(event(rq('[data-person="kayla"]')));
  const newHeads=[...rw.document.querySelectorAll('.day-head')];
  newHeads[1].ondragenter(event(newHeads[1]));
  newHeads[1].parentElement.ondragleave({relatedTarget:newHeads[0]});
  newHeads[0].ondragenter(event(newHeads[0]));
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(rw.runCanvasCode('focusDate'),null);
  rq('[data-person="kayla"]').ondragend();
  // Returning to the already expanded day must cancel another day's timer.
  rw.runCanvasCode(`expandDay('${newHeads[0].dataset.date}');queueExpand('${newHeads[1].dataset.date}');queueExpand('${newHeads[0].dataset.date}')`);
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(rw.runCanvasCode('focusDate'),newHeads[0].dataset.date);
  rd.window.close();
}
q('#zoom-in').click();assert.equal(q('#zoom-value').textContent,'125%');q('#zoom-out').click();q('#zoom-out').click();assert.equal(q('#zoom-value').textContent,'75%');q('#zoom-value').click();assert.equal(saved().settings.zoom,1);
kayla().querySelector('.shift-edit').click();q('[data-type="open"]').click();assert.equal(saved().shifts[1].segments[0].duration,8);
q('[data-type="admin"]').click();assert.equal(saved().shifts[1].segments.length,2);
const positions=saved().shifts.map(s=>s.y);const nikoId=saved().shifts[0].id;assert.equal(parseFloat(q('[data-shift="'+nikoId+'"]').style.top),positions[0]+108);assert.deepEqual([...kayla().querySelectorAll('.segment')].map(el=>el.style.getPropertyValue('--row')),['0','1']);kayla().querySelector('.shift-edit').click();assert.equal(parseFloat(q('[data-shift="'+nikoId+'"]').style.top),positions[0]);assert.deepEqual(saved().shifts.map(s=>s.y),positions);kayla().querySelector('.shift-edit').click();
function pointerTask(edge,dx,dy=0,cancel=false){const el=kayla(),target=el.querySelector(`[data-task="${saved().shifts[1].segments.find(t=>t.type==='admin').id}"]`),node=edge?target.querySelector(`[data-edge="${edge}"]`):target;el.parentElement.getBoundingClientRect=()=>({width:1200});el.getBoundingClientRect=()=>({left:0,right:1200,top:0,bottom:44});el.querySelector('.task-track').getBoundingClientRect=()=>({left:0,right:1200,top:0,bottom:80});el.onpointerdown({button:0,currentTarget:el,target:node,clientX:300,clientY:25,pointerId:1});d.dispatchEvent(new w.MouseEvent('pointermove',{clientX:300+dx,clientY:25+dy,bubbles:true,cancelable:true}));d.dispatchEvent(new w.Event(cancel?'pointercancel':'pointerup'));}
pointerTask('task-end',75);let s=saved().shifts[1];assert.equal(s.segments.find(t=>t.type==='admin').duration,2);assert.equal(s.segments.find(t=>t.type==='open').duration,6);assert.equal(s.length,8);
const before=JSON.stringify(s);pointerTask('task-end',100,0,true);assert.equal(JSON.stringify(saved().shifts[1]),before);
pointerTask(null,0,120);assert.equal(saved().shifts[1].segments.length,1);assert.equal(saved().shifts[1].segments[0].duration,8);q('#toast button').click();assert.equal(saved().shifts[1].segments.length,2);
await new Promise(r=>setTimeout(r,1));if(kayla().querySelector('.shift-edit').getAttribute('aria-pressed')!=='true')kayla().querySelector('.shift-edit').click();q('[data-type="flex"]').click();q('#task-label').value='Werkstatt';q('#task-label').dispatchEvent(new w.Event('change'));assert.ok(saved().shifts[1].segments.some(t=>t.label==='Werkstatt'));
assert.equal(all('.color-swatch').length,20);q('[data-color="#85b9e2"]').click();assert.equal(saved().shifts[1].segments.find(t=>t.label==='Werkstatt').color,'#85b9e2');q('#task-color').value='#112233';q('#task-color').dispatchEvent(new w.Event('input'));assert.equal(saved().shifts[1].segments.find(t=>t.label==='Werkstatt').color,'#112233');const custom=kayla().querySelector(`[data-task="${saved().shifts[1].segments.find(t=>t.label==='Werkstatt').id}"]`);assert.equal(custom.style.getPropertyValue('--task-ink'),'#ffffff');assert.match(custom.querySelector('.task-time').textContent,/\d{2}:\d{2}–\d{2}:\d{2}/);
q('#settings-button').click();q('#new-preset').click();q('#preset-form [name=name]').value='Sport';submit('#preset-form');assert.ok(all('.legend-item').some(e=>e.textContent==='Sport'));
q('[data-edit-person="kayla"]').click();assert.equal(all('#person-form .color-swatch').length,20);q('#person-form [data-color="#85b9e2"]').click();assert.equal(q('#person-form [name=color]').value,'#85b9e2');q('[name=until]').value=saved().shifts[1].date;q('[name=weeklyHours]').value='32';submit('#person-form');assert.equal(saved().people.find(p=>p.id==='kayla').weeklyHours,32);assert.equal(saved().people.find(p=>p.id==='kayla').color,'#85b9e2');q('#modal-close').click();assert.equal(all('.token').length,4);q('#next').click();assert.equal(all('.token').length,3);assert.equal(saved().shifts.length,2);
q('#settings-button').click();q('#new-person').click();q('[name=name]').value='Mira';q('[name=from]').value='2030-01-01';q('[name=until]').value='2029-01-01';submit('#person-form');assert.match(q('#person-error').textContent,/Zeitraum/);assert.equal(saved().people.length,4);
q('[name=until]').value='';submit('#person-form');assert.equal(saved().people.length,5);assert.equal(all('.token').length,3);
const snapshot=saved(),reload=boot(snapshot);assert.deepEqual(JSON.parse(reload.window.localStorage.getItem('flow-plan-v1')),snapshot);reload.window.close();
// Summary counts all seven days even when weekends are hidden; copies are independent snapshots.
const fixture=structuredClone(snapshot);fixture.people.forEach(p=>{p.from='';p.until='';});const sunday=new Date(fixture.shifts[0].date+'T12:00:00');sunday.setDate(sunday.getDate()+6);const sundayKey=`${sunday.getFullYear()}-${String(sunday.getMonth()+1).padStart(2,'0')}-${String(sunday.getDate()).padStart(2,'0')}`;fixture.shifts.push({id:'sunday',person:'niko',date:sundayKey,start:20,length:2,y:32,segments:[]});
const cd=boot(fixture),cw=cd.window,cq=s=>cw.document.querySelector(s),cs=()=>JSON.parse(cw.localStorage.getItem('flow-plan-v1'));cq('#week-info-toggle').click();assert.equal(cq('#week-info').hidden,false);assert.equal(cq('[data-summary-person="lea"]'),null);assert.match(cq('[data-summary-person="kayla"] .weekly-comparison').textContent,/32 h Soll/);assert.match(cq('.week-info-total b').textContent,/18 h/);assert.match(cq('[data-summary-person="niko"] summary b').textContent,/10 h/);assert.match(cq('[data-summary-person="niko"] .weekly-tasks').textContent,/Ohne Aufgabe/);
const sourceShift=fixture.shifts[1];cq(`[data-shift="${sourceShift.id}"] .shift-edit`).click();cq(`[data-shift="${sourceShift.id}"] .shift-copy`).click();assert.equal(cq('#copy-tray').hidden,false);assert.equal(cq('#copy-badge').querySelectorAll('.copy-mini-task').length,sourceShift.segments.length);cq('#copy-badge').click();cw.document.querySelectorAll('.day-cell')[1].dispatchEvent(new cw.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));let copied=cs().shifts.at(-1);assert.equal(cs().shifts.length,4);assert.equal(copied.start,sourceShift.start);assert.equal(copied.length,sourceShift.length);assert.notEqual(copied.id,sourceShift.id);assert.deepEqual(copied.segments.map(({id,...t})=>t),sourceShift.segments.map(({id,...t})=>t));assert.ok(copied.segments.every(t=>!sourceShift.segments.some(o=>o.id===t.id)));assert.deepEqual(cs().shifts.find(s=>s.id===sourceShift.id),sourceShift);
cq('#copy-badge').click();cw.document.querySelectorAll('.day-cell')[1].dispatchEvent(new cw.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(cs().shifts.length,4);cq('#week-info-toggle').click();assert.match(cq('.week-info-total b').textContent,/26 h/);cq('#dismiss-copy').click();assert.equal(cq('#copy-tray').hidden,true);cw.close();
// Individual task copies retain duration and custom fields, without replacing existing work.
const taskFixture=structuredClone(fixture),taskDate=fixture.shifts[0].date;
taskFixture.shifts=[
  {id:'task-source',person:'niko',date:taskDate,start:10,length:6,y:32,segments:[{id:'meeting',type:'flex',label:'Team-Meeting',color:'#112233',offset:0,duration:2}]},
  {id:'task-target',person:'kayla',date:taskDate,start:8,length:8,y:160,segments:[{id:'existing',type:'open',label:'Behalten',offset:6,duration:2}]},
  {id:'task-full',person:'lea',date:taskDate,start:8,length:1,y:224,segments:[]}
];
const td=boot(taskFixture),tw=td.window,tq=selector=>tw.document.querySelector(selector),ts=()=>JSON.parse(tw.localStorage.getItem('flow-plan-v1'));
assert.equal(tq('.task-copy'),null);tq('[data-shift="task-source"] .shift-edit').click();assert.equal(tq('.task-copy').getAttribute('aria-label'),'Team-Meeting kopieren');
const taskCopyButton=tq('.task-copy'),sourceBefore=structuredClone(ts().shifts[0]);tq('[data-shift="task-source"]').onpointerdown({button:0,target:taskCopyButton,currentTarget:tq('[data-shift="task-source"]'),pointerId:1,clientX:0,clientY:0});tw.document.dispatchEvent(new tw.MouseEvent('pointermove',{clientX:100,clientY:100,bubbles:true}));tw.document.dispatchEvent(new tw.Event('pointerup'));assert.deepEqual(ts().shifts[0],sourceBefore);
taskCopyButton.click();assert.equal(tq('#copy-tray').hidden,false);assert.equal(tq('#copy-badge strong').textContent,'Team-Meeting');assert.match(tq('#copy-badge time').textContent,/2 h/);assert.equal(tq('#detail').hidden,true);
tq('[data-task="meeting"]').click();tq('#task-label').value='Geändertes Original';tq('#task-label').dispatchEvent(new tw.Event('change'));
let dragImage=null;const ghostTransfer={...transfer,setDragImage(image){dragImage=image;}};
tq('#copy-badge').ondragstart({dataTransfer:ghostTransfer,clientX:100,clientY:40});assert.equal(dragImage.tagName,'CANVAS');assert.equal(dragImage.width,1);assert.equal(tq('.task-copy-ghost').style.left,'100px');
const hoverTarget=tq('[data-shift="task-target"]');hoverTarget.parentElement.getBoundingClientRect=()=>({left:0,top:0,width:1200});
function hoverCopy(target,y=180){const event=new tw.MouseEvent('dragover',{clientX:225,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:ghostTransfer});target.dispatchEvent(event);}
hoverCopy(hoverTarget);assert.equal(tq('.task-copy-ghost').classList.contains('over-target'),true);assert.equal(hoverTarget.classList.contains('task-copy-target'),true);assert.match(tq('.task-copy-ghost time').textContent,/Bei Kayla platzieren/);assert.equal(tq('.task-copy-ghost').style.left,'225px');
hoverCopy(tq('[data-shift="task-full"]'),244);assert.equal(tq('.task-copy-ghost').classList.contains('over-target'),false);assert.equal(tq('.task-copy-target'),null);
hoverCopy(hoverTarget);assert.equal(tq('.task-copy-ghost.over-target')!==null,true);
tw.document.documentElement.dispatchEvent(new tw.MouseEvent('dragleave',{bubbles:true}));assert.equal(tq('.task-copy-ghost').classList.contains('over-target'),false);assert.equal(tq('.task-copy-target'),null);
tq('#copy-badge').ondragend();assert.equal(tq('.task-copy-ghost'),null);assert.deepEqual(ts().shifts[0].segments[0].label,'Geändertes Original');
function taskDrag(shiftId,x,drop=true){tq('#copy-badge').ondragstart({dataTransfer:transfer});const target=tq(`[data-shift="${shiftId}"]`),cell=target.parentElement;cell.getBoundingClientRect=()=>({left:0,top:0,width:1200});const event={preventDefault(){},dataTransfer:transfer,target,clientX:x,clientY:180};cell.ondragover(event);if(drop)cell.ondrop(event);else tq('#copy-badge').ondragend();}
taskDrag('task-target',225);let targetTask=ts().shifts[1].segments.find(t=>t.id!=='existing');assert.equal(targetTask.offset,3);assert.equal(targetTask.duration,2);assert.equal(targetTask.label,'Team-Meeting');assert.equal(targetTask.color,'#112233');assert.equal(targetTask.type,'flex');assert.notEqual(targetTask.id,'meeting');assert.deepEqual(ts().shifts[1].segments.find(t=>t.id==='existing'),taskFixture.shifts[1].segments[0]);assert.equal(ts().shifts[1].length,8);assert.equal(ts().shifts[0].segments[0].label,'Geändertes Original');
taskDrag('task-full',100,false);assert.equal(transfer.dropEffect,'none');assert.equal(tq('.drop-preview'),null);const blockedBefore=structuredClone(ts());taskDrag('task-full',100);assert.deepEqual(ts(),blockedBefore);assert.match(tq('#toast').textContent,/freier Bereich/);
tq('#copy-badge').ondragstart({dataTransfer:transfer});tq('.day-head').ondrop({preventDefault(){}});assert.match(tq('#toast').textContent,/bestehende Schicht/);assert.deepEqual(ts(),blockedBefore);
tq('#copy-badge').click();let emptyCell=tq('.day-cell');emptyCell.dispatchEvent(new tw.MouseEvent('click',{bubbles:true}));assert.match(tq('#toast').textContent,/bestehende Schicht/);assert.deepEqual(ts(),blockedBefore);
const keyboardTarget=tq('[data-shift="task-target"]');keyboardTarget.dispatchEvent(new tw.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(ts().shifts[1].segments.length,3);assert.equal(ts().shifts[1].segments.at(-1).offset,0);assert.equal(ts().shifts[1].segments.at(-1).duration,2);assert.notEqual(ts().shifts[1].segments.at(-1).id,targetTask.id);
tq('#copy-badge').click();const clickTarget=tq('[data-shift="task-target"]');clickTarget.parentElement.getBoundingClientRect=()=>({left:0,top:0,width:1200});clickTarget.dispatchEvent(new tw.MouseEvent('click',{clientX:225,bubbles:true}));assert.match(tq('#toast').textContent,/freier Bereich/);assert.equal(ts().shifts[1].segments.length,3);
tq('[data-shift="task-target"] .shift-copy').click();assert.ok(tq('#copy-badge .copy-mini-track'));tq('#dismiss-copy').click();assert.equal(tq('#copy-tray').hidden,true);
const taskSnapshot=ts(),taskReload=boot(taskSnapshot);assert.deepEqual(JSON.parse(taskReload.window.localStorage.getItem('flow-plan-v1')),taskSnapshot);taskReload.window.close();tw.close();
const legacy={version:1,people:[{id:'p',name:'Alt',start:9,end:16,color:'#ad95df'}],settings:{weekend:false},shifts:[{id:'s',person:'p',date:'2026-10-13',start:9,segments:[{type:'open',duration:7,label:'Behalten'}]}]};const old=boot(legacy),migrated=JSON.parse(old.window.localStorage.getItem('flow-plan-v1'));assert.equal(migrated.people[0].hours,7);assert.equal(migrated.shifts[0].segments[0].label,'Behalten');assert.equal(migrated.shifts[0].length,7);assert.equal(migrated.shifts[0].y,32);const od=old.window.document;od.querySelector('.shift').dispatchEvent(new old.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));od.querySelector('#tool-start').value='17:00';od.querySelector('#tool-end').value='24:00';od.querySelector('#toolkit-form').dispatchEvent(new old.window.Event('submit',{cancelable:true}));assert.equal(JSON.parse(old.window.localStorage.getItem('flow-plan-v1')).shifts[0].start,17);assert.match(od.querySelector('.shift-time').textContent,/24:00/);od.querySelector('#tool-end').value='24:15';od.querySelector('#toolkit-form').dispatchEvent(new old.window.Event('submit',{cancelable:true}));assert.match(od.querySelector('#tool-error').textContent,/24:00/);old.window.close();
const scheduleFixture=structuredClone(snapshot);scheduleFixture.people.forEach(person=>{person.from='';person.until='';});scheduleFixture.shifts=[];
const scheduleDom=boot(scheduleFixture,w=>{w.matchMedia=()=>({matches:true});}),scheduleWindow=scheduleDom.window,scheduleDocument=scheduleWindow.document,scheduleQuery=selector=>scheduleDocument.querySelector(selector),scheduleSaved=()=>JSON.parse(scheduleWindow.localStorage.getItem('flow-plan-v1'));
scheduleQuery('#settings-button').click();assert.match(scheduleQuery('[data-edit-person="niko"] .person-weekly-hours').textContent,/40 h.*pro Woche/);
scheduleQuery('#modal').scrollTop=180;scheduleQuery('[data-edit-person="niko"]').click();scheduleQuery('#modal-close').click();assert.equal(scheduleQuery('#modal').open,true);assert.equal(scheduleQuery('#modal').scrollTop,180);assert.equal(scheduleQuery('h2').textContent,'Einstellungen');
scheduleQuery('[data-edit-person="niko"]').click();[8,0,8,8,7,0,0].forEach((value,index)=>{const input=scheduleQuery(`[name="weekday-${index}"]`);input.value=value;input.dispatchEvent(new scheduleWindow.Event('input'));});assert.equal(scheduleQuery('[name="weeklyHours"]').value,'31');assert.equal(scheduleQuery('#schedule-total').textContent,'31 h');scheduleQuery('#person-form').dispatchEvent(new scheduleWindow.Event('submit',{cancelable:true}));assert.equal(scheduleQuery('#modal').open,true);assert.equal(scheduleQuery('h2').textContent,'Einstellungen');assert.match(scheduleQuery('[data-edit-person="niko"] .person-weekly-hours').textContent,/31 h/);
scheduleQuery('[data-preset="prep"]').click();assert.ok(scheduleQuery('#hide-preset svg'));assert.equal(scheduleQuery('#hide-preset').getAttribute('aria-label'),'Aufgabenvorlage entfernen');scheduleDocument.dispatchEvent(new scheduleWindow.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(scheduleQuery('h2').textContent,'Einstellungen');assert.equal(scheduleQuery('#modal').open,true);scheduleQuery('#modal-close').click();assert.equal(scheduleQuery('#modal').open,false);
scheduleDocument.querySelectorAll('.day-head')[4].click();assert.equal(scheduleQuery('[data-person="niko"] time').textContent,'7 h');const friday=scheduleDocument.querySelectorAll('.day-cell')[4];friday.getBoundingClientRect=()=>({left:0,top:0,width:1200});scheduleQuery('[data-person="niko"]').click();scheduleDocument.querySelectorAll('.day-cell')[4].getBoundingClientRect=()=>({left:0,top:0,width:1200});scheduleDocument.querySelectorAll('.day-cell')[4].dispatchEvent(new scheduleWindow.MouseEvent('click',{clientX:100,clientY:100,bubbles:true}));assert.equal(scheduleSaved().shifts[0].length,7);
scheduleDocument.querySelectorAll('.day-column')[0].onpointerenter();assert.equal(scheduleQuery('[data-person="niko"] time').textContent,'8 h');scheduleDocument.querySelectorAll('.day-column')[0].onpointerleave();assert.equal(scheduleQuery('[data-person="niko"] time').textContent,'7 h');scheduleDocument.querySelectorAll('.day-head')[1].click();assert.equal(scheduleQuery('[data-person="niko"] time').textContent,'0 h');scheduleQuery('[data-person="niko"]').ondragstart({dataTransfer:transfer});const tuesday=scheduleDocument.querySelectorAll('.day-cell')[1];tuesday.getBoundingClientRect=()=>({left:0,top:0,width:1200});tuesday.ondragover({preventDefault(){},dataTransfer:transfer,target:tuesday,clientX:100,clientY:100});assert.equal(transfer.dropEffect,'copy');assert.equal(scheduleQuery('.drop-rejection'),null);assert.match(scheduleQuery('.drop-preview').textContent,/3 h/);tuesday.ondrop({preventDefault(){},target:tuesday,clientX:100,clientY:100});assert.equal(scheduleSaved().shifts.find(s=>s.person==='niko'&&s.date===tuesday.dataset.date).length,3);assert.deepEqual(scheduleSaved().people.find(person=>person.id==='niko').weekdayHours,[8,0,8,8,7,0,0]);scheduleWindow.close();
const boundaryFixture=structuredClone(snapshot);
boundaryFixture.shifts=[{id:'boundary-shift',person:'niko',date:snapshot.shifts[0].date,start:8,length:8,y:32,segments:[{id:'boundary-task',type:'flex',label:'Ganzer Tag',offset:0,duration:8}]}];
const boundaryDom=boot(boundaryFixture),bw=boundaryDom.window,bq=s=>bw.document.querySelector(s),bs=()=>JSON.parse(bw.localStorage.getItem('flow-plan-v1'));
bq('.shift-edit').click();
assert.equal(bq('[data-edge="task-start"]').hidden,false);
assert.equal(bq('[data-edge="task-end"]').hidden,false);
function resizeBoundary(edge,dx,cancel=false){
  const shift=bq('.shift'),handle=shift.querySelector(`[data-edge="${edge}"]`);
  shift.parentElement.getBoundingClientRect=()=>({width:1200});
  shift.onpointerdown({button:0,currentTarget:shift,target:handle,clientX:300,clientY:90,pointerId:1});
  bw.document.dispatchEvent(new bw.MouseEvent('pointermove',{clientX:300+dx,clientY:90,bubbles:true,cancelable:true}));
  bw.document.dispatchEvent(new bw.Event(cancel?'pointercancel':'pointerup'));
}
resizeBoundary('task-start',75);assert.equal(bs().shifts[0].segments[0].offset,1);assert.equal(bs().shifts[0].segments[0].duration,7);
resizeBoundary('task-end',-75);assert.equal(bs().shifts[0].segments[0].duration,6);
resizeBoundary('task-start',-150);assert.equal(bs().shifts[0].segments[0].offset,0);assert.equal(bs().shifts[0].segments[0].duration,7);
resizeBoundary('task-end',150);assert.equal(bs().shifts[0].segments[0].duration,8);assert.equal(bs().shifts[0].length,8);
const boundaryBefore=bs();resizeBoundary('task-start',75,true);assert.deepEqual(bs(),boundaryBefore);
resizeBoundary('task-end',-1200);assert.equal(bs().shifts[0].segments[0].duration,.25);assert.equal(bs().shifts[0].start,8);assert.equal(bs().shifts[0].length,8);
bq('[data-task="boundary-task"]').dispatchEvent(new bw.MouseEvent('dblclick',{bubbles:true}));
bw.eval("showToolkit('boundary-shift','boundary-task')");
assert.equal(bq('#whole-shift'),null);
bq('#tool-start').value='07:00';bq('#toolkit-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));
assert.equal(bq('#detail').hidden,false);assert.match(bq('#tool-error').textContent,/08:00/);
bq('#tool-start').value='08:00';bq('#tool-end').value='09:00';bq('#toolkit-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));
assert.equal(bq('#detail').hidden,true);assert.equal(bs().shifts[0].segments[0].duration,1);assert.equal(bq('.shift').classList.contains('editing'),true);
bq('#settings-button').click();
for(const theme of ['light','catppuccin','dark']){
  bq('#theme').value=theme;bq('#theme').dispatchEvent(new bw.Event('change'));
  assert.equal(bw.document.documentElement.dataset.theme,theme);assert.equal(bs().settings.theme,theme);
  assert.equal(bq('#modal').open,true);
  const themeReload=boot(bs());assert.equal(themeReload.window.document.documentElement.dataset.theme,theme);themeReload.window.close();
}
const invalidTheme=bs();invalidTheme.settings.theme='invalid';const fallback=boot(invalidTheme);assert.equal(fallback.window.document.documentElement.dataset.theme,'dark');fallback.window.close();bw.close();
{const tabsDom=boot(),tw=tabsDom.window,tq=sel=>tw.document.querySelector(sel),tabs=()=>[...tw.document.querySelectorAll('[role=tab]')];
tq('#settings-button').click();
assert.equal(tq('#settings-button').getAttribute('aria-label'),'Einstellungen');assert.equal(tq('#modal').classList.contains('settings-dialog'),true);
assert.deepEqual(tabs().map(t=>t.textContent.trim()),['Allgemein','Pausenregelung','Mitarbeitende','Aufgabenvorlagen','Updates']);
assert.equal(tq('[role=tablist]').getAttribute('aria-orientation'),'vertical');
assert.equal(tq('#settings-panel-general').hidden,false);assert.equal(tq('#settings-panel-people').hidden,true);assert.equal(tq('#settings-tab-general').getAttribute('aria-selected'),'true');
tq('#settings-tab-people').click();assert.equal(tq('#settings-panel-people').hidden,false);assert.equal(tq('#settings-panel-general').hidden,true);assert.equal(tq('#settings-tab-people').tabIndex,0);assert.equal(tq('#settings-tab-general').tabIndex,-1);
tq('#settings-tab-people').dispatchEvent(new tw.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(tq('#settings-panel-presets').hidden,false);assert.equal(tw.document.activeElement.id,'settings-tab-presets');
tq('#settings-tab-presets').dispatchEvent(new tw.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(tq('#settings-panel-updates').hidden,false);assert.match(tq('#update-panel').textContent,/Desktop-App/);
tq('#settings-tab-updates').dispatchEvent(new tw.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(tq('#settings-panel-general').hidden,false);
tq('#settings-tab-presets').click();tq('#new-preset').click();assert.equal(tq('#modal').classList.contains('settings-dialog'),false);tq('#modal-close').click();
assert.equal(tq('#settings-panel-presets').hidden,false);assert.equal(tw.document.activeElement.id,'new-preset');
tq('#modal-close').click();tq('#settings-button').click();assert.equal(tq('#settings-panel-presets').hidden,false);tw.close();
let updateListener,calls=[];const fakeDesktop={updateInfo:async()=>({version:'1.1.0',supported:true,status:'idle'}),checkForUpdates:async()=>{calls.push('check');updateListener({status:'available',latest:'1.2.0'});return {status:'available',latest:'1.2.0'};},downloadUpdate:async()=>{calls.push('download');return {status:'downloading',percent:0};},installUpdate:async()=>{calls.push('install');return {status:'downloaded'};},onUpdateStatus:callback=>{updateListener=callback;return ()=>{};}};
const updDom=boot(null,win=>{win.flowDesktop=fakeDesktop;}),uw=updDom.window,uq=sel=>uw.document.querySelector(sel),tick=()=>new Promise(r=>setTimeout(r,0));
await tick();uq('#settings-button').click();uq('#settings-tab-updates').click();
assert.match(uq('.update-version').textContent,/1\.1\.0/);assert.match(uq('.update-status').textContent,/Noch nicht/);
uq('#update-check').click();await tick();assert.deepEqual(calls,['check']);assert.match(uq('.update-status').textContent,/1\.2\.0 ist verfügbar/);
uq('#update-download').click();await tick();assert.equal(uq('#update-check').disabled,true);
updateListener({status:'downloading',percent:42});assert.equal(uq('.update-status progress').value,42);assert.match(uq('.update-status').textContent,/42 %/);
updateListener({status:'downloaded',latest:'1.2.0',percent:100});uq('#update-install').click();await tick();assert.deepEqual(calls,['check','download','install']);
updateListener({status:'error',error:'Netzwerk <weg>'});assert.equal(uq('.update-error').textContent,'Netzwerk <weg>');assert.equal(uq('.update-error').children.length,0);uw.close();
const lateDom=boot(null,win=>{win.flowDesktop={...fakeDesktop,updateInfo:async()=>({version:'1.1.0',supported:false,status:'idle',reason:'Paketmanager nutzen'})};}),lq=sel=>lateDom.window.document.querySelector(sel);
await tick();lq('#settings-button').click();lq('#settings-tab-updates').click();assert.match(lq('.update-note').textContent,/Paketmanager/);assert.equal(lq('#update-check'),null);lateDom.window.close();
const toastDom=boot(null,win=>{win.flowDesktop=fakeDesktop;});await tick();updateListener({status:'available',latest:'1.3.0'});assert.equal(toastDom.window.document.querySelector('#toast').hidden,false);assert.match(toastDom.window.document.querySelector('#toast').textContent,/1\.3\.0/);toastDom.window.close();}
// Folded days retain an accessible miniature of every active shift.
{
const miniFixture=structuredClone(snapshot);miniFixture.people.forEach(p=>{p.from='';p.until='';});
const firstDate=miniFixture.shifts[0].date,nextDate=new Date(firstDate+'T12:00:00');nextDate.setDate(nextDate.getDate()+1);
const secondDate=`${nextDate.getFullYear()}-${String(nextDate.getMonth()+1).padStart(2,'0')}-${String(nextDate.getDate()).padStart(2,'0')}`;
miniFixture.shifts=[
  {id:'mini-monday',person:'niko',date:firstDate,start:10,length:6,y:32,segments:[{id:'mini-task',type:'flex',label:'Team <Meeting>',color:'#112233',offset:0,duration:2}]},
  {id:'mini-tuesday',person:'kayla',date:secondDate,start:8,length:8,y:32,segments:[]}
];
const md=boot(miniFixture),mw=md.window,mq=s=>mw.document.querySelector(s),mall=s=>[...mw.document.querySelectorAll(s)],ms=()=>mw.localStorage.getItem('flow-plan-v1');
const beforeMini=ms();
assert.equal(mall('.day-mini-shift').length,2);assert.equal(mall('.day-miniatures:not([hidden])').length,0);
mq('[data-date="'+secondDate+'"].day-head').click();
assert.equal(mq('[data-mini-shift="mini-monday"]').closest('.day-column').classList.contains('folded'),true);
assert.equal(mq('[data-mini-shift="mini-monday"]').parentElement.hidden,false);
assert.equal(mq('[data-shift="mini-monday"]').inert,true);
assert.equal(mq('[data-shift="mini-tuesday"]').inert,false);
assert.equal(mq('[data-mini-shift="mini-tuesday"]').parentElement.hidden,true);
assert.match(mq('[data-mini-shift="mini-monday"]').title,/Team <Meeting>: 10:00–12:00/);
assert.equal(mq('.day-mini-bar').style.left,'12.5%');assert.equal(mq('.day-mini-bar').style.width,'37.5%');
assert.equal(mq('.day-mini-bar').children.length,1);
assert.equal(mq('.day-mini-bar>span').style.width,2/6*100+'%');
assert.equal(mq('.day-mini-bar>span').style.background,'rgb(17, 34, 51)');
assert.equal(mq('[data-mini-shift="mini-monday"]').style.getPropertyValue('--person'),miniFixture.people.find(p=>p.id==='niko').color);
assert.equal(mq('[data-mini-shift="mini-monday"]').textContent,'');
assert.match(mq('[data-mini-shift="mini-monday"]').getAttribute('aria-label'),/Niko, 10:00–16:00 \(6 h\), Tag öffnen/);
assert.equal(mq('[data-mini-shift="mini-monday"]').querySelector('meeting'),null);
mq('[data-person="lea"]').click();
mq('[data-mini-shift="mini-monday"]').click();
assert.equal(mq('.expanded').dataset.date,firstDate);assert.equal(mq('[data-mini-shift="mini-tuesday"]').parentElement.hidden,false);
assert.equal(mw.document.activeElement,mq('[data-date="'+firstDate+'"].day-head'));assert.equal(ms(),beforeMini);
mq('[data-mini-shift="mini-tuesday"]').focus();mq('[data-mini-shift="mini-tuesday"]').click();
assert.equal(mq('.expanded').dataset.date,secondDate);assert.equal(ms(),beforeMini);
mq('[data-date="'+secondDate+'"].day-head').click();
assert.equal(mq('.folded'),null);assert.equal(mall('.day-miniatures:not([hidden])').length,0);assert.ok(mall('.shift').every(el=>!el.inert));
mq('#next').click();assert.equal(mall('.day-mini-shift').length,0);md.window.close();
}
{
const bd=boot(),bw=bd.window,bq=s=>bw.document.querySelector(s),run=code=>bw.runCanvasCode(code);
bq('#settings-button').click();
assert.equal(bq('#settings-panel-breaks').hidden,true);
assert.equal(bq('#settings-panel-general #break-form'),null);
bq('#settings-tab-general').dispatchEvent(new bw.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
assert.equal(bq('#settings-panel-breaks').hidden,false);
assert.equal(bw.document.activeElement.id,'settings-tab-breaks');
bq('#example-break-rules').click();
assert.equal(run('breakRules().length'),0);
bq('#break-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));
assert.equal(run('breakRules().length'),2);
for(const [gross,expected] of [[5.75,0],[6,30],[8.99,30],[9,45],[10,45]]){
  assert.equal(run(`breakMinutes(${Math.round(gross*60)})`),expected);
}
for(const [net,gross] of [[5.5,5.5],[5.75,5.75],[6,6.5],[8,8.5],[8.5,9.25],[9,9.75]]){
  assert.equal(run(`attendanceHours(${net})`),gross);
}
const split="[{person:'niko',date:'2026-10-12',length:3},{person:'niko',date:'2026-10-12',length:3},{person:'kayla',date:'2026-10-12',length:3},{person:'niko',date:'2026-10-13',length:3}]";
assert.equal(run(`workTotals(${split}).net`),11.5);
assert.equal(run(`shiftWork(${split}[0],${split}).pause`),.25);
bq('#modal-close').click();
const breakTransfer={setData(){},effectAllowed:'',dropEffect:''};
bq('[data-person="niko"]').ondragstart({dataTransfer:breakTransfer});
bq('.day-cell').getBoundingClientRect=()=>({left:0,top:0,width:1200});
bq('.day-cell').ondragover({preventDefault(){},dataTransfer:breakTransfer,target:bq('.day-cell'),clientX:0,clientY:32});
assert.equal(parseFloat(bq('.drop-preview').style.width),8.5/16*100);
assert.match(bq('[data-person="niko"]').title,/8 h netto.*8,5 h Anwesenheit/);
bq('[data-person="niko"]').ondragend();bq('[data-person="niko"]').click();
bq('.day-cell').getBoundingClientRect=()=>({left:0,top:0,width:1200});
bq('.day-cell').dispatchEvent(new bw.MouseEvent('click',{clientX:0,clientY:32,bubbles:true}));
assert.equal(run('data.shifts[0].length'),8.5);assert.equal(run('data.shifts[0].start'),8);
assert.equal(bq('.shift-time').textContent,'08:00–16:30 (8 h)');
assert.match(bq('.shift').getAttribute('aria-label'),/\(8 h\) netto/);
run('download=(content,type,name)=>{window.csvContent=content;};exportCSV();');
assert.match(bw.csvContent,/"8.5";"0.5";"8"/);
run('showToolkit(data.shifts[0].id);');
bq('#tool-end').value='17:00';bq('#toolkit-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));
assert.equal(run('workTotals(data.shifts).net'),8.25);
assert.equal(bq('.shift-time').textContent,'08:00–17:00 (8,25 h)');
run('showToolkit(data.shifts[0].id);');
bq('#tool-end').value='16:30';bq('#toolkit-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));
run('copyShift(data.shifts[0].id);placeCopy(dateKey(addDays(week,1)));');
assert.equal(run('data.shifts[1].length'),8.5);assert.equal(run('workTotals(data.shifts).net'),16);
run('data.shifts.pop();persist();refresh();');
assert.ok(bq(`[data-copy-day="${run('dateKey(week)')}"]`));run('copyDay(dateKey(week));');assert.ok(bq('#copy-badge.day-copy-badge'));
const dayTarget=run('dateKey(addDays(week,2))');assert.equal(run(`dayCopyBlocked(dateKey(week))`),'Das ist der kopierte Tag');run(`placeDayCopy('${dayTarget}')`);
assert.equal(run(`data.shifts.filter(s=>s.date==='${dayTarget}').length`),1);assert.equal(run(`data.shifts.find(s=>s.date==='${dayTarget}').length`),run('data.shifts[0].length'));assert.notEqual(run(`data.shifts.find(s=>s.date==='${dayTarget}').id`),run('data.shifts[0].id'));
assert.match(run(`dayCopyBlocked('${dayTarget}')`),/bereits eingeplant/);bq('#toast button').click();assert.equal(run('data.shifts.length'),1);run('copiedDay=null;renderCopyTray();');
bq('#week-info-toggle').click();assert.match(bq('.weekly-comparison').textContent,/8 h Ist \(netto\)/);
assert.match(bq('.weekly-tasks').textContent,/8,5 h Anwesenheit.*0,5 h Pause/);
const shiftBefore=run('JSON.stringify(data.shifts)');
bq('#settings-button').click();
const rows=[...bw.document.querySelectorAll('.break-rule')];
rows[1].querySelector('[name=minutes]').value=40;
bq('#break-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));
assert.equal(run('breakMinutes(540)'),40);assert.equal(run('fmtTime(8+attendanceHours(9))'),'17:40');
rows[1].querySelector('[name=after]').value=6;
bq('#break-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));
assert.match(bq('#break-error').textContent,/eindeutige/);assert.equal(run('breakRules()[1].after'),9);
rows[1].querySelector('[name=after]').value=9;rows[1].querySelector('[name=minutes]').value=20;
bq('#break-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));assert.match(bq('#break-error').textContent,/nicht abnehmende/);
assert.equal(run('JSON.stringify(data.shifts)'),shiftBefore);
const reloaded=boot(JSON.parse(bw.localStorage.getItem('flow-plan-v1')));
assert.equal(reloaded.window.runCanvasCode('breakRules()[1].minutes'),40);reloaded.window.close();
rows.forEach(row=>row.querySelector('button').click());bq('#break-form').dispatchEvent(new bw.Event('submit',{cancelable:true}));
assert.equal(run('workTotals(data.shifts).net'),8.5);assert.equal(run('JSON.stringify(data.shifts)'),shiftBefore);
assert.equal(bq('.shift-time').textContent,'08:00–16:30 (8,5 h)');
run('data.settings.breakRules=[{after:6,minutes:30}];data.people[0].weekdayHours=Array(7).fill(16);drag={kind:"person",id:data.people[0].id};');
assert.match(run('dropBlocked(dateKey(addDays(week,1)))'),/einschließlich Pause/);
run('drag=null;createShift(data.people[0].id,dateKey(addDays(week,1)));');
assert.match(bq('#toast').textContent,/passen nicht/);assert.equal(run('data.shifts.length'),1);
bw.close();
}
{
const cd=boot(),cw=cd.window,cq=s=>cw.document.querySelector(s),run=code=>cw.runCanvasCode(code),stored=()=>cw.localStorage.getItem('flow-plan-v1');
run(`week=parseDate('2028-02-28');data.shifts=[
{id:'calendar-one',person:'niko',date:'2028-02-29',start:8,length:4,y:32,segments:[]},
{id:'calendar-weekend',person:'kayla',date:'2028-03-04',start:8,length:4,y:32,segments:[]},
{id:'calendar-year',person:'niko',date:'2029-01-01',start:8,length:4,y:32,segments:[]}
];refresh();persist();`);
const before=stored();
cq('#date-range').click();assert.equal(cq('#month-picker').hidden,false);
assert.equal(cq('#date-range').getAttribute('aria-expanded'),'true');
assert.match(cq('.month-picker-heading strong').textContent,/Februar 2028/);
assert.ok(cq('.month-picker-heading .calendar-dot'));
assert.equal(cw.document.querySelectorAll('[data-calendar-date]').length,42);
assert.ok(cq('[data-calendar-date="2028-02-29"] .calendar-dot'));
assert.ok(cq('[data-calendar-date="2028-03-04"] .calendar-dot'));
assert.equal(cq('[data-calendar-date="2028-02-28"] .calendar-dot'),null);
assert.equal(cw.document.querySelectorAll('.selected-week').length,7);
assert.equal(cw.document.activeElement.dataset.calendarDate,'2028-02-28');
cq('[data-calendar-date="2028-02-29"]').focus();
cq('[data-calendar-date="2028-02-29"]').dispatchEvent(new cw.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
assert.match(cq('.month-picker-heading strong').textContent,/März 2028/);
assert.equal(cw.document.activeElement.dataset.calendarDate,'2028-03-01');
cq('[data-calendar-date="2028-03-04"]').click();
assert.equal(run('dateKey(week)'),'2028-02-28');assert.equal(cq('#month-picker').hidden,true);
assert.equal(cw.document.activeElement.id,'date-range');assert.equal(stored(),before);
cq('#date-range').click();cq('[data-month-step="-1"]').click();
assert.match(cq('.month-picker-heading strong').textContent,/Januar 2028/);assert.equal(cq('.month-picker-heading .calendar-dot'),null);
cq('[data-month-step="-1"]').click();assert.match(cq('.month-picker-heading strong').textContent,/Dezember 2027/);
cq('[data-month-step="1"]').click();assert.match(cq('.month-picker-heading strong').textContent,/Januar 2028/);
cq('[data-month-step="1"]').dispatchEvent(new cw.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
assert.equal(cq('#month-picker').hidden,true);assert.equal(cw.document.activeElement.id,'date-range');
cq('#date-range').click();cq('#next').click();assert.equal(cq('#month-picker').hidden,true);
cq('#date-range').click();cq('#today').focus();assert.equal(cq('#month-picker').hidden,true);
run(`week=parseDate('2028-12-25');refresh();`);
cq('#date-range').click();cq('[data-month-step="1"]').click();assert.match(cq('.month-picker-heading strong').textContent,/Januar 2029/);
assert.ok(cq('.month-picker-heading .calendar-dot'));
cq('[data-calendar-date="2029-01-01"]').click();assert.equal(run('dateKey(week)'),'2029-01-01');
assert.equal(stored(),before);cw.close();
}
{
const bg=boot(),bw=bg.window,bq=s=>bw.document.querySelector(s);
bq('#settings-button').click();assert.equal(bw.document.querySelectorAll('[name=background]').length,5);
for(const id of ['car','city','forest','snow']){
  bq(`[name=background][value="${id}"]`).click();
  assert.equal(JSON.parse(bw.localStorage.getItem('flow-plan-v1')).settings.background,id);
  assert.equal(bw.document.documentElement.classList.contains('has-background'),true);
  assert.match(bw.document.documentElement.style.getPropertyValue('--background-image'),/assets/);
}
const reloaded=boot(JSON.parse(bw.localStorage.getItem('flow-plan-v1')));
assert.match(reloaded.window.document.documentElement.style.getPropertyValue('--background-image'),/snowy/);reloaded.window.close();
bq('[name=background][value=""]').click();assert.equal(bw.document.documentElement.classList.contains('has-background'),false);
assert.equal(bw.document.documentElement.style.getPropertyValue('--background-image'),'');bw.close();
}
{
  // Whole-week copies include hidden weekends and preserve weekdays across DST/year boundaries.
  for(const start of ['2026-10-19','2026-12-28']){
    const wd=boot(),ww=wd.window,wq=s=>ww.document.querySelector(s),run=code=>ww.runCanvasCode(code);
    const shifts=()=>JSON.parse(run('JSON.stringify(data.shifts)'));
    run(`week=parseDate('${start}');data.shifts=[
      {id:'week-mon-a',person:'niko',date:dateKey(week),start:8,length:3,y:32,segments:[{id:'week-task',type:'flex',label:'Team <Meeting>',color:'#112233',offset:.5,duration:2}]},
      {id:'week-mon-b',person:'niko',date:dateKey(week),start:13,length:4,y:88,segments:[]},
      {id:'week-tue',person:'kayla',date:dateKey(addDays(week,1)),start:9,length:8,y:32,segments:[]},
      {id:'week-fri',person:'sam',date:dateKey(addDays(week,4)),start:10,length:6,y:32,segments:[]},
      {id:'week-sun',person:'lea',date:dateKey(addDays(week,6)),start:12,length:5,y:32,segments:[]}
    ];persist();refresh();expandDay(dateKey(addDays(week,1)));`);
    const source=shifts();
    assert.equal(wq('#week-number').tagName,'BUTTON');
    wq('#week-number').click();
    assert.equal(wq('#month-picker').hidden,true);
    assert.ok(wq('#copy-badge.week-copy-badge'));
    assert.match(wq('#copy-badge').textContent,/5 Schichten/);
    assert.equal(run('copiedWeek.shifts.length'),5);
    const dt={setData(_type,value){this.payload=JSON.parse(value);},effectAllowed:'',dropEffect:''};
    const dragEvent=(type,target)=>{const e=new ww.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:dt});target.dispatchEvent(e);return e;};
    dragEvent('dragstart',wq('#copy-badge'));
    assert.equal(dt.payload.kind,'week-copy');
    dragEvent('dragover',wq('.day-head'));assert.equal(dt.dropEffect,'none');
    assert.match(wq('.week-copy-hint').textContent,/kopierte Woche/);
    dragEvent('drop',wq('.day-cell'));assert.deepEqual(shifts(),source);
    assert.equal(wq('.week-copy-hint'),null);
    wq('#next').click();
    const targetWeek=run('dateKey(week)');
    assert.equal(run('copiedWeek.date'),start);
    assert.equal(run('focusDate'),null);
    run(`data.people.find(p=>p.id==='kayla').until='${start}';
      data.shifts.push({id:'week-existing',person:'sam',date:dateKey(addDays(week,4)),start:8,length:2,y:32,segments:[]});
      data.shifts.find(s=>s.id==='week-mon-a').segments[0].label='Source edited after copying';persist();refresh();`);
    const before=shifts();
    dragEvent('dragstart',wq('#copy-badge'));
    dragEvent('dragover',ww.document.querySelectorAll('.day-head')[1]);
    assert.equal(dt.dropEffect,'copy');assert.match(wq('.week-copy-hint').textContent,/3 Schichten einfügen · 2 übersprungen/);
    // Drop over an existing shift: date mapping still follows the copied weekdays.
    dragEvent('drop',wq('[data-shift="week-existing"]'));
    const after=shifts(),created=after.filter(s=>!before.some(old=>old.id===s.id));
    assert.equal(created.length,3);
    assert.deepEqual(created.map(s=>s.date),[targetWeek,targetWeek,run('dateKey(addDays(week,6))')]);
    assert.deepEqual(created.map(s=>s.y),[32,88,32]);
    for(const [copy,original] of [[created[0],source[0]],[created[1],source[1]],[created[2],source[4]]]){
      const strip=s=>{const {id,date,y,...rest}=s;return {...rest,segments:s.segments.map(({id,...t})=>t)};};
      assert.deepEqual(strip(copy),strip(original));assert.notEqual(copy.id,original.id);
    }
    assert.notEqual(created[0].segments[0].id,source[0].segments[0].id);
    assert.deepEqual(after.filter(s=>before.some(old=>old.id===s.id)),before);
    assert.equal(wq('.week-copy-hint'),null);assert.equal(wq('.week-copy-target'),null);
    assert.equal(wq('#copy-tray').hidden,false);
    assert.deepEqual(JSON.parse(ww.localStorage.getItem('flow-plan-v1')).shifts,after);
    wq('#toast button').click();assert.deepEqual(shifts(),before);
    // Keyboard fallback and duplicate prevention operate on the full target week.
    wq('#copy-badge').click();
    wq('.day-cell').dispatchEvent(new ww.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    assert.equal(shifts().length,before.length+3);
    wq('#copy-badge').click();wq('.day-cell').click();
    assert.equal(shifts().length,before.length+3);assert.match(wq('#toast').textContent,/bereits eingeplant/);
    // The same pill can populate a further week, and Escape clears its preview.
    wq('#next').click();dragEvent('dragstart',wq('#copy-badge'));dragEvent('dragover',wq('#grid-scroll'));
    assert.equal(dt.dropEffect,'copy');
    ww.document.dispatchEvent(new ww.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(wq('.week-copy-hint'),null);assert.equal(run('drag'),null);
    dragEvent('dragstart',wq('#copy-badge'));dragEvent('dragover',wq('#grid-scroll'));
    wq('#grid-scroll').dispatchEvent(new ww.Event('dragleave',{bubbles:true}));assert.equal(wq('.week-copy-hint'),null);
    dragEvent('drop',wq('.canvas-surface'));assert.equal(shifts().length,before.length+7);
    const restored=boot(JSON.parse(ww.localStorage.getItem('flow-plan-v1')));
    assert.equal(restored.window.runCanvasCode('data.shifts.length'),shifts().length);restored.window.close();
    wq('#dismiss-copy').click();assert.equal(wq('#copy-tray').hidden,true);assert.equal(run('copiedWeek'),null);
    ww.close();
  }
  const wd=boot(),ww=wd.window,wq=s=>ww.document.querySelector(s),run=code=>ww.runCanvasCode(code);
  wq('#week-number').click();assert.equal(wq('#copy-tray').hidden,true);assert.match(wq('#toast').textContent,/keine Schichten/);
  run(`createShift('niko',dateKey(week));`);wq('#week-number').click();
  run('copyDay(dateKey(week))');assert.equal(run('copiedWeek'),null);
  wq('#week-number').click();run('copyShift(data.shifts[0].id)');assert.equal(run('copiedWeek'),null);
  wq('#week-number').click();run(`data.shifts[0].segments.push({id:'replace-task',type:'open',offset:0,duration:1});copyTask(data.shifts[0].id,'replace-task')`);assert.equal(run('copiedWeek'),null);
  wq('#week-number').click();assert.equal(run('copiedTask'),null);assert.equal(run('copiedShift'),null);assert.equal(run('copiedDay'),null);
  ww.close();
}
{
  let now=0,nextFrame=0,reduced=false;const frames=new Map();
  const ad=boot(undefined,aw=>{
    aw.performance.now=()=>now;
    aw.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id;};
    aw.cancelAnimationFrame=id=>frames.delete(id);
    aw.matchMedia=query=>({matches:query==='(prefers-reduced-motion: reduce)'&&reduced});
  }),aw=ad.window,aq=s=>aw.document.querySelector(s),run=code=>aw.runCanvasCode(code);
  const advance=ms=>{now+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(now));};
  const value=()=>run('dockHourAnimations.get(document.querySelector(".token-hours")).value');
  run(`data.people[0].weekdayHours=[8,6.25,10.5,0,8,8,8];refresh();updateDockHours(dateKey(week),false);persist()`);
  const before=aw.localStorage.getItem('flow-plan-v1');
  assert.equal(aq('.token-hours').textContent,'8 h');
  aq('.day-column:nth-child(2)').onpointerenter();
  assert.equal(aq('.token-hours').textContent,'8 h');
  assert.match(aq('.token').getAttribute('aria-label'),/6,25 h/);
  const seen=[aq('.token-hours').textContent];
  for(let i=0;i<30;i++){
    // Repeated dragovers/hover updates must not restart the transition.
    run('updateDockHours(dateKey(addDays(week,1)))');advance(16);
    if(seen.at(-1)!==aq('.token-hours').textContent)seen.push(aq('.token-hours').textContent);
  }
  assert.deepEqual(seen,['8 h','7,75 h','7,5 h','7,25 h','7 h','6,75 h','6,5 h','6,25 h']);
  run('updateDockHours(dateKey(addDays(week,2)))');advance(110);
  const interrupted=value();assert.ok(interrupted>6.25&&interrupted<10.5);
  run('updateDockHours(dateKey(addDays(week,3)))');assert.equal(value(),interrupted);
  let last=interrupted;
  for(let i=0;i<50;i++){advance(16);assert.ok(value()<=last&&value()>=0);last=value();}
  assert.equal(value(),0);assert.equal(aq('.token-hours').textContent,'0 h');
  assert.equal(run('dockHourAnimations.get(document.querySelector(".token-hours")).frame'),null);
  // Reduced motion also completes an already-running transition immediately.
  run('updateDockHours(dateKey(week))');advance(32);reduced=true;
  run('updateDockHours(dateKey(week))');assert.equal(value(),8);
  assert.equal(run('dockHourAnimations.get(document.querySelector(".token-hours")).frame'),null);
  reduced=false;run('updateDockHours(dateKey(addDays(week,1)))');
  const pendingFrame=run('dockHourAnimations.get(document.querySelector(".token-hours")).frame');
  run('renderDock()');assert.equal(frames.has(pendingFrame),false);
  assert.equal(aw.localStorage.getItem('flow-plan-v1'),before);
  assert.ok(aq('.token time').dataset.dayHours.includes('7,75 h'));
  aw.close();
}
console.log('PASS: canvas interactions, boundary resizing, apply/validation, themes/backgrounds/persistence, settings tabs, updates, weekly schedules, animated hours/retargeting/reduced motion, copies, whole-week drag/drop/undo, DST/year mapping, folded-day miniatures, break rules/net totals, month calendar/navigation, migration and reload.');w.close();
