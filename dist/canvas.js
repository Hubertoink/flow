// Keep the v1 storage key so existing plans migrate without losing their history.
let data;
try { data=JSON.parse(localStorage.getItem('flow-plan-v1')); } catch {}
if(!data || !Array.isArray(data.people) || !Array.isArray(data.shifts)) data=seed();
data.settings ||= {weekend:false};
data.people.forEach(p=>{p.hours ??= p.end-p.start; p.from ||= ''; p.until ||= '';});
data.shifts.forEach(s=>{
  s.length ??= s.segments.reduce((n,t)=>n+Number(t.duration),0);
  let offset=0;
  s.segments.forEach(t=>{t.offset ??= offset; offset+=Number(t.duration); t.id ||= uid();});
});
data.version=2;
let week=monday(parseDate(todayKey())), focusDate=null, selected=null, picked=null, drag=null, gesture=null, suppressClick=false, toastTimer;
const snap=n=>Math.round(n*4)/4, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const activeOn=(p,date)=>(!p.from || date>=p.from)&&(!p.until || date<=p.until);
const dates=()=>focusDate?[parseDate(focusDate)]:Array.from({length:data.settings.weekend?7:5},(_,i)=>addDays(week,i));
const visiblePeople=()=>data.people.filter(p=>dates().some(d=>activeOn(p,dateKey(d))));
const duration=s=>s.length;
const getShift=id=>data.shifts.find(s=>s.id===id);
function persist(){try{localStorage.setItem('flow-plan-v1',JSON.stringify(data));}catch{toast('Speichern fehlgeschlagen. Bitte den Plan über das Menü exportieren.');}}
function toast(message,undo){clearTimeout(toastTimer);const el=$('#toast');el.innerHTML=`<span>${esc(message)}</span>${undo?'<button>Rückgängig</button>':''}`;el.hidden=false;if(undo)el.querySelector('button').onclick=()=>{undo();el.hidden=true;};toastTimer=setTimeout(()=>el.hidden=true,6000);}
function isoWeek(d){const v=addDays(d,3),first=new Date(v.getFullYear(),0,4);return 1+Math.round((v-monday(first))/604800000);}
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
  return `<div class="shift ${selected===s.id?'active':''}" tabindex="0" role="button" data-shift="${s.id}" style="--start:${(s.start-8)/12};--duration:${s.length/12}" aria-label="${esc(p.name)}, ${fmtTime(s.start)} bis ${fmtTime(s.start+s.length)}, ${hours(s.length)}"><time class="shift-time">${fmtTime(s.start)} – ${fmtTime(s.start+s.length)}<span> · ${hours(s.length)}</span></time><span class="shift-grip" title="Schicht verschieben">${icon('grip')}</span><div class="task-track">${s.segments.map(t=>`<button class="segment" data-task="${t.id}" style="--segment:${task(t.type).color};left:${t.offset/s.length*100}%;width:${t.duration/s.length*100}%" aria-label="${esc(t.label||task(t.type).name)}, ${fmtTime(s.start+t.offset)} bis ${fmtTime(s.start+t.offset+t.duration)}"><b>${esc(t.label||task(t.type).name)}</b><span class="task-resize" data-edge="task-end" title="Aufgabe verlängern oder kürzen"></span></button>`).join('')}</div><span class="resize-handle start" data-edge="start" title="Schichtbeginn ändern"></span><span class="resize-handle end" data-edge="end" title="Schichtende ändern"></span></div>`;
}
function renderTimeline(){
  const ds=dates(), people=visiblePeople(),last=addDays(week,6);
  $('#date-range').textContent=`${week.toLocaleDateString('de-DE',{day:'numeric',month:'short'})} – ${last.toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'})}`;
  $('#week-number').textContent='KW '+isoWeek(week);
  $('.board').classList.toggle('week-focus',!!focusDate);
  const grid=$('#timeline'); grid.style.setProperty('--days',ds.length);grid.style.setProperty('--rows',Math.max(people.length,1));
  let html='<div class="grid-corner">TEAM</div>';
  ds.forEach(d=>{const key=dateKey(d);html+=`<button class="day-head ${key===todayKey()?'current':''}" data-date="${key}" title="${focusDate?'Zur Wochenansicht':'Tag vergrößern'}"><span class="day-title"><span class="day-name">${d.toLocaleDateString('de-DE',{weekday:'long'})}</span><span class="day-date">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</span></span><span class="hours">${[8,10,12,14,16,18,20].map(h=>`<span>${String(h).padStart(2,'0')}</span>`).join('')}</span></button>`;});
  people.forEach(p=>{html+=`<div class="person-name"><i style="background:${p.color}"></i>${esc(p.name)}</div>`;ds.forEach(d=>{const key=dateKey(d),s=data.shifts.find(s=>s.person===p.id&&s.date===key),active=activeOn(p,key);html+=`<div class="day-cell ${!active?'inactive':''} ${picked?'pickable':''}" data-date="${key}" data-person="${p.id}" tabindex="0" aria-label="${esc(p.name)}, ${key}${!active?', nicht im Team':''}">${s?shiftMarkup(s):''}</div>`;});});
  if(!people.length)html+='<div class="canvas-empty">Keine Mitarbeitenden in diesem Zeitraum. <button id="empty-settings">Team verwalten</button></div>';
  grid.innerHTML=html;
  grid.querySelectorAll('.day-head').forEach(b=>b.onclick=()=>{focusDate=focusDate?null:b.dataset.date;closePanel();refresh();});
  grid.querySelectorAll('.day-cell').forEach(cell=>{
    cell.ondragover=e=>{if(!drag)return;e.preventDefault();previewDrop(cell,e);};
    cell.ondragleave=e=>{if(!cell.contains(e.relatedTarget))removePreview(cell);};
    cell.ondrop=e=>{e.preventDefault();removePreview(cell);if(!drag)return;const payload=drag;drag=null;if(payload.kind==='person')createShift(payload.id,cell.dataset.date,hourAt(cell,e.clientX));else {const s=getShift(cell.querySelector('.shift')?.dataset.shift);if(s)addTask(s,payload.id,hourAt(cell,e.clientX)-s.start);}};
    cell.onclick=e=>{if(suppressClick||e.target.closest('.shift'))return;if(picked)createShift(picked,cell.dataset.date,hourAt(cell,e.clientX));else closePanel();};
    cell.ondblclick=e=>{if(!e.target.closest('.shift'))createShift(cell.dataset.person,cell.dataset.date,hourAt(cell,e.clientX));};
    cell.onkeydown=e=>{if(e.target===cell&&(e.key==='Enter'||e.key===' ')){e.preventDefault();createShift(picked||cell.dataset.person,cell.dataset.date,8);}};
  });
  grid.querySelectorAll('.shift').forEach(el=>{
    el.onpointerdown=startGesture;
    el.onclick=e=>{e.stopPropagation();if(!suppressClick)showToolkit(el.dataset.shift,e.target.closest('[data-task]')?.dataset.task);};
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showToolkit(el.dataset.shift,e.target.closest('[data-task]')?.dataset.task);}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const s=getShift(el.dataset.shift);s.start=clamp(s.start+(e.key==='ArrowRight'?.25:-.25),8,20-s.length);persist();renderTimeline();document.querySelector(`[data-shift="${s.id}"]`)?.focus();}};
  });
  $('#empty-settings')?.addEventListener('click',openSettings);
}
function hourAt(cell,x){const r=cell.getBoundingClientRect();return snap(8+(x-r.left)/r.width*12);}
function removePreview(cell){cell.classList.remove('drag-over');cell.querySelector('.drop-preview')?.remove();}
function clearDrop(){drag=null;document.querySelectorAll('.day-cell').forEach(removePreview);}
function previewDrop(cell,e){
  removePreview(cell);
  let start,length;
  if(drag.kind==='person'){const p=data.people.find(p=>p.id===drag.id);if(!p||!activeOn(p,cell.dataset.date)||cell.dataset.person!==p.id||cell.querySelector('.shift'))return;length=p.hours;start=clamp(hourAt(cell,e.clientX),8,20-length);}
  else {const s=getShift(cell.querySelector('.shift')?.dataset.shift);if(!s)return;const place=findGap(s,hourAt(cell,e.clientX)-s.start,1);if(!place)return;start=s.start+place.offset;length=place.duration;}
  cell.classList.add('drag-over');cell.insertAdjacentHTML('beforeend',`<div class="drop-preview" style="left:${(start-8)/12*100}%;width:${length/12*100}%"><span>${fmtTime(start)} · ${hours(length)}</span></div>`);
}
function createShift(person,date,start=8){
  const p=data.people.find(p=>p.id===person);if(!p||!activeOn(p,date)){toast('Diese Person ist an diesem Tag nicht im Team.');return;}
  const old=data.shifts.find(s=>s.person===person&&s.date===date);if(old){showToolkit(old.id);return;}
  const s={id:uid(),person,date,start:clamp(snap(start),8,20-p.hours),length:p.hours,segments:[]};data.shifts.push(s);picked=null;persist();refresh();
}
function findGap(s,wanted,size,ignore){
  const sorted=s.segments.filter(t=>t.id!==ignore).sort((a,b)=>a.offset-b.offset), gaps=[];let cursor=0;
  for(const t of sorted){if(t.offset>cursor)gaps.push([cursor,t.offset]);cursor=Math.max(cursor,t.offset+t.duration);}if(cursor<s.length)gaps.push([cursor,s.length]);
  return gaps.filter(([a,b])=>b-a>=size).map(([a,b])=>({offset:clamp(snap(wanted),a,b-size),duration:size})).sort((a,b)=>Math.abs(a.offset-wanted)-Math.abs(b.offset-wanted))[0];
}
function addTask(s,type,offset){const gap=findGap(s,offset,1);if(!gap){toast('Kein freier Platz. Eine Aufgabe kürzen oder die Schicht verlängern.');return;}const t={id:uid(),type,label:'',...gap};s.segments.push(t);persist();renderTimeline();showToolkit(s.id,t.id);$('#task-label')?.select();}
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
  const s=getShift(id);if(!s)return;selected=id;const p=data.people.find(p=>p.id===s.person),t=s.segments.find(t=>t.id===taskId),panel=$('#detail');
  document.querySelectorAll('.shift.active').forEach(el=>el.classList.remove('active'));const anchor=document.querySelector(`[data-shift="${id}"]`);if(!anchor)return;anchor.classList.add('active');
  panel.hidden=false;panel.innerHTML=`<div class="toolkit-top"><strong>${t?'Aufgabe':esc(p.name)}</strong><span>${hours(s.length)}</span><button id="close-panel" class="icon-button" aria-label="Toolkit schließen">${icon('close')}</button></div>${t?`<label class="full-field"><span class="field-label">Bezeichnung</span><input id="task-label" maxlength="60" value="${esc(t.label||task(t.type).name)}"></label>`:''}<form id="toolkit-form"><div class="form-row"><label><span class="field-label">Beginn</span><input id="tool-start" type="time" step="900" value="${fmtTime(s.start+(t?t.offset:0))}" required></label><label><span class="field-label">Ende</span><input id="tool-end" type="time" step="900" value="${fmtTime(s.start+(t?t.offset+t.duration:s.length))}" required></label></div><p id="tool-error" class="form-error"></p><div class="toolkit-actions"><button type="button" class="delete-button" id="delete-shift" aria-label="${t?'Aufgabe':'Schicht'} löschen">${icon('trash')}</button>${t?'<button type="button" id="whole-shift" class="secondary-button">Zur Schicht</button>':'<button type="button" id="tool-add" class="secondary-button">+ Aufgabe</button>'}<button class="primary-button">Übernehmen</button></div></form>`;
  $('#close-panel').onclick=closePanel;
  $('#task-label')?.addEventListener('change',e=>{t.label=e.target.value.trim()||task(t.type).name;persist();renderTimeline();});
  $('#whole-shift')?.addEventListener('click',()=>showToolkit(id));
  $('#tool-add')?.addEventListener('click',()=>addTask(s,'open',0));
  $('#delete-shift').onclick=()=>{const before=structuredClone(data.shifts);if(t)s.segments=s.segments.filter(x=>x!==t);else data.shifts=data.shifts.filter(x=>x!==s);persist();closePanel();renderTimeline();toast(t?'Aufgabe gelöscht.':'Schicht gelöscht.',()=>{data.shifts=before;persist();refresh();});};
  $('#toolkit-form').onsubmit=e=>{e.preventDefault();const start=toHour($('#tool-start').value),end=toHour($('#tool-end').value);if(!Number.isFinite(start)||!Number.isFinite(end)||end-start<.25||start<8||end>20){$('#tool-error').textContent='Bitte eine Zeit zwischen 08:00 und 20:00 wählen.';return;}
    if(t){const offset=start-s.start;if(offset<0||end>s.start+s.length||s.segments.some(x=>x!==t&&offset<x.offset+x.duration&&end-s.start>x.offset)){$('#tool-error').textContent='Aufgaben müssen ohne Überlappung innerhalb der Schicht liegen.';return;}t.offset=offset;t.duration=end-start;}
    else {if(s.segments.some(x=>x.offset+x.duration>end-start)){$('#tool-error').textContent='Die Aufgaben passen nicht in diese Schicht. Bitte zuerst kürzen oder verschieben.';return;}s.start=start;s.length=end-start;}
    persist();renderTimeline();showToolkit(id,taskId);
  };
  const r=anchor.getBoundingClientRect();panel.style.left=clamp(r.left,12,window.innerWidth-320)+'px';panel.style.top=Math.max(12,Math.min(r.bottom+12,window.innerHeight-panel.offsetHeight-12))+'px';
}
// Pointer capture keeps dragging stable at cell boundaries and on touch screens.
function startGesture(e){
  if(e.button!==0)return;const el=e.currentTarget,s=getShift(el.dataset.shift),t=s.segments.find(t=>t.id===e.target.closest('[data-task]')?.dataset.task),edge=e.target.closest('[data-edge]')?.dataset.edge;
  gesture={el,s,t,edge,x:e.clientX,y:e.clientY,before:structuredClone(s),original:structuredClone(s),width:el.parentElement.getBoundingClientRect().width,moved:false,pointer:e.pointerId};el.setPointerCapture(e.pointerId);
}
document.addEventListener('pointermove',e=>{
  const g=gesture;if(!g)return;if(!g.moved&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<5)return;
  e.preventDefault();g.moved=true;closePanel();document.body.classList.add('is-dragging');
  const delta=snap((e.clientX-g.x)/g.width*12),s=g.s,b=g.before;
  if(g.t){const old=b.segments.find(t=>t.id===g.t.id);if(g.edge==='task-end'){const next=s.segments.filter(t=>t!==g.t&&t.offset>=old.offset+old.duration).reduce((end,t)=>Math.min(end,t.offset),s.length);g.t.duration=clamp(old.duration+delta,.25,next-old.offset);}else moveTask(s,g.t,b.segments,clamp(old.offset+delta,0,s.length-old.duration));}
  else if(g.edge==='start'){const first=b.segments.reduce((n,t)=>Math.min(n,t.offset+t.duration-.25),b.length-.25);const change=clamp(delta,8-b.start,Math.min(first,b.length-.25));s.start=b.start+change;s.length=b.length-change;s.segments.forEach((t,i)=>{const old=b.segments[i];t.offset=Math.max(0,old.offset-change);t.duration=old.duration-Math.max(0,change-old.offset);});}
  else if(g.edge==='end'){const min=b.segments.reduce((n,t)=>Math.max(n,t.offset+.25),.25);s.length=clamp(b.length+delta,min,20-b.start);s.segments.forEach((t,i)=>t.duration=Math.min(b.segments[i].duration,s.length-t.offset));}
  else {s.start=clamp(b.start+delta,8,20-b.length);const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('.day-cell');const p=data.people.find(p=>p.id===s.person);if(cell&&cell.dataset.person===s.person&&activeOn(p,cell.dataset.date)&&!data.shifts.some(x=>x!==s&&x.person===s.person&&x.date===cell.dataset.date)){s.date=cell.dataset.date;if(cell!==g.el.parentElement){cell.append(g.el);g.x=e.clientX;g.width=cell.getBoundingClientRect().width;b.start=s.start;}}}
  g.el.style.setProperty('--start',(s.start-8)/12);g.el.style.setProperty('--duration',s.length/12);g.el.querySelector('.shift-time').textContent=`${fmtTime(s.start)} – ${fmtTime(s.start+s.length)} · ${hours(s.length)}`;
  s.segments.forEach(t=>{const el=g.el.querySelector(`[data-task="${t.id}"]`);el.style.left=t.offset/s.length*100+'%';el.style.width=t.duration/s.length*100+'%';});
},{passive:false});
function endGesture(cancel=false){const g=gesture;if(!g)return;gesture=null;document.body.classList.remove('is-dragging');if(cancel)Object.assign(g.s,g.original);if(g.moved){suppressClick=true;if(!cancel)persist();renderTimeline();setTimeout(()=>suppressClick=false,0);}}
document.addEventListener('pointerup',()=>endGesture());document.addEventListener('pointercancel',()=>endGesture(true));
function modalTop(title){return `<div class="modal-top"><h2>${title}</h2><button type="button" class="icon-button" id="modal-close" aria-label="Schließen">${icon('close')}</button></div>`;}
function openModal(html){closePanel();$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();$('#modal-close').onclick=()=>$('#modal').close();}
function openSettings(){
  openModal(`${modalTop('Einstellungen')}<div class="settings-row"><span>Wochenende anzeigen</span><input id="weekend" type="checkbox" ${data.settings.weekend?'checked':''}></div><div class="settings-heading"><h3>Mitarbeitende</h3><button id="new-person" class="subtle-button">+ Hinzufügen</button></div><div class="people-settings">${data.people.map(p=>`<button class="person-setting" data-edit-person="${p.id}"><i style="background:${p.color}"></i><span><strong>${esc(p.name)}</strong><small>${p.from?parseDate(p.from).toLocaleDateString('de-DE'):'Ohne Eintrittsdatum'}${p.until?' – '+parseDate(p.until).toLocaleDateString('de-DE'):' · unbefristet'}</small></span><b>${hours(p.hours)}</b>${icon('edit')}</button>`).join('')}</div><p class="modal-note">Ein- und Austrittsdatum steuern die Sichtbarkeit im Plan. Frühere Schichten bleiben erhalten.</p>`);
  $('#weekend').onchange=e=>{data.settings.weekend=e.target.checked;persist();refresh();};$('#new-person').onclick=()=>openPerson();document.querySelectorAll('[data-edit-person]').forEach(el=>el.onclick=()=>openPerson(data.people.find(p=>p.id===el.dataset.editPerson)));
}
function openPerson(p){
  openModal(`${modalTop(p?'Mitarbeitende bearbeiten':'Mitarbeitende hinzufügen')}<form id="person-form"><label class="full-field"><span class="field-label">Name</span><input name="name" maxlength="24" value="${esc(p?.name||'')}" required></label><div class="form-row"><label><span class="field-label">Stunden pro Schicht</span><input name="hours" type="number" min="0.25" max="12" step="0.25" value="${p?.hours||8}" required></label><label><span class="field-label">Farbe</span><input name="color" type="color" value="${p?.color||'#ad95df'}"></label></div><div class="form-row"><label><span class="field-label">Eintritt (optional)</span><input name="from" type="date" value="${p?.from||''}"></label><label><span class="field-label">Letzter Tag (optional)</span><input name="until" type="date" value="${p?.until||''}"></label></div><p id="person-error" class="form-error"></p><div class="form-actions"><button type="button" class="secondary-button" id="back-settings">Zurück</button><button class="primary-button">Speichern</button></div></form>`);
  $('#back-settings').onclick=openSettings;$('#person-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),values={name:String(f.get('name')).trim(),hours:Number(f.get('hours')),color:f.get('color'),from:f.get('from'),until:f.get('until')};if(!values.name||values.hours<.25||values.hours>12||(values.from&&values.until&&values.from>values.until)){$('#person-error').textContent='Bitte Name, Stunden und Zeitraum prüfen.';return;}if(p)Object.assign(p,values);else data.people.push({id:uid(),...values});persist();refresh();openSettings();};
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
$('#legend').innerHTML=tasks.map(t=>`<button draggable="true" class="legend-item" data-type="${t.id}"><i class="legend-dot" style="--segment:${t.color}"></i>${t.name}</button>`).join('');
document.querySelectorAll('[data-type]').forEach(el=>{el.ondragstart=e=>{drag={kind:'task',id:el.dataset.type};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='copy';};el.ondragend=clearDrop;el.onclick=()=>{const s=getShift(selected);if(s)addTask(s,el.dataset.type,0);else toast('Aufgabe in eine Schicht ziehen oder zuerst eine Schicht auswählen.');};});
$('#more').onclick=()=>{const hidden=!$('#menu').hidden;$('#menu').hidden=hidden;$('#more').setAttribute('aria-expanded',String(!hidden));};
$('#menu').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{closeMenu();({export:exportCSV,backup:()=>download(JSON.stringify(data,null,2),'application/json',`Flow-${todayKey()}.json`),print:()=>window.print(),settings:openSettings})[b.dataset.action]();});
document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap'))closeMenu();if(!e.target.closest('#detail,.shift,.legend-item'))closePanel();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){endGesture(true);picked=null;clearDrop();closePanel();closeMenu();refresh();}});
$('#grid-scroll').addEventListener('scroll',closePanel);window.addEventListener('resize',closePanel);
hydrate();refresh();persist();
