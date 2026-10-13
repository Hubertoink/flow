// Keep the v1 storage key so existing plans migrate without losing their history.
let data;
try { data=JSON.parse(localStorage.getItem('flow-plan-v1')); } catch {}
if(!data || !Array.isArray(data.people) || !Array.isArray(data.shifts)) data={version:3,people:structuredClone(initialPeople),shifts:[],settings:{weekend:false}};
if(Array.isArray(data.taskTypes))tasks.splice(0,tasks.length,...data.taskTypes);
if(!tasks.some(t=>t.id==='flex'))tasks.push({id:'flex',name:'Flexible Aufgabe',color:'#b9a5eb'});
data.settings ||= {weekend:false};
data.people.forEach(p=>{p.hours ??= p.end-p.start; p.from ||= ''; p.until ||= '';});
data.shifts.forEach((s,index)=>{
  s.y ??= 32+data.shifts.slice(0,index).filter(x=>x.date===s.date).length*64;
  s.length ??= s.segments.reduce((n,t)=>n+Number(t.duration),0);
  let offset=0;
  s.segments.forEach(t=>{t.offset ??= offset; offset+=Number(t.duration); t.id ||= uid();});
});
data.version=3;
let week=monday(parseDate(todayKey())), focusDate=null, selected=null, editing=null, picked=null, drag=null, gesture=null, suppressClick=false, toastTimer,expandTimer,hoverDay;
const DAY_START=8, DAY_END=24, DAY_SPAN=DAY_END-DAY_START;
let zoom=Number(data.settings.zoom)||1;
const snap=n=>Math.round(n*4)/4, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const activeOn=(p,date)=>(!p.from || date>=p.from)&&(!p.until || date<=p.until);
const dates=()=>Array.from({length:data.settings.weekend?7:5},(_,i)=>addDays(week,i));
const visiblePeople=()=>data.people.filter(p=>dates().some(d=>activeOn(p,dateKey(d))));
const duration=s=>s.length;
const getShift=id=>data.shifts.find(s=>s.id===id);
function persist(){data.taskTypes=tasks;try{localStorage.setItem('flow-plan-v1',JSON.stringify(data));}catch{toast('Speichern fehlgeschlagen. Bitte den Plan über das Menü exportieren.');}}
function toast(message,undo){clearTimeout(toastTimer);const el=$('#toast');el.innerHTML=`<span>${esc(message)}</span>${undo?'<button>Rückgängig</button>':''}`;el.hidden=false;if(undo)el.querySelector('button').onclick=()=>{undo();el.hidden=true;};toastTimer=setTimeout(()=>el.hidden=true,6000);}
function isoWeek(d){const v=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));v.setUTCDate(v.getUTCDate()+3);return Math.ceil(((v-Date.UTC(v.getUTCFullYear(),0,1))/86400000+1)/7);}
function refresh(){renderDock();renderTimeline();}
function renderDock(){
  const people=visiblePeople(); $('#staff-count').textContent=people.length;
  $('#tokens').innerHTML=people.map(p=>`<button class="token ${picked===p.id?'selected':''}" draggable="true" data-person="${esc(p.id)}" style="--person:${p.color}" aria-label="${esc(p.name)}, ${hours(p.hours)}, einplanen"><span class="dot"></span><strong>${esc(p.name)}</strong><time>${hours(p.hours)}</time></button>`).join('');
  document.querySelectorAll('.token').forEach(el=>{
    el.ondragstart=e=>{drag={kind:'person',id:el.dataset.person};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='copy';closePanel();};
    el.ondragend=clearDrop;
    el.onclick=()=>{picked=picked===el.dataset.person?null:el.dataset.person;refresh();};
  });
}
function shiftMarkup(s){
  const p=data.people.find(p=>p.id===s.person);
  return `<div class="shift ${editing===s.id?'editing':''}" tabindex="0" role="group" data-shift="${s.id}" style="--person:${p.color};--start:${(s.start-DAY_START)/DAY_SPAN};--duration:${s.length/DAY_SPAN};top:${s.y}px" aria-label="${esc(p.name)}, ${fmtTime(s.start)} bis ${fmtTime(s.start+s.length)}, ${hours(s.length)}"><div class="task-track">${s.segments.map(t=>`<button class="segment" data-task="${t.id}" style="--segment:${task(t.type).color};left:${t.offset/s.length*100}%;width:${t.duration/s.length*100}%" aria-label="${esc(t.label||task(t.type).name)}, ${fmtTime(s.start+t.offset)} bis ${fmtTime(s.start+t.offset+t.duration)}"><b>${esc(t.label||task(t.type).name)}</b><span class="task-resize task-start" ${t.offset===0?'hidden':''} data-edge="task-start" title="Aufgaben aufteilen"></span><span class="task-resize" ${t.offset+t.duration===s.length?'hidden':''} data-edge="task-end" title="Aufgaben aufteilen"></span></button>`).join('')}</div><span class="shift-meta"><span class="shift-name">${esc(p.name)}</span><time class="shift-time">${fmtTime(s.start)}–${fmtTime(s.start+s.length)}</time></span><button class="shift-edit" title="Bearbeitungsmodus umschalten" aria-pressed="${editing===s.id}" aria-label="${esc(p.name)} bearbeiten">${icon('edit')}</button><span class="resize-handle start" data-edge="start" title="Schichtbeginn ändern"></span><span class="resize-handle end" data-edge="end" title="Schichtende ändern"></span></div>`;
}
function renderTimeline(){
  const ds=dates(),last=addDays(week,6);
  $('#date-range').textContent=`${week.toLocaleDateString('de-DE',{day:'numeric',month:'short'})} – ${last.toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'})}`;
  $('#week-number').textContent='KW '+isoWeek(week);
  const grid=$('#timeline'); grid.style.setProperty('--days',ds.length);
  grid.innerHTML=ds.map(d=>{const key=dateKey(d),shifts=data.shifts.filter(s=>s.date===key&&activeOn(data.people.find(p=>p.id===s.person),key));return `<section class="day-column" data-date="${key}"><button class="day-head ${key===todayKey()?'current':''}" data-date="${key}" aria-label="${d.toLocaleDateString('de-DE',{weekday:'long'})} öffnen"><span class="day-title"><span class="day-name">${d.toLocaleDateString('de-DE',{weekday:'long'})}</span><span class="day-short">${d.toLocaleDateString('de-DE',{weekday:'short'})}</span><span class="day-date">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</span></span><span class="hours">${[8,10,12,14,16,18,20,22,24].map(h=>`<span>${String(h).padStart(2,'0')}</span>`).join('')}</span></button><div class="day-cell" data-date="${key}" tabindex="0" aria-label="${d.toLocaleDateString('de-DE',{weekday:'long'})}, Schicht platzieren" style="min-height:${Math.max(440,...shifts.map(s=>s.y+100))}px">${shifts.map(shiftMarkup).join('')}</div></section>`;}).join('');
  updateFocus();applyZoom();
  grid.querySelectorAll('.day-head').forEach(b=>{b.onclick=()=>expandDay(focusDate===b.dataset.date?null:b.dataset.date);b.ondragover=e=>{if(drag){e.preventDefault();const blocked=dropBlocked(b.dataset.date);e.dataTransfer.dropEffect=blocked?'none':'copy';const cell=b.parentElement.querySelector('.day-cell');if(blocked)previewDrop(cell,e);else queueExpand(b.dataset.date);}};b.ondrop=e=>{e.preventDefault();if(drag?.kind==='person')createShift(drag.id,b.dataset.date,8,32);clearDrop();};});
  grid.querySelectorAll('.day-cell').forEach(cell=>{
    cell.ondragover=e=>{if(!drag)return;e.preventDefault();if(drag.kind==='person'&&!dropBlocked(cell.dataset.date))queueExpand(cell.dataset.date);previewDrop(cell,e);};
    cell.ondragleave=e=>{if(!cell.contains(e.relatedTarget))removePreview(cell);};
    cell.ondrop=e=>{e.preventDefault();removePreview(cell);if(!drag)return;const payload=drag;clearDrop();if(payload.kind==='person')createShift(payload.id,cell.dataset.date,hourAt(cell,e.clientX),yAt(cell,e.clientY));else {const s=getShift(e.target.closest('.shift')?.dataset.shift);if(s)addTask(s,payload.id,hourAt(cell,e.clientX)-s.start);}};
    cell.onclick=e=>{if(suppressClick||e.target.closest('.shift'))return;if(picked)createShift(picked,cell.dataset.date,hourAt(cell,e.clientX),yAt(cell,e.clientY));else {editing=null;closePanel();renderTimeline();}};
    cell.onkeydown=e=>{if(e.target===cell&&picked&&(e.key==='Enter'||e.key===' ')){e.preventDefault();createShift(picked,cell.dataset.date,8,32);}};
  });
  grid.querySelectorAll('.shift').forEach(el=>{
    el.onpointerdown=startGesture;
    el.oncontextmenu=e=>{e.preventDefault();showToolkit(el.dataset.shift);};
    el.ondblclick=e=>{if(!e.target.closest('button'))showToolkit(el.dataset.shift);};
    el.onclick=e=>{e.stopPropagation();if(suppressClick)return;selected=el.dataset.shift;if(e.target.closest('.shift-edit')){toggleEditing(el.dataset.shift);}else if(editing===el.dataset.shift&&e.target.closest('[data-task]'))showToolkit(el.dataset.shift,e.target.closest('[data-task]').dataset.task);};
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){if(e.target.closest('.shift-edit'))return;e.preventDefault();const taskId=e.target.closest('[data-task]')?.dataset.task;if(taskId&&editing===el.dataset.shift)showToolkit(el.dataset.shift,taskId);else toggleEditing(el.dataset.shift);}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const s=getShift(el.dataset.shift);s.start=clamp(s.start+(e.key==='ArrowRight'?.25:-.25),8,DAY_END-s.length);persist();renderTimeline();document.querySelector(`[data-shift="${s.id}"]`)?.focus();}};
  });
}
function toggleEditing(id){const next=editing===id?null:id;closePanel();editing=next;selected=next;renderTimeline();document.querySelector(`[data-shift="${id}"] .shift-edit`)?.focus();}
function applyZoom(){const grid=$('#timeline'),scroll=$('#grid-scroll');grid.style.transform=`scale(${zoom})`;scroll.style.scrollPaddingTop=(80*zoom)+'px';grid.style.width=Math.max(720,scroll.clientWidth||720)+'px';grid.style.minHeight=Math.max(440,scroll.clientHeight/zoom)+'px';const surface=$('.canvas-surface');surface.style.width=(Math.max(720,scroll.clientWidth||720)*zoom)+'px';surface.style.height=(Math.max(grid.scrollHeight,440,scroll.clientHeight/zoom)*zoom)+'px';$('#zoom-value').textContent=Math.round(zoom*100)+'%';$('#zoom-out').disabled=zoom<=.75;$('#zoom-in').disabled=zoom>=1.75;}
function setZoom(value){zoom=clamp(Math.round(value*100)/100,.75,1.75);data.settings.zoom=zoom;closePanel();applyZoom();persist();}
function updateFocus(){const ds=dates();$('#timeline').style.gridTemplateColumns=ds.map(d=>`minmax(0,${focusDate&&dateKey(d)===focusDate?12:1}fr)`).join(' ');document.querySelectorAll('.day-column').forEach(el=>{el.classList.toggle('folded',!!focusDate&&el.dataset.date!==focusDate);el.classList.toggle('expanded',el.dataset.date===focusDate);});}
function expandDay(date){closePanel();focusDate=date;updateFocus();}
function queueExpand(date){if(focusDate===date||hoverDay===date)return;clearTimeout(expandTimer);hoverDay=date;expandTimer=setTimeout(()=>{expandDay(date);hoverDay=null;},220);}
function yAt(cell,y){return Math.max(32,Math.round(((y-cell.getBoundingClientRect().top)/zoom-20)/16)*16);}
function freeY(date,wanted,ignore){let y=Math.max(32,wanted);while(data.shifts.some(s=>s.id!==ignore&&s.date===date&&Math.abs(s.y-y)<56))y+=64;return y;}
function hourAt(cell,x){const r=cell.getBoundingClientRect();return snap(8+(x-r.left)/r.width*DAY_SPAN);}
function removePreview(cell){cell.classList.remove('drag-over','drop-blocked');cell.querySelector('.drop-preview')?.remove();cell.querySelector('.drop-rejection')?.remove();}
function dropBlocked(date){if(drag?.kind!=='person')return '';const p=data.people.find(p=>p.id===drag.id);if(!p||!activeOn(p,date))return 'An diesem Tag nicht im Team';return data.shifts.some(s=>s.person===p.id&&s.date===date)?`${p.name} ist bereits eingeplant`:'';}
function clearDrop(){drag=null;clearTimeout(expandTimer);hoverDay=null;document.querySelectorAll('.day-cell').forEach(removePreview);}
function previewDrop(cell,e){
  removePreview(cell);
  const blocked=dropBlocked(cell.dataset.date);if(blocked){e.dataTransfer.dropEffect='none';cell.classList.add('drop-blocked');cell.insertAdjacentHTML('beforeend',`<span class="drop-rejection">${icon('ban')}${esc(blocked)}</span>`);return;}e.dataTransfer.dropEffect='copy';
  let start,length,y;
  if(drag.kind==='person'){const p=data.people.find(p=>p.id===drag.id);if(!p||!activeOn(p,cell.dataset.date))return;length=p.hours;start=clamp(hourAt(cell,e.clientX),8,DAY_END-length);y=freeY(cell.dataset.date,yAt(cell,e.clientY));}
  else {const s=getShift(e.target.closest('.shift')?.dataset.shift);if(!s)return;start=s.start;length=s.length;y=s.y;}
  cell.insertAdjacentHTML('beforeend',`<div class="drop-preview" style="top:${y}px;left:${(start-DAY_START)/DAY_SPAN*100}%;width:${length/DAY_SPAN*100}%"><span>${fmtTime(start)} · ${hours(length)}</span></div>`);
}
function createShift(person,date,start=8,y=32){
  const p=data.people.find(p=>p.id===person);if(!p||!activeOn(p,date)){toast('Diese Person ist an diesem Tag nicht im Team.');return;}
  const old=data.shifts.find(s=>s.person===person&&s.date===date);if(old){toast('Diese Person ist an diesem Tag bereits eingeplant.');return;}
  const s={id:uid(),person,date,start:clamp(snap(start),8,DAY_END-p.hours),y:freeY(date,y),length:p.hours,segments:[]};data.shifts.push(s);picked=null;persist();refresh();
}
function findGap(s,wanted,size,ignore){
  const sorted=s.segments.filter(t=>t.id!==ignore).sort((a,b)=>a.offset-b.offset), gaps=[];let cursor=0;
  for(const t of sorted){if(t.offset>cursor)gaps.push([cursor,t.offset]);cursor=Math.max(cursor,t.offset+t.duration);}if(cursor<s.length)gaps.push([cursor,s.length]);
  return gaps.filter(([a,b])=>b-a>=size).map(([a,b])=>({offset:clamp(snap(wanted),a,b-size),duration:size})).sort((a,b)=>Math.abs(a.offset-wanted)-Math.abs(b.offset-wanted))[0];
}
function addTask(s,type,offset){
  const t={id:uid(),type,label:type==='flex'?'Neue Aufgabe':'',offset:0,duration:s.length};
  if(s.segments.length){const gap=findGap(s,offset,1);if(gap)Object.assign(t,gap);else{const target=s.segments.find(x=>offset>=x.offset&&offset<=x.offset+x.duration)||s.segments.at(-1);if(target.duration<.5){toast('Für eine weitere Aufgabe werden mindestens 30 Minuten benötigt.');return;}t.duration=Math.min(1,target.duration-.25);if(offset<target.offset+target.duration/2){t.offset=target.offset;target.offset+=t.duration;target.duration-=t.duration;}else{target.duration-=t.duration;t.offset=target.offset+target.duration;}}}
  s.segments.push(t);editing=s.id;selected=s.id;persist();renderTimeline();if(type==='flex'){showToolkit(s.id,t.id);$('#task-label')?.select();}
}
function removeTask(s,t){const sorted=s.segments.toSorted((a,b)=>a.offset-b.offset),index=sorted.indexOf(t),next=sorted[index+1],prev=sorted[index-1];if(next&&Math.abs(next.offset-t.offset-t.duration)<.001){next.offset=t.offset;next.duration+=t.duration;}else if(prev&&Math.abs(prev.offset+prev.duration-t.offset)<.001)prev.duration+=t.duration;s.segments=s.segments.filter(x=>x!==t);}
function resizeTask(s,t,original,edge,delta){
  s.segments.forEach(x=>Object.assign(x,original.find(o=>o.id===x.id)));
  const sorted=s.segments.toSorted((a,b)=>a.offset-b.offset),index=sorted.indexOf(t);
  if(edge==='task-start'){const prev=sorted[index-1],touching=prev&&Math.abs(prev.offset+prev.duration-t.offset)<.001,min=prev?(touching?prev.offset+.25:prev.offset+prev.duration):0,change=clamp(delta,min-t.offset,t.duration-.25);if(touching)prev.duration+=change;t.offset+=change;t.duration-=change;}
  else {const next=sorted[index+1],end=t.offset+t.duration,max=next?next.offset+next.duration-.25:s.length,change=clamp(delta,.25-t.duration,max-end);if(next&&Math.abs(next.offset-end)<.001){next.offset+=change;next.duration-=change;}else if(next&&end+change>next.offset){next.duration-=end+change-next.offset;next.offset=end+change;}t.duration+=change;}
}
function moveTask(s,t,original,wanted){
  // Reset to the gesture snapshot: repeated pointer events cannot accumulate drift.
  s.segments.forEach(x=>Object.assign(x,original.find(o=>o.id===x.id)));
  const gap=findGap(s,wanted,t.duration,t.id);
  if(gap&&Math.abs(gap.offset-wanted)<.25){t.offset=gap.offset;return;}
  const sorted=s.segments.toSorted((a,b)=>a.offset-b.offset),from=sorted.indexOf(t);
  const target=sorted.findIndex(x=>x!==t&&wanted+t.duration/2>=x.offset&&wanted+t.duration/2<x.offset+x.duration);
  if(target<0){if(gap)t.offset=gap.offset;return;}
  const lo=Math.min(from,target),hi=Math.max(from,target),section=sorted.slice(lo,hi+1);let cursor=section[0].offset;
  section.splice(section.indexOf(t),1);section.splice(target>from?section.length:0,0,t);
  section.forEach(x=>{x.offset=cursor;cursor+=x.duration;});
}
function closePanel(){selected=null;$('#detail').hidden=true;document.querySelectorAll('.shift.active').forEach(el=>el.classList.remove('active'));}
function showToolkit(id,taskId){
  const s=getShift(id);if(!s)return;selected=id;editing=id;const p=data.people.find(p=>p.id===s.person),t=s.segments.find(t=>t.id===taskId),panel=$('#detail');
  document.querySelectorAll('.shift.active').forEach(el=>el.classList.remove('active'));const anchor=document.querySelector(`[data-shift="${id}"]`);if(!anchor)return;anchor.classList.add('editing');
  panel.hidden=false;panel.innerHTML=`<div class="toolkit-top"><strong>${t?'Aufgabe':esc(p.name)}</strong><span>${hours(s.length)}</span><button id="close-panel" class="icon-button" aria-label="Toolkit schließen">${icon('close')}</button></div>${t?`<label class="full-field"><span class="field-label">Bezeichnung</span><input id="task-label" maxlength="60" value="${esc(t.label||task(t.type).name)}"></label>`:''}<form id="toolkit-form"><div class="form-row"><label><span class="field-label">Beginn</span><input id="tool-start" type="text" inputmode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="HH:MM" value="${fmtTime(s.start+(t?t.offset:0))}" required></label><label><span class="field-label">Ende</span><input id="tool-end" type="text" inputmode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="HH:MM" value="${fmtTime(s.start+(t?t.offset+t.duration:s.length))}" required></label></div><p id="tool-error" class="form-error"></p><div class="toolkit-actions"><button type="button" class="delete-button" id="delete-shift" aria-label="${t?'Aufgabe':'Schicht'} löschen">${icon('trash')}</button>${t?'<button type="button" id="whole-shift" class="secondary-button">Zur Schicht</button>':'<button type="button" id="tool-add" class="secondary-button">+ Aufgabe</button>'}<button class="primary-button">Übernehmen</button></div></form>`;
  $('#close-panel').onclick=closePanel;
  $('#task-label')?.addEventListener('change',e=>{t.label=e.target.value.trim()||task(t.type).name;persist();renderTimeline();});
  $('#whole-shift')?.addEventListener('click',()=>showToolkit(id));
  $('#tool-add')?.addEventListener('click',()=>addTask(s,'flex',0));
  $('#delete-shift').onclick=()=>{const before=structuredClone(data.shifts);if(t)removeTask(s,t);else data.shifts=data.shifts.filter(x=>x!==s);persist();closePanel();renderTimeline();toast(t?'Aufgabe gelöscht.':'Schicht gelöscht.',()=>{data.shifts=before;persist();refresh();});};
  $('#toolkit-form').onsubmit=e=>{e.preventDefault();const start=toHour($('#tool-start').value),end=toHour($('#tool-end').value);if(!Number.isFinite(start)||!Number.isFinite(end)||end-start<.25||start<8||end>DAY_END){$('#tool-error').textContent='Bitte eine Zeit zwischen 08:00 und 24:00 wählen.';return;}
    if(t){const offset=start-s.start;if(offset<0||end>s.start+s.length||s.segments.some(x=>x!==t&&offset<x.offset+x.duration&&end-s.start>x.offset)){$('#tool-error').textContent='Aufgaben müssen ohne Überlappung innerhalb der Schicht liegen.';return;}t.offset=offset;t.duration=end-start;}
    else {if(s.segments.some(x=>x.offset+x.duration>end-start)){$('#tool-error').textContent='Die Aufgaben passen nicht in diese Schicht. Bitte zuerst kürzen oder verschieben.';return;}s.start=start;s.length=end-start;}
    persist();renderTimeline();showToolkit(id,taskId);
  };
  const r=anchor.getBoundingClientRect();panel.style.left=clamp(r.left,12,window.innerWidth-320)+'px';panel.style.top=Math.max(12,Math.min(r.bottom+12,window.innerHeight-panel.offsetHeight-12))+'px';
}
// Pointer capture keeps dragging stable at cell boundaries and on touch screens.
function startGesture(e){
  if(e.button!==0||e.target.closest('.shift-edit'))return;const el=e.currentTarget,s=getShift(el.dataset.shift),t=editing===s.id?s.segments.find(t=>t.id===e.target.closest('[data-task]')?.dataset.task):null,edge=e.target.closest('[data-edge]')?.dataset.edge;
  gesture={el,s,t,edge,x:e.clientX,y:e.clientY,before:structuredClone(s),original:structuredClone(s),width:el.parentElement.getBoundingClientRect().width,moved:false,pointer:e.pointerId};el.setPointerCapture(e.pointerId);
}
document.addEventListener('pointermove',e=>{
  const g=gesture;if(!g)return;if(!g.moved&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<5)return;
  e.preventDefault();g.moved=true;$('#detail').hidden=true;document.body.classList.add('is-dragging');
  const delta=snap((e.clientX-g.x)/g.width*DAY_SPAN),s=g.s,b=g.before;
  if(g.t){const old=b.segments.find(t=>t.id===g.t.id);if(g.edge==='task-end'||g.edge==='task-start')resizeTask(s,g.t,b.segments,g.edge,delta);else {const r=g.el.getBoundingClientRect();g.outside=e.clientY<r.top-30||e.clientY>r.bottom+30||e.clientX<r.left-35||e.clientX>r.right+35;g.el.querySelector(`[data-task="${g.t.id}"]`).classList.toggle('removing',g.outside);if(!g.outside)moveTask(s,g.t,b.segments,clamp(old.offset+delta,0,s.length-old.duration));}}
  else if(g.edge==='start'){const first=b.segments.reduce((n,t)=>Math.min(n,t.offset+t.duration-.25),b.length-.25);const change=clamp(delta,8-b.start,Math.min(first,b.length-.25));s.start=b.start+change;s.length=b.length-change;s.segments.forEach((t,i)=>{const old=b.segments[i];t.offset=Math.max(0,old.offset-change);t.duration=old.duration-Math.max(0,change-old.offset);});}
  else if(g.edge==='end'){const min=b.segments.reduce((n,t)=>Math.max(n,t.offset+.25),.25);s.length=clamp(b.length+delta,min,DAY_END-b.start);s.segments.forEach((t,i)=>t.duration=Math.min(b.segments[i].duration,s.length-t.offset));}
  else {s.start=clamp(b.start+delta,8,DAY_END-b.length);const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('.day-cell');const p=data.people.find(p=>p.id===s.person);if(cell&&activeOn(p,cell.dataset.date)&&!data.shifts.some(x=>x!==s&&x.person===s.person&&x.date===cell.dataset.date)){s.date=cell.dataset.date;s.y=yAt(cell,e.clientY);if(cell!==g.el.parentElement){cell.append(g.el);g.x=e.clientX;g.width=cell.getBoundingClientRect().width;b.start=s.start;}}}
  g.el.style.top=s.y+'px';g.el.style.setProperty('--start',(s.start-DAY_START)/DAY_SPAN);g.el.style.setProperty('--duration',s.length/DAY_SPAN);g.el.querySelector('.shift-time').textContent=`${fmtTime(s.start)}–${fmtTime(s.start+s.length)}`;
  s.segments.forEach(t=>{const el=g.el.querySelector(`[data-task="${t.id}"]`);el.style.left=t.offset/s.length*100+'%';el.style.width=t.duration/s.length*100+'%';});
},{passive:false});
function endGesture(cancel=false){const g=gesture;if(!g)return;gesture=null;document.body.classList.remove('is-dragging');if(cancel)Object.assign(g.s,g.original);if(g.moved){suppressClick=true;if(!cancel){if(g.t&&g.outside){const before=structuredClone(g.original);removeTask(g.s,g.t);toast('Aufgabe entfernt.',()=>{Object.assign(g.s,before);persist();renderTimeline();});}g.s.y=freeY(g.s.date,g.s.y,g.s.id);persist();}renderTimeline();setTimeout(()=>suppressClick=false,0);}}
document.addEventListener('pointerup',()=>endGesture());document.addEventListener('pointercancel',()=>endGesture(true));
function modalTop(title){return `<div class="modal-top"><h2>${title}</h2><button type="button" class="icon-button" id="modal-close" aria-label="Schließen">${icon('close')}</button></div>`;}
function openModal(html){closePanel();$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();$('#modal-close').onclick=()=>$('#modal').close();}
function openSettings(){
  openModal(`${modalTop('Einstellungen')}<div class="settings-row"><span>Wochenende anzeigen</span><input id="weekend" type="checkbox" ${data.settings.weekend?'checked':''}></div><div class="settings-heading"><h3>Mitarbeitende</h3><button id="new-person" class="subtle-button">+ Hinzufügen</button></div><div class="people-settings">${data.people.map(p=>`<button class="person-setting" data-edit-person="${p.id}"><i style="background:${p.color}"></i><span><strong>${esc(p.name)}</strong><small>${p.from?parseDate(p.from).toLocaleDateString('de-DE'):'Ohne Eintrittsdatum'}${p.until?' – '+parseDate(p.until).toLocaleDateString('de-DE'):' · unbefristet'}</small></span><b>${hours(p.hours)}</b>${icon('edit')}</button>`).join('')}</div><p class="modal-note">Ein- und Austrittsdatum steuern die Sichtbarkeit im Plan. Frühere Schichten bleiben erhalten.</p>`);
  $('#weekend').onchange=e=>{data.settings.weekend=e.target.checked;persist();refresh();};$('#new-person').onclick=()=>openPerson();document.querySelectorAll('[data-edit-person]').forEach(el=>el.onclick=()=>openPerson(data.people.find(p=>p.id===el.dataset.editPerson)));
  $('#modal-content').insertAdjacentHTML('beforeend',`<div class="settings-heading"><h3>Aufgabenvorlagen</h3><button id="new-preset" class="subtle-button">+ Hinzufügen</button></div>${tasks.filter(t=>t.id!=='flex'&&!t.hidden).map(t=>`<button class="person-setting" data-preset="${t.id}"><i style="background:${t.color}"></i><span>${esc(t.name)}</span>${icon('edit')}</button>`).join('')}`);
  $('#new-preset').onclick=()=>openPreset();document.querySelectorAll('[data-preset]').forEach(el=>el.onclick=()=>openPreset(task(el.dataset.preset)));
}
function openPreset(t){openModal(`${modalTop(t?'Aufgabenvorlage bearbeiten':'Aufgabenvorlage hinzufügen')}<form id="preset-form"><label class="full-field"><span class="field-label">Bezeichnung</span><input name="name" maxlength="40" required value="${esc(t?.name||'')}"></label><label class="full-field"><span class="field-label">Farbe</span><input name="color" type="color" value="${t?.color||'#b9a5eb'}"></label><div class="form-actions">${t?'<button type="button" id="hide-preset" class="delete-button">Entfernen</button>':''}<button type="button" id="back-presets" class="secondary-button">Zurück</button><button class="primary-button">Speichern</button></div></form>`);$('#back-presets').onclick=openSettings;$('#hide-preset')?.addEventListener('click',()=>{t.hidden=true;persist();renderLegend();openSettings();});$('#preset-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),name=String(f.get('name')).trim();if(!name)return;const value={name,short:name,color:f.get('color')};if(t)Object.assign(t,value);else tasks.push({id:uid(),...value});persist();renderLegend();renderTimeline();openSettings();};}
function openPerson(p){
  openModal(`${modalTop(p?'Mitarbeitende bearbeiten':'Mitarbeitende hinzufügen')}<form id="person-form"><label class="full-field"><span class="field-label">Name</span><input name="name" maxlength="24" value="${esc(p?.name||'')}" required></label><div class="form-row"><label><span class="field-label">Stunden pro Schicht</span><input name="hours" type="number" min="0.25" max="16" step="0.25" value="${p?.hours||8}" required></label><label><span class="field-label">Farbe</span><input name="color" type="color" value="${p?.color||'#ad95df'}"></label></div><div class="form-row"><label><span class="field-label">Eintritt (optional)</span><input name="from" type="date" value="${p?.from||''}"></label><label><span class="field-label">Letzter Tag (optional)</span><input name="until" type="date" value="${p?.until||''}"></label></div><p id="person-error" class="form-error"></p><div class="form-actions"><button type="button" class="secondary-button" id="back-settings">Zurück</button><button class="primary-button">Speichern</button></div></form>`);
  $('#back-settings').onclick=openSettings;$('#person-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),values={name:String(f.get('name')).trim(),hours:Number(f.get('hours')),color:f.get('color'),from:f.get('from'),until:f.get('until')};if(!values.name||values.hours<.25||values.hours>16||(values.from&&values.until&&values.from>values.until)){$('#person-error').textContent='Bitte Name, Stunden und Zeitraum prüfen.';return;}if(p)Object.assign(p,values);else data.people.push({id:uid(),...values});persist();refresh();openSettings();};
}
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportCSV(){const rows=[['Name','Datum','Beginn','Ende','Aufgabe','Stunden']];data.shifts.filter(s=>s.date>=dateKey(week)&&s.date<=dateKey(addDays(week,6))).forEach(s=>{const name=data.people.find(p=>p.id===s.person).name;rows.push([name,s.date,fmtTime(s.start),fmtTime(s.start+s.length),'Schicht',s.length]);s.segments.toSorted((a,b)=>a.offset-b.offset).forEach(t=>rows.push([name,s.date,fmtTime(s.start+t.offset),fmtTime(s.start+t.offset+t.duration),t.label||task(t.type).name,t.duration]));});download('\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/^[=+\-@]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n'),'text/csv;charset=utf-8',`Flow-${dateKey(week)}.csv`);}
function changeWeek(n){week=addDays(week,n);focusDate=null;picked=null;closePanel();refresh();}
function closeMenu(){$('#menu').hidden=true;$('#more').setAttribute('aria-expanded','false');}
$('#prev').onclick=()=>changeWeek(-7);$('#next').onclick=()=>changeWeek(7);$('#today').onclick=()=>{week=monday(parseDate(todayKey()));changeWeek(0);};
$('#dock-toggle').onclick=()=>{const collapsed=$('.dock').classList.toggle('collapsed');$('#dock-toggle').setAttribute('aria-expanded',String(!collapsed));};
$('#add-person').removeAttribute('data-icon');$('#add-person').innerHTML=icon('settings');$('#add-person').setAttribute('aria-label','Mitarbeitende verwalten');$('#add-person').title='Mitarbeitende verwalten';$('#add-person').onclick=openSettings;
$('.footer-label').textContent='AUFGABEN';
$('#detail').setAttribute('aria-label','Schicht-Toolkit');
function renderLegend(){$('#legend').innerHTML=tasks.filter(t=>!t.hidden).map(t=>`<button draggable="true" class="legend-item" data-type="${t.id}"><i class="legend-dot" style="--segment:${t.color}"></i>${esc(t.name)}</button>`).join('');document.querySelectorAll('[data-type]').forEach(el=>{el.ondragstart=e=>{drag={kind:'task',id:el.dataset.type};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='copy';};el.ondragend=clearDrop;el.onclick=()=>{const s=getShift(selected||editing);if(s)addTask(s,el.dataset.type,0);else toast('Aufgabe in eine Schicht ziehen oder zuerst eine Schicht auswählen.');};});}
$('#more').onclick=()=>{const hidden=!$('#menu').hidden;$('#menu').hidden=hidden;$('#more').setAttribute('aria-expanded',String(!hidden));};
$('#menu').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{closeMenu();({export:exportCSV,backup:()=>download(JSON.stringify(data,null,2),'application/json',`Flow-${todayKey()}.json`),print:()=>window.print(),settings:openSettings})[b.dataset.action]();});
document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap'))closeMenu();if(!e.target.closest('#detail,.shift,.legend-item'))closePanel();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){endGesture(true);picked=null;clearDrop();closePanel();closeMenu();refresh();}});
const surface=document.createElement('div');surface.className='canvas-surface';$('#grid-scroll').append(surface);surface.append($('#timeline'));
$('.board').insertAdjacentHTML('beforeend',`<div class="canvas-zoom" role="group" aria-label="Canvas-Zoom"><button id="zoom-out" aria-label="Herauszoomen">${icon('minus')}</button><button id="zoom-value" aria-label="Zoom auf 100 Prozent zurücksetzen">100%</button><button id="zoom-in" aria-label="Hineinzoomen">${icon('plus')}</button></div>`);
$('#zoom-out').onclick=()=>setZoom(zoom-.25);$('#zoom-in').onclick=()=>setZoom(zoom+.25);$('#zoom-value').onclick=()=>setZoom(1);
$('#grid-scroll').addEventListener('scroll',closePanel);window.addEventListener('resize',()=>{closePanel();applyZoom();});
hydrate();renderLegend();refresh();persist();
