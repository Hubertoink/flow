// Keep the v1 storage key so existing plans migrate without losing their history.
let data;
try { data=JSON.parse(localStorage.getItem('flow-plan-v1')); } catch {}
if(!data || !Array.isArray(data.people) || !Array.isArray(data.shifts)) data={version:3,people:structuredClone(initialPeople),shifts:[],settings:{weekend:false}};
if(Array.isArray(data.taskTypes))tasks.splice(0,tasks.length,...data.taskTypes);
if(!tasks.some(t=>t.id==='flex'))tasks.push({id:'flex',name:'Flexible Aufgabe',color:'#b9a5eb'});
data.settings ||= {weekend:false};
data.settings.saturday ??= data.settings.weekend===true;
data.settings.sunday ??= data.settings.weekend===true;
const themes=['dark','light','catppuccin'];
const backgrounds=[
  {id:'car',name:'Violette Abendlandschaft',file:'a_car_with_trees_on_it.png'},
  {id:'city',name:'Skyline im Abendlicht',file:'a_city_skyline_with_a_plane_in_the_sky.png'},
  {id:'forest',name:'Nebelwald',file:'a_foggy_forest_with_trees_and_bushes.png'},
  {id:'snow',name:'Winterlandschaft',file:'a_group_of_trees_in_a_snowy_field.jpg'}
];
function applyBackground(){
  const background=backgrounds.find(item=>item.id===data.settings.background);
  document.documentElement.classList.toggle('has-background',!!background);
  if(background)document.documentElement.style.setProperty('--background-image',`url("assets/${background.file}")`);
  else document.documentElement.style.removeProperty('--background-image');
}
function applyTheme(){
  const theme=themes.includes(data.settings.theme)?data.settings.theme:'dark';
  document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]').content={dark:'#10151f',light:'#eef1f7',catppuccin:'#1e1e2e'}[theme];
}
applyTheme();
applyBackground();
data.people.forEach(person=>{person.hours ??= person.end-person.start;person.weekdayHours=Array.from({length:7},(_,index)=>Number.isFinite(person.weekdayHours?.[index])?person.weekdayHours[index]:index<5?person.hours:0);person.weeklyHours ??= person.weekdayHours.reduce((total,value)=>total+value,0);person.from ||= '';person.until ||= '';});
data.shifts.forEach((s,index)=>{
  s.y ??= 32+data.shifts.slice(0,index).filter(x=>x.date===s.date).length*64;
  s.length ??= s.segments.reduce((n,t)=>n+Number(t.duration),0);
  let offset=0;
  s.segments.forEach(t=>{t.offset ??= offset; offset+=Number(t.duration); t.id ||= uid();});
});
compactShifts();
data.version=3;
let week=monday(parseDate(todayKey())), focusDate=null, selected=null, editing=null, picked=null, drag=null, gesture=null, suppressClick=false, toastTimer,expandTimer,hoverDay;
let copiedShift=null,copiedTask=null,copiedDay=null,copiedWeek=null,copyPicked=false;
const DAY_START=8, DAY_END=24, DAY_SPAN=DAY_END-DAY_START;
let zoom=Number(data.settings.zoom)||1;
const snap=n=>Math.round(n*4)/4, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const activeOn=(p,date)=>(!p.from || date>=p.from)&&(!p.until || date<=p.until);
function weekDayIndices(settings){
  return [0,1,2,3,4,...((settings.saturday??settings.weekend)?[5]:[]),...((settings.sunday??settings.weekend)?[6]:[])];
}
const dates=()=>weekDayIndices(data.settings).map(i=>addDays(week,i));
const visiblePeople=()=>data.people.filter(p=>dates().some(d=>activeOn(p,dateKey(d))));
const duration=s=>s.length;
const getShift=id=>data.shifts.find(s=>s.id===id);
const weekdays=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const weekdayHours=(person,date)=>person.weekdayHours[(parseDate(date).getDay()+6)%7];
const weekHours=person=>person.weekdayHours.reduce((total,value)=>total+value,0);
const breakRules=()=>data.settings.breakRules||[];
function breakMinutes(minutes,rules=breakRules()){
  return Math.min(minutes,rules.reduce((pause,rule)=>minutes>=Math.round(rule.after*60)?Math.max(pause,rule.minutes):pause,0));
}
function workTotals(shifts,rules=breakRules()){
  const days=new Map();
  shifts.forEach(s=>{const key=JSON.stringify([s.person,s.date]);days.set(key,(days.get(key)||0)+Math.round(s.length*60));});
  let gross=0,pause=0;days.forEach(minutes=>{gross+=minutes;pause+=breakMinutes(minutes,rules);});
  return {gross:gross/60,pause:pause/60,net:(gross-pause)/60};
}
function shiftWork(s,shifts=data.shifts,rules=breakRules()){
  const own=shifts.filter(other=>other.person===s.person&&other.date===s.date),totals=workTotals(own,rules);
  const pause=totals.gross?s.length/totals.gross*totals.pause:0;
  return {pause,net:s.length-pause};
}
function shiftTime(s,shifts=data.shifts,rules=breakRules()){
  return `${fmtTime(s.start)}–${fmtTime(s.start+s.length)} (${hours(shiftWork(s,shifts,rules).net)})`;
}
function attendanceHours(net,rules=breakRules()){
  const target=Math.round(net*60);
  const candidates=[0,...rules.map(rule=>rule.minutes)].map(pause=>target+pause).sort((a,b)=>a-b);
  const minutes=candidates.find(minutes=>minutes-breakMinutes(minutes,rules)>=target);
  return minutes/60;
}
const dockDate=()=>focusDate||(todayKey()>=dateKey(week)&&todayKey()<=dateKey(addDays(week,6))?todayKey():dateKey(week));
const newShiftLength=(person,date)=>weekdayHours(person,date)===0?3:attendanceHours(weekdayHours(person,date));
function updateDockHours(date=dockDate()){
  const day=weekdays[(parseDate(date).getDay()+6)%7];
  document.querySelectorAll('.token').forEach(token=>{const person=data.people.find(person=>person.id===token.dataset.person),amount=weekdayHours(person,date),length=newShiftLength(person,date);token.querySelector('.token-hours').textContent=hours(amount);token.classList.toggle('off-day',amount===0);token.title=amount===0?`${day}: 0 h Soll · neue Schicht mit ${hours(length)} Anwesenheit`:`${day}: ${hours(amount)} netto · ${hours(length)} Anwesenheit inkl. Pause`;token.setAttribute('aria-label',`${person.name}, ${day}, ${hours(amount)}${amount===0?`, neue Schicht ${hours(length)}`:''}, einplanen`);});
}
const taskPalette=['#c482b9','#dba8c4','#e6a6ae','#e8b39d','#e6b078','#e6c58b','#dfd498','#c5cf9b','#a9c49a','#8cbea7','#8dbfb9','#91c5ce','#85b9e2','#9aafe0','#aaa4dd','#b9a5eb','#c4b1d9','#bdadb1','#adbcc7','#c5cdd7'];
const taskColor=t=>/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:task(t.type).color;
function taskInk(t){const hex=taskColor(t).slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#172032':'#ffffff';}
const taskRange=(s,t)=>`${fmtTime(s.start+t.offset)}–${fmtTime(s.start+t.offset+t.duration)}`;
function paletteField(value){const current=String(value).toLowerCase();return `<fieldset class="task-colors palette-field"><legend>Farbe</legend><div class="color-swatches">${taskPalette.map((color,i)=>`<button type="button" class="color-swatch" data-color="${color}" style="--swatch:${color}" aria-label="Farbe ${i+1}: ${color}" aria-pressed="${current===color}"></button>`).join('')}</div><label class="custom-task-color"><span>Eigene Farbe</span><input name="color" type="color" value="${esc(value)}"></label></fieldset>`;}
function wirePalette(form){const input=form.querySelector('input[name="color"]'),sync=()=>form.querySelectorAll('.color-swatch').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===input.value.toLowerCase())));form.querySelectorAll('.color-swatch').forEach(b=>b.onclick=()=>{input.value=b.dataset.color;sync();});input.oninput=sync;}
const freeColor=used=>{const taken=new Set(used.map(color=>String(color).toLowerCase()));return taskPalette.find(color=>!taken.has(color))||taskPalette[0];};
function colorPicker(t){return `<fieldset class="task-colors"><legend>Farbe</legend><div class="color-swatches">${taskPalette.map((color,i)=>`<button type="button" class="color-swatch" data-color="${color}" style="--swatch:${color}" aria-label="Farbe ${i+1}: ${color}" aria-pressed="${taskColor(t).toLowerCase()===color}"></button>`).join('')}</div><label class="custom-task-color"><span>Eigene Farbe</span><input id="task-color" type="color" value="${taskColor(t)}"></label></fieldset>`;}
function persist(){compactShifts();data.taskTypes=tasks;try{localStorage.setItem('flow-plan-v1',JSON.stringify(data));}catch{toast('Speichern fehlgeschlagen. Bitte den Plan über das Menü exportieren.');}}
function toast(message,undo){clearTimeout(toastTimer);const el=$('#toast');el.innerHTML=`<span>${esc(message)}</span>${undo?'<button>Rückgängig</button>':''}`;el.hidden=false;if(undo)el.querySelector('button').onclick=()=>{undo();el.hidden=true;};toastTimer=setTimeout(()=>el.hidden=true,6000);}
function isoWeek(d){const v=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));v.setUTCDate(v.getUTCDate()+3);return Math.ceil(((v-Date.UTC(v.getUTCFullYear(),0,1))/86400000+1)/7);}
function refresh(){renderDock();renderTimeline();}
function renderDock(){
  const people=visiblePeople(); $('.dock').setAttribute('aria-label',`Mitarbeitenden-Dock, ${people.length} im Einsatz`);
  $('#tokens').innerHTML=people.map(p=>`<button class="token ${picked===p.id?'selected':''}" draggable="true" data-person="${esc(p.id)}" style="--person:${p.color}" aria-label="${esc(p.name)}, ${hours(p.hours)}, einplanen"><span class="dot"></span><strong>${esc(p.name)}</strong><time data-day-hours="${esc(p.weekdayHours.map(hours).join('\n'))}"><span class="token-hours">${hours(p.hours)}</span></time></button>`).join('');
  document.querySelectorAll('.token').forEach(el=>{
    el.ondragstart=e=>{drag={kind:'person',id:el.dataset.person};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='copy';closePanel();};
    el.ondragend=clearDrop;
    el.onclick=()=>{copyPicked=false;picked=picked===el.dataset.person?null:el.dataset.person;refresh();};
  });
  updateDockHours();renderCopyTray();
}
function copyShift(id){const s=getShift(id);if(!s)return;copiedShift=structuredClone(s);copiedTask=null;copiedDay=null;copiedWeek=null;copyPicked=false;picked=null;closePanel();renderCopyTray();$('#copy-badge')?.focus();}
function copyTask(id,taskId){const t=getShift(id)?.segments.find(t=>t.id===taskId);if(!t)return;copiedTask=structuredClone(t);copiedShift=null;copiedDay=null;copiedWeek=null;copyPicked=false;picked=null;closePanel();renderCopyTray();$('#copy-badge')?.focus();}
const dayShifts=date=>data.shifts.filter(s=>s.date===date&&activeOn(data.people.find(p=>p.id===s.person),date)).toSorted((a,b)=>a.y-b.y||a.start-b.start);
const dayLabel=(date,options={weekday:'long'})=>new Date(date+'T12:00:00').toLocaleDateString('de-DE',options);
function copyDay(date){const shifts=dayShifts(date);if(!shifts.length)return;copiedDay={date,shifts:structuredClone(shifts)};copiedShift=null;copiedTask=null;copiedWeek=null;copyPicked=false;picked=null;closePanel();renderCopyTray();$('#copy-badge')?.focus();}
function dayCopyPlan(date){if(!copiedDay)return {add:[],skipped:0};const add=copiedDay.shifts.filter(s=>{const p=data.people.find(p=>p.id===s.person);return p&&activeOn(p,date)&&!data.shifts.some(other=>other.person===s.person&&other.date===date);});return {add,skipped:copiedDay.shifts.length-add.length};}
function dayCopyBlocked(date){if(date===copiedDay?.date)return 'Das ist der kopierte Tag';return dayCopyPlan(date).add.length?'':'Alle Personen sind hier bereits eingeplant oder nicht im Team';}
function placeDayCopy(date){if(!copiedDay)return;const blocked=dayCopyBlocked(date);if(blocked){toast(blocked+'.');return;}const {add,skipped}=dayCopyPlan(date),offset=data.shifts.filter(s=>s.date===date).length,created=add.map((source,index)=>{const s={...structuredClone(source),id:uid(),date,y:32+(offset+index)*56};s.segments.forEach(t=>t.id=uid());return s;});data.shifts.push(...created);copyPicked=false;persist();refresh();const ids=new Set(created.map(s=>s.id));toast(`${created.length} ${created.length===1?'Schicht':'Schichten'} auf ${dayLabel(date)} übernommen${skipped?`, ${skipped} übersprungen`:''}.`,()=>{data.shifts=data.shifts.filter(s=>!ids.has(s.id));persist();refresh();});}
function copyWeek(){
  const shifts=Array.from({length:7},(_,day)=>dayShifts(dateKey(addDays(week,day)))).flat();
  if(!shifts.length){toast('Diese Woche enthält noch keine Schichten.');return;}
  copiedWeek={date:dateKey(week),shifts:structuredClone(shifts)};
  copiedShift=null;copiedTask=null;copiedDay=null;copyPicked=false;picked=null;
  clearDrop();closePanel();closeMonthPicker();renderCopyTray();$('#copy-badge').focus();
  toast(`KW ${isoWeek(week)} kopiert. In einer anderen Woche auf die Planungsfläche ziehen.`);
}
function weekCopyPlan(){
  if(!copiedWeek)return {add:[],skipped:0};
  const add=[];
  for(const source of copiedWeek.shifts){
    // Calendar dates preserve weekdays across daylight-saving and year changes.
    const day=(parseDate(source.date).getDay()+6)%7,date=dateKey(addDays(week,day)),p=data.people.find(p=>p.id===source.person);
    if(p&&activeOn(p,date)&&!data.shifts.some(s=>s.person===source.person&&s.date===date))add.push({source,date});
  }
  return {add,skipped:copiedWeek.shifts.length-add.length};
}
function weekCopyBlocked(){
  if(dateKey(week)===copiedWeek?.date)return 'Das ist die kopierte Woche';
  return weekCopyPlan().add.length?'':'Alle Personen sind hier bereits eingeplant oder nicht im Team';
}
function placeWeekCopy(){
  if(!copiedWeek)return;
  const blocked=weekCopyBlocked();if(blocked){toast(blocked+'.');return;}
  const {add,skipped}=weekCopyPlan(),offsets=new Map();
  const created=add.map(({source,date})=>{
    const offset=offsets.get(date)??data.shifts.filter(s=>s.date===date).length;
    offsets.set(date,offset+1);
    const s={...structuredClone(source),id:uid(),date,y:32+offset*56};
    s.segments.forEach(t=>t.id=uid());return s;
  });
  data.shifts.push(...created);copyPicked=false;editing=null;closePanel();persist();refresh();
  const ids=new Set(created.map(s=>s.id));
  toast(`${created.length} ${created.length===1?'Schicht':'Schichten'} in KW ${isoWeek(week)} übernommen${skipped?`, ${skipped} übersprungen`:''}.`,()=>{data.shifts=data.shifts.filter(s=>!ids.has(s.id));persist();refresh();});
}
function clearWeekCopyPreview(){const board=$('.board');board.classList.remove('week-copy-target','week-copy-blocked');board.querySelector('.week-copy-hint')?.remove();}
function previewWeekCopy(e){
  e.preventDefault();e.stopPropagation();
  const blocked=weekCopyBlocked(),{add,skipped}=weekCopyPlan(),board=$('.board');
  e.dataTransfer.dropEffect=blocked?'none':'copy';
  board.classList.toggle('week-copy-target',!blocked);board.classList.toggle('week-copy-blocked',!!blocked);
  const message=blocked||`KW ${isoWeek(week)} · ${add.length} ${add.length===1?'Schicht':'Schichten'} einfügen${skipped?` · ${skipped} übersprungen`:''}`;
  let hint=board.querySelector('.week-copy-hint');
  if(!hint){hint=document.createElement('div');hint.className='week-copy-hint';hint.setAttribute('role','status');board.append(hint);}
  if(hint.textContent!==message)hint.textContent=message;
}
function positionCopyTray(){const tray=$('#copy-tray'),dock=$('.dock');if(!tray||tray.hidden||!dock)return;tray.style.marginLeft='';if(window.matchMedia?.('(max-width: 800px)').matches)return;const tokens=[...document.querySelectorAll('#tokens .token')],d=dock.getBoundingClientRect(),style=getComputedStyle(dock),left=d.left+parseFloat(style.paddingLeft||0),right=d.right-parseFloat(style.paddingRight||0),width=tray.getBoundingClientRect().width,tokensRight=tokens.length?Math.max(...tokens.map(t=>t.getBoundingClientRect().right)):left,centered=(left+right-width)/2,gap=16;
  // Center the tray when possible; otherwise keep it as close to the center as the member pills allow.
  const target=Math.max(centered,tokensRight+gap);if(target+width<=right)tray.style.marginLeft=Math.max(0,target-tokensRight-parseFloat(style.columnGap||0))+'px';}
function renderCopyTray(){
  const tray=$('#copy-tray');if(!tray)return;tray.hidden=!copiedShift&&!copiedTask&&!copiedDay&&!copiedWeek;if(tray.hidden){tray.innerHTML='';return;}
  if(copiedWeek){const start=parseDate(copiedWeek.date),count=copiedWeek.shifts.length,label=`KW ${isoWeek(start)} · ${addDays(start,3).getFullYear()}`;tray.innerHTML=`<button id="copy-badge" draggable="true" class="copy-badge day-copy-badge week-copy-badge ${copyPicked?'selected':''}" style="--person:#c5b2ed" aria-pressed="${copyPicked}" aria-label="${label} kopiert, ${count} ${count===1?'Schicht':'Schichten'}, auf eine andere Woche ziehen"><strong>${label}</strong><time>${count} ${count===1?'Schicht':'Schichten'} · Auf eine Woche ziehen</time></button>`;}
  else if(copiedDay){const count=copiedDay.shifts.length;tray.innerHTML=`<button id="copy-badge" draggable="true" class="copy-badge day-copy-badge ${copyPicked?'selected':''}" style="--person:#c5b2ed" aria-pressed="${copyPicked}" aria-label="${esc(dayLabel(copiedDay.date))} kopiert, ${count} ${count===1?'Schicht':'Schichten'}, auf einen anderen Tag ziehen"><strong>${esc(dayLabel(copiedDay.date,{weekday:'short',day:'2-digit',month:'2-digit'}))}</strong><span class="day-copy-dots">${copiedDay.shifts.map(s=>`<i style="--dot:${data.people.find(p=>p.id===s.person)?.color||'#c5b2ed'}"></i>`).join('')}</span><time>${count} ${count===1?'Schicht':'Schichten'} · Auf einen Tag ziehen</time></button>`;}
  else if(copiedTask){const t=copiedTask,name=t.label||task(t.type).name;tray.innerHTML=`<button id="copy-badge" draggable="true" class="copy-badge task-copy-badge ${copyPicked?'selected':''}" style="--person:${taskColor(t)};color:${taskInk(t)}" aria-pressed="${copyPicked}" aria-label="${esc(name)} kopiert, ${hours(t.duration)}, in eine Schicht ziehen"><strong>${esc(name)}</strong><time>${hours(t.duration)} · In eine Schicht ziehen</time></button>`;}
  else {const p=data.people.find(p=>p.id===copiedShift.person);tray.innerHTML=`<button id="copy-badge" draggable="true" class="copy-badge ${copyPicked?'selected':''}" style="--person:${p.color}" aria-pressed="${copyPicked}" aria-label="Schichtkopie von ${esc(p.name)} auf einen Tag ziehen"><span class="copy-mini-track">${copiedShift.segments.map(t=>`<span class="copy-mini-task" style="left:${t.offset/copiedShift.length*100}%;width:${t.duration/copiedShift.length*100}%;background:${taskColor(t)};color:${taskInk(t)}"><span>${esc(t.label||task(t.type).name)}</span></span>`).join('')}</span><span class="copy-mini-meta" style="color:${copiedShift.segments.find(t=>t.offset===0)?taskInk(copiedShift.segments.find(t=>t.offset===0)):'#172032'}"><strong>${esc(p.name)}</strong><time>${fmtTime(copiedShift.start)}–${fmtTime(copiedShift.start+copiedShift.length)}</time></span></button>`;}
  tray.insertAdjacentHTML('beforeend',`<button id="dismiss-copy" class="icon-button" aria-label="${copiedWeek?'Wochen':copiedDay?'Tages':copiedTask?'Aufgaben':'Schicht'}kopie verwerfen">${icon('close')}</button>`);
  $('#copy-badge').ondragstart=e=>{drag=copiedWeek?{kind:'week-copy'}:copiedDay?{kind:'day-copy'}:copiedTask?{kind:'task-copy'}:{kind:'copy',id:copiedShift.person};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='copy';closePanel();if(copiedTask)startTaskCopyGhost(e);};
  $('#copy-badge').ondragend=clearDrop;$('#copy-badge').onclick=()=>{copyPicked=!copyPicked;picked=null;renderCopyTray();};$('#dismiss-copy').onclick=()=>{copiedShift=null;copiedTask=null;copiedDay=null;copiedWeek=null;copyPicked=false;clearDrop();renderCopyTray();};
  positionCopyTray();
}
function taskCopyPlacement(s,offset){if(!s)return {error:'Aufgabenkopie in eine bestehende Schicht ziehen.'};const gap=findGap(s,offset,copiedTask.duration);return gap?{gap}:{error:'Kein ausreichend großer freier Bereich in dieser Schicht. Bitte zuerst Platz schaffen.'};}
function startTaskCopyGhost(e){
  const badge=$('#copy-badge'),ghost=badge.cloneNode(true),rect=badge.getBoundingClientRect();
  ghost.removeAttribute('id');ghost.removeAttribute('draggable');ghost.removeAttribute('aria-pressed');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.className='copy-badge task-copy-badge task-copy-ghost';
  ghost.style.left=(Number.isFinite(e.clientX)?e.clientX:rect.left+rect.width/2)+'px';ghost.style.top=(Number.isFinite(e.clientY)?e.clientY:rect.top+rect.height/2)+'px';
  document.body.append(ghost);
  // The native drag image cannot change size mid-drag; use a movable DOM preview.
  const image=document.createElement('canvas');image.width=image.height=1;ghost.append(image);e.dataTransfer.setDragImage?.(image,0,0);
}
function updateTaskCopyGhost(e){
  const ghost=$('.task-copy-ghost');if(!ghost||drag?.kind!=='task-copy')return;
  ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
  const target=e.target.closest?.('.shift'),s=getShift(target?.dataset.shift),placement=taskCopyPlacement(s,s?hourAt(target.parentElement,e.clientX)-s.start:0),valid=!placement.error;
  document.querySelectorAll('.task-copy-target').forEach(el=>{if(el!==target||!valid)el.classList.remove('task-copy-target');});
  if(valid)target.classList.add('task-copy-target');ghost.classList.toggle('over-target',valid);
  ghost.querySelector('time').textContent=`${hours(copiedTask.duration)} · ${valid?'Bei '+data.people.find(p=>p.id===s.person).name+' platzieren':'In eine Schicht ziehen'}`;
}
document.addEventListener('dragover',updateTaskCopyGhost);
document.addEventListener('dragleave',e=>{if(e.target===document.documentElement&&!e.relatedTarget){$('.task-copy-ghost')?.classList.remove('over-target');document.querySelectorAll('.task-copy-target').forEach(el=>el.classList.remove('task-copy-target'));}});
function placeTaskCopy(s,offset=0){if(!copiedTask)return;const placement=taskCopyPlacement(s,offset);if(placement.error){toast(placement.error);return;}const t={...structuredClone(copiedTask),...placement.gap,id:uid()};s.segments.push(t);copyPicked=false;editing=s.id;selected=s.id;persist();refresh();}
function placeCopy(date,y=32){if(!copiedShift)return;const p=data.people.find(p=>p.id===copiedShift.person);if(!p||!activeOn(p,date)){toast('Diese Person ist an diesem Tag nicht im Team.');return;}if(data.shifts.some(s=>s.person===p.id&&s.date===date)){toast('Diese Person ist an diesem Tag bereits eingeplant.');return;}const s={...structuredClone(copiedShift),id:uid(),date};s.segments.forEach(t=>t.id=uid());data.shifts.push(s);placeInDay(s,y);copyPicked=false;persist();refresh();}
function closeWeekInfo(){$('#week-info').hidden=true;$('#week-info-toggle').setAttribute('aria-expanded','false');}
function renderWeekInfo(){
  const panel=$('#week-info');if(!panel||panel.hidden)return;
  const expanded=new Set([...panel.querySelectorAll('details[open]')].map(el=>el.dataset.summaryPerson));
  const start=dateKey(week),end=dateKey(addDays(week,6)),shifts=data.shifts.filter(s=>s.date>=start&&s.date<=end),total=workTotals(shifts);
  panel.innerHTML=`<div class="week-info-top"><div><strong>Wochenübersicht</strong><small>${week.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}–${addDays(week,6).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} · Mo–So</small></div><button id="close-week-info" class="icon-button" aria-label="Wochenübersicht schließen">${icon('close')}</button></div><div class="week-info-total"><b>${hours(total.net)}</b><span>${shifts.length} Schichten · ${hours(total.pause)} Pause</span></div>${data.people.filter(p=>shifts.some(s=>s.person===p.id&&s.length>0)).map(p=>{
    const own=shifts.filter(s=>s.person===p.id),totals=workTotals(own),groups=new Map();
    own.forEach(s=>s.segments.forEach(t=>{const key=t.type==='flex'?`flex:${t.label}`:t.type;const group=groups.get(key)||{name:t.type==='flex'?(t.label||task(t.type).name):task(t.type).name,color:taskColor(t),hours:0};group.hours+=t.duration;groups.set(key,group);}));
    const unassigned=totals.gross-[...groups.values()].reduce((n,g)=>n+g.hours,0);
    if(unassigned>.001)groups.set('unassigned',{name:'Ohne Aufgabe',color:'#66758a',hours:unassigned});
    return `<details data-summary-person="${p.id}" ${expanded.has(p.id)?'open':''}><summary><i style="background:${p.color}"></i><span>${esc(p.name)}</span><b class="weekly-comparison"><span>${hours(totals.net)} <small>Ist (netto)</small></span><span>${p.weeklyHours==null?'—':hours(p.weeklyHours)} <small>Soll</small></span></b>${icon('chevron-down')}</summary><div class="weekly-tasks"><p class="modal-note">${hours(totals.gross)} Anwesenheit − ${hours(totals.pause)} Pause = ${hours(totals.net)} Arbeitszeit. Aufgabenzeiten: brutto, ohne festgelegte Pausenlage.</p>${groups.size?[...groups.values()].sort((a,b)=>b.hours-a.hours).map(g=>`<div class="weekly-task"><span><i style="background:${g.color}"></i>${esc(g.name)}</span><b>${hours(g.hours)}</b><small>${totals.gross?Math.round(g.hours/totals.gross*100):0} %</small></div>`).join(''):'<p>Noch keine Schichten in dieser Woche.</p>'}</div></details>`;
  }).join('')}`;
  $('#close-week-info').onclick=closeWeekInfo;
  if(!shifts.length)panel.insertAdjacentHTML('beforeend','<p class="week-empty">Noch keine Schichten in dieser Woche.</p>');
  panel.querySelectorAll('details').forEach(el=>el.querySelector('summary').onclick=e=>{
    e.preventDefault();const content=el.querySelector('.weekly-tasks');
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){el.open=!el.open;return;}
    if(el.dataset.animating)return;
    el.dataset.animating='true';const opening=!el.open;if(opening)el.open=true;const height=content.scrollHeight;
    const animation=content.animate([{height:(opening?0:height)+'px',opacity:opening?0:1},{height:(opening?height:0)+'px',opacity:opening?1:0}],{duration:200,easing:'ease-out'});
    animation.onfinish=()=>{el.open=opening;delete el.dataset.animating;};
  });
}
const editExtra=s=>editing===s.id&&s.segments.length?12+s.segments.length*48:0;
function displayY(s){const open=getShift(editing);return s.y+(open&&open.id!==s.id&&open.date===s.date&&s.y>=open.y?editExtra(open):0);}
function animateLayout(change){const before=new Map([...document.querySelectorAll('.shift,.segment')].map(el=>[el.dataset.task||el.dataset.shift,el.getBoundingClientRect()]));change();if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const after=new Map([...document.querySelectorAll('.shift,.segment')].map(el=>[el.dataset.task||el.dataset.shift,el.getBoundingClientRect()]));document.querySelectorAll('.shift,.segment').forEach(el=>{const old=before.get(el.dataset.task||el.dataset.shift);if(!old||!el.animate)return;const now=after.get(el.dataset.task||el.dataset.shift),parent=el.classList.contains('segment')?el.closest('.shift'):null,previousParent=parent&&before.get(parent.dataset.shift),currentParent=parent&&after.get(parent.dataset.shift);const dx=(old.left-now.left-(previousParent?previousParent.left-currentParent.left:0))/zoom,dy=(old.top-now.top-(previousParent?previousParent.top-currentParent.top:0))/zoom;el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:260,easing:'cubic-bezier(.22,.68,.18,1)'});});}
function shiftMarkup(s){
  const p=data.people.find(p=>p.id===s.person);
  return `<div class="shift ${editing===s.id?'editing':''}" tabindex="0" role="group" data-shift="${s.id}" style="--meta-ink:${s.segments.find(t=>t.offset===0)?taskInk(s.segments.find(t=>t.offset===0)):'#172032'};--person:${p.color};--start:${(s.start-DAY_START)/DAY_SPAN};--duration:${s.length/DAY_SPAN};top:${displayY(s)}px;--task-count:${s.segments.length}" title="${esc(p.name)}, ${shiftTime(s)} netto" aria-label="${esc(p.name)}, ${shiftTime(s)} netto"><div class="task-track">${s.segments.toSorted((a,b)=>a.offset-b.offset).map((t,i)=>`<button class="segment" data-task="${t.id}" title="${esc(t.label||task(t.type).name)} · ${taskRange(s,t)}" style="--row:${i};--task-ink:${taskInk(t)};--segment:${taskColor(t)};left:${t.offset/s.length*100}%;width:${t.duration/s.length*100}%" aria-label="${esc(t.label||task(t.type).name)}, ${fmtTime(s.start+t.offset)} bis ${fmtTime(s.start+t.offset+t.duration)}"><span class="task-caption"><b>${esc(t.label||task(t.type).name)}</b><time class="task-time">${taskRange(s,t)}</time></span><span class="task-outside" aria-hidden="true"><b>${esc(t.label||task(t.type).name)}</b><time class="task-time">${taskRange(s,t)}</time></span><span class="task-resize task-start" data-edge="task-start" title="Aufgabenbeginn ziehen"></span><span class="task-resize" data-edge="task-end" title="Aufgabenende ziehen"></span></button>`).join('')}</div><span class="shift-meta"><span class="shift-name">${esc(p.name)}</span><time class="shift-time">${shiftTime(s)}</time></span><button class="shift-edit" title="Bearbeitungsmodus umschalten" aria-pressed="${editing===s.id}" aria-label="${esc(p.name)} bearbeiten">${icon('edit')}</button>${editing===s.id?`<button class="shift-copy" title="Schicht kopieren" aria-label="Schicht von ${esc(p.name)} kopieren">${icon('copy')}</button>`:''}<span class="resize-handle start" data-edge="start" title="Schichtbeginn ändern"></span><span class="resize-handle end" data-edge="end" title="Schichtende ändern"></span></div>`;
}
function miniShiftMarkup(s){
  const p=data.people.find(p=>p.id===s.person),range=shiftTime(s);
  const description=[`${p.name}, ${range} netto`,...s.segments.toSorted((a,b)=>a.offset-b.offset).map(t=>`${t.label||task(t.type).name}: ${taskRange(s,t)}`)].join('\n');
  return `<button class="day-mini-shift" data-mini-shift="${s.id}" style="--person:${p.color}" title="${esc(description)}" aria-label="${esc(p.name)}, ${range}, Tag öffnen"><span class="day-mini-track" aria-hidden="true"><span class="day-mini-bar" style="left:${(s.start-DAY_START)/DAY_SPAN*100}%;width:${s.length/DAY_SPAN*100}%">${s.segments.map(t=>`<span style="left:${t.offset/s.length*100}%;width:${t.duration/s.length*100}%;background:${taskColor(t)}"></span>`).join('')}</span></span></button>`;
}
function renderTimeline(){
  const ds=dates(),last=addDays(week,6);
  $('#date-range').textContent=`${week.toLocaleDateString('de-DE',{day:'numeric',month:'short'})} – ${last.toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'})}`;
  $('#week-number').textContent='KW '+isoWeek(week);
  $('#week-number').setAttribute('aria-label',`KW ${isoWeek(week)} kopieren, ${dayLabel(dateKey(week),{day:'numeric',month:'long',year:'numeric'})} bis ${dayLabel(dateKey(last),{day:'numeric',month:'long',year:'numeric'})}`);
  const grid=$('#timeline'); grid.style.setProperty('--days',ds.length);
  grid.innerHTML=ds.map(d=>{const key=dateKey(d),shifts=data.shifts.filter(s=>s.date===key&&activeOn(data.people.find(p=>p.id===s.person),key));return `<section class="day-column" data-date="${key}"><button class="day-head ${key===todayKey()?'current':''}" data-date="${key}" aria-label="${d.toLocaleDateString('de-DE',{weekday:'long'})} öffnen"><span class="day-title"><span class="day-name">${d.toLocaleDateString('de-DE',{weekday:'long'})}</span><span class="day-short">${d.toLocaleDateString('de-DE',{weekday:'short'})}</span><span class="day-date">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</span></span><span class="hours">${[8,10,12,14,16,18,20,22,24].map(h=>`<span>${String(h).padStart(2,'0')}</span>`).join('')}</span></button>${shifts.length?`<div class="day-copy-anchor"><button class="day-copy" data-copy-day="${key}" title="Tag kopieren" aria-label="${d.toLocaleDateString('de-DE',{weekday:'long'})} kopieren">${icon('copy')}</button></div>`:''}<div class="day-cell" data-date="${key}" tabindex="0" aria-label="${d.toLocaleDateString('de-DE',{weekday:'long'})}, Schicht platzieren" style="min-height:${Math.max(0,...shifts.map(s=>displayY(s)+editExtra(s)+100))}px">${shifts.map(shiftMarkup).join('')}</div></section>`;}).join('');
  grid.querySelectorAll('.day-cell').forEach(cell=>{
    const shifts=data.shifts.filter(s=>s.date===cell.dataset.date&&activeOn(data.people.find(p=>p.id===s.person),s.date)).toSorted((a,b)=>a.y-b.y||a.start-b.start);
    cell.insertAdjacentHTML('beforeend',`<div class="day-miniatures" hidden>${shifts.map(miniShiftMarkup).join('')}</div>`);
    cell.querySelectorAll('.day-mini-shift').forEach(button=>button.onclick=e=>{
      e.stopPropagation();if(suppressClick)return;expandDay(cell.dataset.date);cell.parentElement.querySelector('.day-head').focus({preventScroll:true});
    });
  });
  updateFocus();applyZoom();renderWeekInfo();
  grid.querySelectorAll('.day-column').forEach(column=>{column.ondragleave=e=>{if(column.contains(e.relatedTarget))return;removePreview(column.querySelector('.day-cell'));if(hoverDay===column.dataset.date){clearTimeout(expandTimer);hoverDay=null;}};});
  grid.querySelectorAll('.day-head').forEach(b=>{b.onclick=()=>expandDay(focusDate===b.dataset.date?null:b.dataset.date);b.ondragenter=b.ondragover=e=>{if(drag){e.preventDefault();const blocked=dropBlocked(b.dataset.date);e.dataTransfer.dropEffect=blocked||drag.kind==='task-copy'?'none':'copy';const cell=b.parentElement.querySelector('.day-cell');if(blocked)previewDrop(cell,e);else {document.querySelectorAll('.day-cell').forEach(removePreview);queueExpand(b.dataset.date);}}};b.ondrop=e=>{e.preventDefault();if(drag?.kind==='day-copy')placeDayCopy(b.dataset.date);else if(drag?.kind==='person')createShift(drag.id,b.dataset.date,8,32);else if(drag?.kind==='copy')placeCopy(b.dataset.date);else if(drag?.kind==='task-copy')placeTaskCopy(null);clearDrop();};});
  grid.querySelectorAll('.day-cell').forEach(cell=>{
    cell.ondragenter=cell.ondragover=e=>{if(!drag)return;e.preventDefault();if((drag.kind==='person'||drag.kind==='copy'||drag.kind==='task-copy')&&!dropBlocked(cell.dataset.date))queueExpand(cell.dataset.date);previewDrop(cell,e);};
    cell.ondragleave=e=>{if(!cell.contains(e.relatedTarget))removePreview(cell);};
    cell.ondrop=e=>{e.preventDefault();removePreview(cell);if(!drag)return;const payload=drag;clearDrop();if(payload.kind==='person')createShift(payload.id,cell.dataset.date,hourAt(cell,e.clientX),yAt(cell,e.clientY));else if(payload.kind==='copy')placeCopy(cell.dataset.date,yAt(cell,e.clientY));else if(payload.kind==='day-copy')placeDayCopy(cell.dataset.date);else {const s=getShift(e.target.closest('.shift')?.dataset.shift);if(payload.kind==='task-copy')placeTaskCopy(s,s?hourAt(cell,e.clientX)-s.start:0);else if(s)addTask(s,payload.id,hourAt(cell,e.clientX)-s.start);}};
    cell.onclick=e=>{if(suppressClick||e.target.closest('.shift'))return;if(copyPicked){if(copiedDay)placeDayCopy(cell.dataset.date);else if(copiedTask)placeTaskCopy(null);else placeCopy(cell.dataset.date,yAt(cell,e.clientY));}else if(picked)createShift(picked,cell.dataset.date,hourAt(cell,e.clientX),yAt(cell,e.clientY));else {animateLayout(()=>{editing=null;closePanel();renderTimeline();});}};
    cell.onkeydown=e=>{if(e.target===cell&&(picked||copyPicked)&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(copyPicked){if(copiedDay)placeDayCopy(cell.dataset.date);else if(copiedTask)placeTaskCopy(null);else placeCopy(cell.dataset.date);}else createShift(picked,cell.dataset.date,8,32);}};
  });
  grid.querySelectorAll('.day-copy').forEach(button=>{const head=button.closest('.day-column').querySelector('.day-head'),place=()=>{const title=[...head.querySelectorAll('.day-name,.day-short')].find(el=>el.offsetWidth),h=head.getBoundingClientRect(),z=h.width/(head.offsetWidth||h.width)||1;if(!title)return;const r=title.getBoundingClientRect(),a=button.parentElement.getBoundingClientRect();button.style.left=(r.right-a.left)/z+6+'px';button.style.top=((r.top+r.bottom)/2-a.top)/z+'px';};head.addEventListener('pointerenter',place);button.addEventListener('focus',place);button.onclick=e=>{e.stopPropagation();copyDay(button.dataset.copyDay);};});
  grid.querySelectorAll('.day-column').forEach(column=>{column.onpointerenter=()=>updateDockHours(column.dataset.date);column.onpointerleave=()=>updateDockHours();});
  grid.querySelectorAll('.shift').forEach(el=>{
    el.onpointerdown=startGesture;
    el.oncontextmenu=e=>{e.preventDefault();showToolkit(el.dataset.shift);};
    el.ondblclick=e=>{if(!e.target.closest('button'))showToolkit(el.dataset.shift);};
    if(editing===el.dataset.shift){const s=getShift(el.dataset.shift);el.querySelector('.task-track').insertAdjacentHTML('beforeend',s.segments.toSorted((a,b)=>a.offset-b.offset).map((t,i)=>`<button class="task-copy" data-copy-task="${t.id}" style="--row:${i};--task-ink:${taskInk(t)};left:calc(${(t.offset+t.duration)/s.length*100}% - 27px)" title="Aufgabe kopieren" aria-label="${esc(t.label||task(t.type).name)} kopieren">${icon('copy')}</button>`).join(''));}
    el.onclick=e=>{e.stopPropagation();if(suppressClick)return;selected=el.dataset.shift;if(e.target.closest('.task-copy'))copyTask(el.dataset.shift,e.target.closest('.task-copy').dataset.copyTask);else if(e.target.closest('.shift-copy')){copyShift(el.dataset.shift);}else if(e.target.closest('.shift-edit')){toggleEditing(el.dataset.shift);}else if(copyPicked&&copiedDay)placeDayCopy(el.closest('.day-cell').dataset.date);else if(copyPicked&&copiedTask){const s=getShift(el.dataset.shift);placeTaskCopy(s,hourAt(el.parentElement,e.clientX)-s.start);}else if(!copyPicked&&editing!==el.dataset.shift){toggleEditing(el.dataset.shift);}else if(editing===el.dataset.shift&&e.target.closest('[data-task]'))showToolkit(el.dataset.shift,e.target.closest('[data-task]').dataset.task);};
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){if(e.target.closest('.shift-edit,.shift-copy,.task-copy'))return;e.preventDefault();if(copyPicked&&copiedDay){placeDayCopy(el.closest('.day-cell').dataset.date);return;}if(copyPicked&&copiedTask){const s=getShift(el.dataset.shift),t=s.segments.find(t=>t.id===e.target.closest('[data-task]')?.dataset.task);placeTaskCopy(s,t?.offset||0);return;}const taskId=e.target.closest('[data-task]')?.dataset.task;if(taskId&&editing===el.dataset.shift)showToolkit(el.dataset.shift,taskId);else toggleEditing(el.dataset.shift);}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){if(e.target.closest('.task-copy'))return;e.preventDefault();const s=getShift(el.dataset.shift);s.start=clamp(s.start+(e.key==='ArrowRight'?.25:-.25),8,DAY_END-s.length);persist();renderTimeline();document.querySelector(`[data-shift="${s.id}"]`)?.focus();}};
  });
}
function toggleEditing(id){const next=editing===id?null:id;animateLayout(()=>{closePanel();editing=next;selected=next;renderTimeline();});if(next)document.querySelector(`[data-shift="${id}"]`)?.classList.add('edit-cue');document.querySelector(`[data-shift="${id}"] .shift-edit`)?.focus();}
function updateTaskLabels(){document.querySelectorAll('.shift.editing .segment').forEach(el=>{const label=el.querySelector('.task-outside'),caption=el.querySelector('.task-caption'),r=el.getBoundingClientRect(),cell=el.closest('.day-cell').getBoundingClientRect();const right=cell.right-r.right-14,left=r.left-cell.left-14;const outside=r.width/zoom<label.scrollWidth+22&&Math.max(left,right)>80;el.classList.toggle('outside-label',outside);label.classList.toggle('on-left',left>right);label.style.maxWidth=Math.max(80,Math.max(left,right)/zoom)+'px';});}
function applyZoom(){const grid=$('#timeline'),scroll=$('#grid-scroll'),surface=$('.canvas-surface');grid.style.transform=`scale(${zoom})`;scroll.style.scrollPaddingTop=($('.day-head')?.offsetHeight||60)*zoom+'px';
  // Use the fractional viewport width: clientWidth rounds up on sub-pixel boards and leaves a tiny horizontal overflow.
  const visible=()=>Math.floor(scroll.getBoundingClientRect().width-(scroll.offsetWidth-scroll.clientWidth)),fit=()=>Math.max(720,visible()||720);
  const layout=()=>{const width=fit();scroll.style.overflowX=Math.floor(width*zoom)>visible()?'auto':'hidden';grid.style.width=width+'px';surface.style.width=Math.floor(width*zoom)+'px';grid.style.minHeight=scroll.clientHeight/zoom+'px';surface.style.height=Math.max(grid.getBoundingClientRect().height,scroll.clientHeight)+'px';return width;};
  // A vertical scrollbar appearing after the height update narrows the viewport, so lay out once more if needed.
  if(layout()!==fit())layout();
  $('#zoom-value').textContent=Math.round(zoom*100)+'%';$('#zoom-out').disabled=zoom<=.75;$('#zoom-in').disabled=zoom>=1.75;requestAnimationFrame(updateTaskLabels);}
function setZoom(value){zoom=clamp(Math.round(value*100)/100,.75,1.75);data.settings.zoom=zoom;closePanel();applyZoom();persist();}
function updateFocus(){const ds=dates();$('#timeline').style.gridTemplateColumns=ds.map(d=>`minmax(0,${focusDate&&dateKey(d)===focusDate?12:1}fr)`).join(' ');document.querySelectorAll('#timeline .day-column').forEach(el=>{
  const folded=!!focusDate&&el.dataset.date!==focusDate;
  el.classList.toggle('folded',folded);el.classList.toggle('expanded',el.dataset.date===focusDate);
  el.querySelector('.day-miniatures').hidden=!folded;
  el.querySelectorAll('.shift').forEach(shift=>shift.inert=folded);
});}
function expandDay(date){closePanel();focusDate=date;updateFocus();updateDockHours();setTimeout(updateTaskLabels,300);}
function queueExpand(date){updateDockHours(date);if(hoverDay===date)return;clearTimeout(expandTimer);hoverDay=null;if(focusDate===date)return;hoverDay=date;expandTimer=setTimeout(()=>{expandDay(date);hoverDay=null;},220);}
function yAt(cell,y){let local=(y-cell.getBoundingClientRect().top)/zoom-(gesture?.grabY??20);const open=getShift(editing);if(open&&gesture?.s.id!==open.id&&open.date===cell.dataset.date&&local>open.y+44)local=Math.max(open.y+44,local-editExtra(open));return local;}
function freeY(date,wanted,ignore){
  return 32+data.shifts.filter(s=>s.id!==ignore&&s.date===date&&s.y<=wanted).length*56;
}
function compactShifts(shifts=data.shifts){
  const days=new Map();
  shifts.forEach(s=>{if(!days.has(s.date))days.set(s.date,[]);days.get(s.date).push(s);});
  days.forEach(day=>day.sort((a,b)=>a.y-b.y).forEach((s,index)=>s.y=32+index*56));
}
function placeInDay(s,wanted){
  const day=data.shifts.filter(other=>other!==s&&other.date===s.date).sort((a,b)=>a.y-b.y);
  const index=day.filter(other=>other.y<=wanted).length;
  day.splice(index,0,s);day.forEach((shift,row)=>shift.y=32+row*56);
  compactShifts();
}
function hourAt(cell,x){const r=cell.getBoundingClientRect();return snap(8+(x-r.left)/r.width*DAY_SPAN);}
function removePreview(cell){cell.classList.remove('drag-over','drop-blocked');cell.querySelector('.drop-preview')?.remove();cell.querySelectorAll('.drop-rejection').forEach(el=>el.remove());cell.querySelectorAll('.shift').forEach(el=>el.style.top=displayY(getShift(el.dataset.shift))+'px');}
function dropBlocked(date){if(drag?.kind==='day-copy')return dayCopyBlocked(date);if(drag?.kind!=='person'&&drag?.kind!=='copy')return '';const p=data.people.find(p=>p.id===drag.id);if(!p||!activeOn(p,date))return 'An diesem Tag nicht im Team';if(drag.kind==='person'&&newShiftLength(p,date)>DAY_SPAN)return 'Tagesstunden einschließlich Pause passen nicht in 08:00–24:00';return data.shifts.some(s=>s.person===p.id&&s.date===date)?`${p.name} ist bereits eingeplant`:'';}
function clearDrop(){drag=null;clearTimeout(expandTimer);hoverDay=null;clearWeekCopyPreview();$('.task-copy-ghost')?.remove();document.querySelectorAll('.task-copy-target').forEach(el=>el.classList.remove('task-copy-target'));document.querySelectorAll('.day-cell').forEach(removePreview);updateDockHours();}
function previewDrop(cell,e){
  document.querySelectorAll('.day-cell').forEach(removePreview);updateDockHours(cell.dataset.date);
  if(drag.kind==='day-copy'){const blocked=dayCopyBlocked(cell.dataset.date);if(blocked){e.dataTransfer.dropEffect='none';cell.classList.add('drop-blocked');cell.insertAdjacentHTML('beforeend',`<span class="drop-rejection">${icon('ban')}${esc(blocked)}</span>`);return;}e.dataTransfer.dropEffect='copy';const {add,skipped}=dayCopyPlan(cell.dataset.date);cell.classList.add('drag-over');cell.insertAdjacentHTML('beforeend',`<span class="drop-rejection day-copy-hint">${icon('copy')}${add.length} ${add.length===1?'Schicht':'Schichten'} einfügen${skipped?` · ${skipped} übersprungen`:''}</span>`);return;}
  if(drag.kind==='task-copy'){const s=getShift(e.target.closest('.shift')?.dataset.shift),placement=taskCopyPlacement(s,s?hourAt(cell,e.clientX)-s.start:0);if(placement.error){e.dataTransfer.dropEffect='none';cell.classList.add('drop-blocked');cell.insertAdjacentHTML('beforeend',`<span class="drop-rejection">${icon('ban')}${esc(placement.error)}</span>`);return;}e.dataTransfer.dropEffect='copy';const {gap}=placement,start=s.start+gap.offset;cell.insertAdjacentHTML('beforeend',`<div class="drop-preview" style="top:${displayY(s)}px;left:${(start-DAY_START)/DAY_SPAN*100}%;width:${gap.duration/DAY_SPAN*100}%"><span>${fmtTime(start)} · ${hours(gap.duration)}</span></div>`);return;}
  const blocked=dropBlocked(cell.dataset.date);if(blocked){e.dataTransfer.dropEffect='none';cell.classList.add('drop-blocked');cell.insertAdjacentHTML('beforeend',`<span class="drop-rejection">${icon('ban')}${esc(blocked)}</span>`);return;}e.dataTransfer.dropEffect='copy';
  let start,length,y;
  if(drag.kind==='person'){const p=data.people.find(p=>p.id===drag.id);if(!p||!activeOn(p,cell.dataset.date))return;length=newShiftLength(p,cell.dataset.date);start=clamp(hourAt(cell,e.clientX),8,DAY_END-length);y=freeY(cell.dataset.date,yAt(cell,e.clientY));}
  else if(drag.kind==='copy'){start=copiedShift.start;length=copiedShift.length;y=freeY(cell.dataset.date,yAt(cell,e.clientY));}else {const s=getShift(e.target.closest('.shift')?.dataset.shift);if(!s)return;start=s.start;length=s.length;y=s.y;}
  if(drag.kind==='person'||drag.kind==='copy')cell.querySelectorAll('.shift').forEach(el=>{const s=getShift(el.dataset.shift);el.style.top=displayY(s)+(s.y>=y?56:0)+'px';});
  cell.insertAdjacentHTML('beforeend',`<div class="drop-preview" style="top:${displayY({date:cell.dataset.date,y,id:drag.kind==='task'?e.target.closest('.shift')?.dataset.shift:null})}px;left:${(start-DAY_START)/DAY_SPAN*100}%;width:${length/DAY_SPAN*100}%"><span>${fmtTime(start)} · ${hours(length)}</span></div>`);
}
function createShift(person,date,start=8,y=32){
  const p=data.people.find(p=>p.id===person);if(!p||!activeOn(p,date)){toast('Diese Person ist an diesem Tag nicht im Team.');return;}
  const old=data.shifts.find(s=>s.person===person&&s.date===date);if(old){toast('Diese Person ist an diesem Tag bereits eingeplant.');return;}
  const length=newShiftLength(p,date);if(length>DAY_SPAN){toast('Tagesstunden einschließlich Pause passen nicht in den Zeitraum 08:00–24:00. Bitte Tagesstunden oder Pausenregel anpassen.');return;}
  const s={id:uid(),person,date,start:clamp(snap(start),8,DAY_END-length),y:32,length,segments:[]};data.shifts.push(s);placeInDay(s,y);picked=null;persist();refresh();
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
  const target=wanted===0&&from>0?0:wanted===s.length-t.duration&&from<sorted.length-1?sorted.length-1:sorted.findIndex(x=>x!==t&&wanted+t.duration/2>=x.offset&&wanted+t.duration/2<x.offset+x.duration);
  if(target<0){if(gap)t.offset=gap.offset;return;}
  const lo=Math.min(from,target),hi=Math.max(from,target),section=sorted.slice(lo,hi+1);let cursor=section[0].offset;
  section.splice(section.indexOf(t),1);section.splice(target>from?section.length:0,0,t);
  section.forEach(x=>{x.offset=cursor;cursor+=x.duration;});
}
function closePanel(){selected=null;$('#detail').hidden=true;document.querySelectorAll('.shift.active').forEach(el=>el.classList.remove('active'));}
function showToolkit(id,taskId){
  const s=getShift(id);if(!s)return;if(editing!==id)animateLayout(()=>{editing=id;renderTimeline();});selected=id;const p=data.people.find(p=>p.id===s.person),t=s.segments.find(t=>t.id===taskId),panel=$('#detail');
  document.querySelectorAll('.shift.active').forEach(el=>el.classList.remove('active'));const anchor=document.querySelector(`[data-shift="${id}"]`);if(!anchor)return;anchor.classList.add('editing');
  panel.hidden=false;panel.innerHTML=`<div class="toolkit-top"><strong>${t?'Aufgabe':esc(p.name)}</strong><span>${hours(s.length)}</span><button id="close-panel" class="icon-button" aria-label="Toolkit schließen">${icon('close')}</button></div>${t?`<label class="full-field"><span class="field-label">Bezeichnung</span><input id="task-label" maxlength="60" value="${esc(t.label||task(t.type).name)}"></label>`:''}<form id="toolkit-form"><div class="form-row"><label><span class="field-label">Beginn</span><input id="tool-start" type="text" inputmode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="HH:MM" value="${fmtTime(s.start+(t?t.offset:0))}" required></label><label><span class="field-label">Ende</span><input id="tool-end" type="text" inputmode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="HH:MM" value="${fmtTime(s.start+(t?t.offset+t.duration:s.length))}" required></label></div><p id="tool-error" class="form-error"></p><div class="toolkit-actions"><button type="button" class="delete-button" id="delete-shift" aria-label="${t?'Aufgabe':'Schicht'} löschen">${icon('trash')}</button>${t?'':'<button type="button" id="tool-add" class="secondary-button">+ Aufgabe</button>'}<button class="primary-button">Übernehmen</button></div></form>`;
  $('#close-panel').onclick=closePanel;
  if(t?.type==='flex'){const field=$('#task-label').closest('label');field.insertAdjacentHTML('afterend',colorPicker(t));const choose=color=>{t.color=color;persist();renderTimeline();panel.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color.toLowerCase())));$('#task-color').value=color;};panel.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>choose(b.dataset.color));$('#task-color').oninput=e=>choose(e.target.value);}
  $('#task-label')?.addEventListener('change',e=>{t.label=e.target.value.trim()||task(t.type).name;persist();renderTimeline();});
  $('#tool-add')?.addEventListener('click',()=>addTask(s,'flex',0));
  $('#delete-shift').onclick=()=>{const before=structuredClone(data.shifts);if(t)removeTask(s,t);else data.shifts=data.shifts.filter(x=>x!==s);persist();closePanel();renderTimeline();toast(t?'Aufgabe gelöscht.':'Schicht gelöscht.',()=>{data.shifts=before;persist();refresh();});};
  $('#toolkit-form').onsubmit=e=>{e.preventDefault();const start=toHour($('#tool-start').value),end=toHour($('#tool-end').value);if(!Number.isFinite(start)||!Number.isFinite(end)||end-start<.25||start<8||end>DAY_END){$('#tool-error').textContent='Bitte eine Zeit zwischen 08:00 und 24:00 wählen.';return;}
    if(t){const offset=start-s.start;if(offset<0||end>s.start+s.length||s.segments.some(x=>x!==t&&offset<x.offset+x.duration&&end-s.start>x.offset)){$('#tool-error').textContent='Aufgaben müssen ohne Überlappung innerhalb der Schicht liegen.';return;}t.offset=offset;t.duration=end-start;}
    else {if(s.segments.some(x=>x.offset+x.duration>end-start)){$('#tool-error').textContent='Die Aufgaben passen nicht in diese Schicht. Bitte zuerst kürzen oder verschieben.';return;}s.start=start;s.length=end-start;}
    persist();closePanel();renderTimeline();
  };
  const r=anchor.getBoundingClientRect();panel.style.left=clamp(r.left,12,window.innerWidth-320)+'px';panel.style.top=Math.max(12,Math.min(r.bottom+12,window.innerHeight-panel.offsetHeight-12))+'px';
}
// Pointer capture keeps dragging stable at cell boundaries and on touch screens.
function startGesture(e){
  if(e.button!==0||copyPicked||e.target.closest('.shift-edit,.shift-copy,.task-copy')||e.target.classList.contains('task-track'))return;const el=e.currentTarget,s=getShift(el.dataset.shift),t=editing===s.id?s.segments.find(t=>t.id===e.target.closest('[data-task]')?.dataset.task):null,edge=e.target.closest('[data-edge]')?.dataset.edge;
  gesture={el,s,t,edge,x:e.clientX,y:e.clientY,grabY:(e.clientY-el.getBoundingClientRect().top)/zoom,positions:data.shifts.map(shift=>({id:shift.id,y:shift.y})),before:structuredClone(s),original:structuredClone(s),width:el.parentElement.getBoundingClientRect().width,moved:false,pointer:e.pointerId};el.setPointerCapture(e.pointerId);
}
document.addEventListener('pointermove',e=>{
  const g=gesture;if(!g)return;if(!g.moved&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<5)return;
  e.preventDefault();g.moved=true;g.el.classList.remove('edit-cue');$('#detail').hidden=true;document.body.classList.add('is-dragging');
  const delta=snap((e.clientX-g.x)/g.width*DAY_SPAN),s=g.s,b=g.before;
  if(g.t){const old=b.segments.find(t=>t.id===g.t.id);if(g.edge==='task-end'||g.edge==='task-start')resizeTask(s,g.t,b.segments,g.edge,delta);else {const r=g.el.querySelector('.task-track').getBoundingClientRect();g.outside=e.clientY<r.top-30||e.clientY>r.bottom+30||e.clientX<r.left-35||e.clientX>r.right+35;g.el.querySelector(`[data-task="${g.t.id}"]`).classList.toggle('removing',g.outside);if(!g.outside)moveTask(s,g.t,b.segments,clamp(old.offset+delta,0,s.length-old.duration));}}
  else if(g.edge==='start'){const first=b.segments.reduce((n,t)=>Math.min(n,t.offset+t.duration-.25),b.length-.25);const change=clamp(delta,8-b.start,Math.min(first,b.length-.25));s.start=b.start+change;s.length=b.length-change;s.segments.forEach((t,i)=>{const old=b.segments[i];t.offset=Math.max(0,old.offset-change);t.duration=old.duration-Math.max(0,change-old.offset);});}
  else if(g.edge==='end'){const min=b.segments.reduce((n,t)=>Math.max(n,t.offset+.25),.25);s.length=clamp(b.length+delta,min,DAY_END-b.start);s.segments.forEach((t,i)=>t.duration=Math.min(b.segments[i].duration,s.length-t.offset));}
  else {s.start=clamp(b.start+delta,8,DAY_END-b.length);const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('.day-cell');const p=data.people.find(p=>p.id===s.person);if(cell&&activeOn(p,cell.dataset.date)&&!data.shifts.some(x=>x!==s&&x.person===s.person&&x.date===cell.dataset.date)){const wanted=yAt(cell,e.clientY);s.date=cell.dataset.date;placeInDay(s,wanted);if(cell!==g.el.parentElement){cell.append(g.el);g.x=e.clientX;g.width=cell.getBoundingClientRect().width;b.start=s.start;}}}
  document.querySelectorAll('.shift').forEach(el=>{const other=getShift(el.dataset.shift);el.style.top=displayY(other)+'px';el.querySelector('.shift-time').textContent=shiftTime(other);const label=`${data.people.find(p=>p.id===other.person).name}, ${shiftTime(other)} netto`;el.title=label;el.setAttribute('aria-label',label);});g.el.style.setProperty('--start',(s.start-DAY_START)/DAY_SPAN);g.el.style.setProperty('--duration',s.length/DAY_SPAN);
  s.segments.forEach(t=>{const el=g.el.querySelector(`[data-task="${t.id}"]`);el.style.left=t.offset/s.length*100+'%';el.style.width=t.duration/s.length*100+'%';el.querySelectorAll('.task-time').forEach(time=>time.textContent=taskRange(s,t));el.title=(t.label||task(t.type).name)+' · '+taskRange(s,t);el.setAttribute('aria-label',(t.label||task(t.type).name)+', '+taskRange(s,t));});
  s.segments.forEach(t=>{const button=g.el.querySelector(`[data-copy-task="${t.id}"]`);if(button)button.style.left=`calc(${(t.offset+t.duration)/s.length*100}% - 27px)`;});
updateTaskLabels();
},{passive:false});
function endGesture(cancel=false){const g=gesture;if(!g)return;gesture=null;document.body.classList.remove('is-dragging');if(cancel){Object.assign(g.s,g.original);g.positions.forEach(position=>{const shift=getShift(position.id);if(shift)shift.y=position.y;});}if(g.moved){suppressClick=true;if(!cancel){if(g.t&&g.outside){const before=structuredClone(g.original);removeTask(g.s,g.t);toast('Aufgabe entfernt.',()=>{Object.assign(g.s,before);persist();renderTimeline();});}persist();}renderTimeline();setTimeout(()=>suppressClick=false,0);}}
document.addEventListener('pointerup',()=>endGesture());document.addEventListener('pointercancel',()=>endGesture(true));
function modalTop(title){return `<div class="modal-top"><h2>${title}</h2><button type="button" class="icon-button" id="modal-close" aria-label="Schließen">${icon('close')}</button></div>`;}
function openModal(html,onClose=()=>$('#modal').close()){closePanel();$('#modal').classList.remove('settings-dialog');$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();$('#modal-close').onclick=onClose;$('#modal').oncancel=event=>{event.preventDefault();onClose();};$('#modal').scrollTop=0;}
function settingsReturn(selector){const scrollTop=$('#modal').scrollTop,tab=settingsTab;return ()=>{openSettings(tab);$('#modal').scrollTop=scrollTop;$(selector)?.focus({preventScroll:true});};}
let settingsTab='general',updateState=null;
const settingsTabs=[['general','Allgemein','sliders'],['breaks','Pausenregelung','clock'],['people','Mitarbeitende','users'],['presets','Aufgabenvorlagen','tasks'],['updates','Updates','refresh']];
function openSettings(tab){
  if(settingsTabs.some(([id])=>id===tab))settingsTab=tab;
  const panel=(id,html)=>`<section class="settings-panel" role="tabpanel" id="settings-panel-${id}" aria-labelledby="settings-tab-${id}" tabindex="0" ${id===settingsTab?'':'hidden'}>${html}</section>`;
  openModal(`${modalTop('Einstellungen')}<div class="settings-layout"><nav class="settings-nav" role="tablist" aria-label="Einstellungsbereiche" aria-orientation="vertical">${settingsTabs.map(([id,label,ic])=>`<button type="button" role="tab" id="settings-tab-${id}" data-settings-tab="${id}" aria-controls="settings-panel-${id}" aria-selected="${id===settingsTab}" tabindex="${id===settingsTab?0:-1}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav><div class="settings-panels">${
    panel('general',`<h3 class="settings-panel-title">Allgemein</h3><label class="settings-row" for="theme"><span>Design</span><select id="theme"><option value="dark">Dunkel</option><option value="light">Hell</option><option value="catppuccin">Catppuccin Mocha</option></select></label><label class="settings-row" for="saturday"><span>Samstag anzeigen</span><input id="saturday" type="checkbox" ${data.settings.saturday?'checked':''}></label><label class="settings-row" for="sunday"><span>Sonntag anzeigen</span><input id="sunday" type="checkbox" ${data.settings.sunday?'checked':''}></label>`)}${
    panel('breaks','')}${
    panel('people',`<div class="settings-heading"><h3>Mitarbeitende</h3><button id="new-person" class="subtle-button">${icon('plus')} Hinzufügen</button></div><div class="people-settings">${data.people.map(person=>`<button class="person-setting" data-edit-person="${person.id}"><i style="background:${person.color}"></i><span><strong>${esc(person.name)}</strong><small>${person.from?parseDate(person.from).toLocaleDateString('de-DE'):'Ohne Eintrittsdatum'}${person.until?' – '+parseDate(person.until).toLocaleDateString('de-DE'):' · unbefristet'}</small></span><b class="person-weekly-hours">${hours(person.weeklyHours??weekHours(person))}<small>pro Woche</small></b>${icon('edit')}</button>`).join('')}</div><p class="modal-note">Ein- und Austrittsdatum steuern die Sichtbarkeit im Plan. Frühere Schichten bleiben erhalten.</p>`)}${
    panel('presets',`<div class="settings-heading"><h3>Aufgabenvorlagen</h3><button id="new-preset" class="subtle-button">${icon('plus')} Hinzufügen</button></div>${tasks.filter(t=>t.id!=='flex'&&!t.hidden).map(t=>`<button class="person-setting" data-preset="${t.id}"><i style="background:${t.color}"></i><span>${esc(t.name)}</span>${icon('edit')}</button>`).join('')}`)}${
    panel('updates',`<h3 class="settings-panel-title">Updates</h3><div id="update-panel"></div>`)}</div></div>`);
  $('#modal').classList.add('settings-dialog');
  const tabButtons=[...document.querySelectorAll('[data-settings-tab]')];
  const selectTab=(id,focus)=>{settingsTab=id;tabButtons.forEach(button=>{const active=button.dataset.settingsTab===id;button.setAttribute('aria-selected',active);button.tabIndex=active?0:-1;$('#settings-panel-'+button.dataset.settingsTab).hidden=!active;if(active&&focus)button.focus();});$('#modal').scrollTop=0;};
  tabButtons.forEach((button,index)=>{
    button.onclick=()=>selectTab(button.dataset.settingsTab);
    button.onkeydown=event=>{const step={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[event.key];const target=event.key==='Home'?0:event.key==='End'?tabButtons.length-1:step?(index+step+tabButtons.length)%tabButtons.length:null;if(target===null)return;event.preventDefault();selectTab(tabButtons[target].dataset.settingsTab,true);};
  });
  $('#settings-panel-breaks').insertAdjacentHTML('beforeend',`<form id="break-form"><h3 class="settings-panel-title">Pausenregelung</h3><p class="modal-note">Pro Person und Tag, aus der Summe der Schichtzeiten (Anwesenheit). Grenzen gelten inklusive; nur die höchste zutreffende Pausendauer wird abgezogen. Sollstunden und Tagesstunden sind Netto-Arbeitszeit. Bestehende Zeiten bleiben unverändert. Ohne Stufen erfolgt kein Abzug. Änderungen gelten erst nach dem Speichern.</p><div id="break-rules"></div><button type="button" id="add-break-rule" class="subtle-button">Stufe hinzufügen</button><button type="button" id="example-break-rules" class="subtle-button">Beispiel: 6 h / 30 min, 9 h / 45 min</button><p id="break-error" class="form-error" role="alert"></p><div class="form-actions"><button class="primary-button">Pausenregel speichern</button></div></form>`);
  const addBreakRow=(rule={after:6,minutes:30})=>{
    const row=document.createElement('div');row.className='form-row break-rule';
    row.innerHTML=`<label><span class="field-label">Ab Stunden Anwesenheit</span><input name="after" type="number" min="0.25" max="24" step="0.25" required value="${rule.after}"></label><label><span class="field-label">Pause in Minuten</span><input name="minutes" type="number" min="0" max="1440" step="1" required value="${rule.minutes}"></label><button type="button" class="subtle-button" aria-label="Pausenstufe entfernen">Entfernen</button>`;
    row.querySelector('button').onclick=()=>row.remove();$('#break-rules').append(row);
  };
  breakRules().forEach(addBreakRow);$('#add-break-rule').onclick=()=>addBreakRow();
  $('#example-break-rules').onclick=()=>{$('#break-rules').replaceChildren();[{after:6,minutes:30},{after:9,minutes:45}].forEach(addBreakRow);};
  $('#break-form').onsubmit=e=>{
    e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
    const rules=[...form.querySelectorAll('.break-rule')].map(row=>({after:Number(row.querySelector('[name=after]').value),minutes:Number(row.querySelector('[name=minutes]').value)})).sort((a,b)=>a.after-b.after);
    if(rules.some((rule,i)=>!Number.isFinite(rule.after)||!Number.isInteger(rule.minutes)||rule.after<.25||rule.after>24||rule.minutes<0||rule.minutes>=rule.after*60||(i>0&&(rule.after===rules[i-1].after||rule.minutes<rules[i-1].minutes)))){
      $('#break-error').textContent='Bitte eindeutige, aufsteigende Grenzen und nicht abnehmende Pausen eingeben. Die Pause muss kürzer als die jeweilige Grenze sein.';return;
    }
    data.settings.breakRules=rules;persist();refresh();$('#break-error').textContent='';toast('Pausenregel gespeichert. Ist-Stunden wurden neu berechnet.');
  };
  $('#theme').value=document.documentElement.dataset.theme;
  $('#settings-panel-general').insertAdjacentHTML('beforeend',`<fieldset class="background-options"><legend>Hintergrund</legend><p class="modal-note">Außerhalb des Canvas sichtbar, im Canvas weichgezeichnet und kontrastärmer. Druck und Bildexport bleiben ohne Hintergrundbild.</p><div class="background-grid">${[{id:'',name:'Kein Hintergrund'},...backgrounds].map(background=>`<label><input type="radio" name="background" value="${background.id}" ${background.id===(data.settings.background||'')?'checked':''}>${background.file?`<img src="assets/${background.file}" alt="" loading="lazy">`:'<span class="background-none" aria-hidden="true"></span>'}<span>${background.name}</span></label>`).join('')}</div></fieldset>`);
  document.querySelectorAll('[name=background]').forEach(input=>input.onchange=()=>{
    data.settings.background=input.value;applyBackground();persist();
  });
  $('#theme').onchange=e=>{data.settings.theme=e.target.value;applyTheme();persist();};
  ['saturday','sunday'].forEach(day=>$('#'+day).onchange=e=>{data.settings[day]=e.target.checked;data.settings.weekend=data.settings.saturday&&data.settings.sunday;if(focusDate&&!dates().some(date=>dateKey(date)===focusDate))focusDate=null;clearDrop();persist();refresh();});$('#new-person').onclick=()=>openPerson();document.querySelectorAll('[data-edit-person]').forEach(el=>el.onclick=()=>openPerson(data.people.find(p=>p.id===el.dataset.editPerson)));
  $('#new-preset').onclick=()=>openPreset();document.querySelectorAll('[data-preset]').forEach(el=>el.onclick=()=>openPreset(task(el.dataset.preset)));
  renderUpdatePanel();
}
function updatePanelMarkup(){
  if(!window.flowDesktop)return `<p class="modal-note">Updates können in der installierten Desktop-App direkt hier gesucht und installiert werden. Im Browser wird immer die geladene Version verwendet.</p>`;
  if(!updateState)return `<p class="modal-note">Update-Status wird geladen …</p>`;
  const s=updateState,version=`<div class="settings-row"><span>Installierte Version</span><strong class="update-version">${esc(s.version||'–')}</strong></div>`;
  if(!s.supported)return `${version}<p class="modal-note update-note">${esc(s.reason||'Updates sind nicht verfügbar.')}</p>`;
  const status={idle:'Noch nicht nach Updates gesucht.',checking:'Suche nach Updates …',current:'Flow! ist auf dem neuesten Stand.',available:`Version ${esc(s.latest)} ist verfügbar.`,downloading:`Update wird heruntergeladen … ${Number(s.percent)||0} %`,downloaded:`Version ${esc(s.latest)} ist bereit. Flow! startet zur Installation neu.`,error:'Update fehlgeschlagen.'}[s.status]||'';
  const busy=['checking','downloading'].includes(s.status);
  const action=s.status==='available'?`<button type="button" class="primary-button" id="update-download">${icon('download')} Herunterladen</button>`:s.status==='downloaded'?`<button type="button" class="primary-button" id="update-install">${icon('refresh')} Neu starten und installieren</button>`:`<button type="button" class="primary-button" id="update-check" ${busy?'disabled':''}>${icon('refresh')} Nach Updates suchen</button>`;
  return `${version}<div class="update-status" role="status" aria-live="polite"><p>${status}</p>${s.status==='downloading'?`<progress max="100" value="${Number(s.percent)||0}"></progress>`:''}${s.status==='error'&&s.error?`<p class="update-error">${esc(s.error)}</p>`:''}</div><div class="update-actions">${action}</div><p class="modal-note">Deine Planungsdaten bleiben bei Updates erhalten.</p>`;
}
function renderUpdatePanel(){
  const el=$('#update-panel');if(!el)return;
  const hadFocus=el.contains(document.activeElement);
  el.innerHTML=updatePanelMarkup();
  const run=(selector,action)=>{const button=el.querySelector(selector);if(!button)return;button.onclick=()=>{button.disabled=true;action().then(state=>{updateState={...updateState,...state};renderUpdatePanel();}).catch(error=>{updateState={...updateState,status:'error',error:error.message};renderUpdatePanel();});};};
  run('#update-check',()=>window.flowDesktop.checkForUpdates());
  run('#update-download',()=>window.flowDesktop.downloadUpdate());
  run('#update-install',()=>window.flowDesktop.installUpdate());
  if(hadFocus)el.querySelector('.update-actions button:not(:disabled)')?.focus();
}
function initUpdates(){
  const api=window.flowDesktop;if(!api)return;
  api.onUpdateStatus(state=>{const previous=updateState?.status;updateState={...updateState,...state};renderUpdatePanel();if(state.status==='available'&&previous!=='available'&&!$('#update-panel'))toast(`Flow! ${state.latest} ist verfügbar – Einstellungen › Updates`);});
  api.updateInfo().then(state=>{updateState={...state,...updateState};renderUpdatePanel();if(state.supported&&state.status==='idle')setTimeout(()=>api.checkForUpdates().catch(error=>console.error('Flow! Update-Prüfung fehlgeschlagen:',error)),4000);}).catch(error=>console.error('Flow! Update-Status nicht verfügbar:',error));
}
function openPreset(preset){
  const returnToSettings=settingsReturn(preset?`[data-preset="${preset.id}"]`:'#new-preset');
  openModal(`${modalTop(preset?'Aufgabenvorlage bearbeiten':'Aufgabenvorlage hinzufügen')}<form id="preset-form"><label class="full-field"><span class="field-label">Bezeichnung</span><input name="name" maxlength="40" required value="${esc(preset?.name||'')}"></label>${paletteField(preset?.color||freeColor(tasks.filter(t=>!t.hidden).map(t=>t.color)))}<div class="form-actions">${preset?`<button type="button" id="hide-preset" class="delete-button icon-button" title="Aufgabenvorlage entfernen" aria-label="Aufgabenvorlage entfernen">${icon('trash')}</button>`:''}<button type="button" id="back-presets" class="secondary-button">Zurück</button><button class="primary-button">Speichern</button></div></form>`,returnToSettings);
  wirePalette($('#preset-form'));$('#back-presets').onclick=returnToSettings;$('#hide-preset')?.addEventListener('click',()=>{preset.hidden=true;persist();renderLegend();returnToSettings();});
  $('#preset-form').onsubmit=event=>{event.preventDefault();const form=new FormData(event.target),name=String(form.get('name')).trim();if(!name)return;const value={name,short:name,color:form.get('color')};if(preset)Object.assign(preset,value);else tasks.push({id:uid(),...value});persist();renderLegend();renderTimeline();returnToSettings();};
}
function openPerson(person){
  const returnToSettings=settingsReturn(person?`[data-edit-person="${person.id}"]`:'#new-person'),schedule=person?.weekdayHours||[8,8,8,8,8,0,0];
  openModal(`${modalTop(person?'Mitarbeitende bearbeiten':'Mitarbeitende hinzufügen')}<form id="person-form"><label class="full-field"><span class="field-label">Name</span><input name="name" maxlength="24" value="${esc(person?.name||'')}" required></label>${paletteField(person?.color||freeColor(data.people.map(p=>p.color)))}<label class="full-field"><span class="field-label">Sollstunden pro Woche</span><input name="weeklyHours" type="number" min="0" max="112" step="0.25" value="${person?.weeklyHours??schedule.reduce((total,value)=>total+value,0)}" required></label><fieldset class="weekday-model"><legend>Stunden pro Wochentag</legend><div class="weekday-inputs">${weekdays.map((day,index)=>`<label><span>${day.slice(0,2)}</span><input name="weekday-${index}" aria-label="Stunden am ${day}" type="number" min="0" max="16" step="0.25" value="${schedule[index]}" required></label>`).join('')}</div><p><span>Verteilt</span><output id="schedule-total"></output></p></fieldset><div class="form-row"><label><span class="field-label">Eintritt (optional)</span><input name="from" type="date" value="${person?.from||''}"></label><label><span class="field-label">Letzter Tag (optional)</span><input name="until" type="date" value="${person?.until||''}"></label></div><p id="person-error" class="form-error"></p><div class="form-actions"><button type="button" class="secondary-button" id="back-settings">Zurück</button><button class="primary-button">Speichern</button></div></form>`,returnToSettings);
  const updateTotal=(sync=false)=>{const total=weekdays.reduce((sum,day,index)=>sum+Number($(`[name="weekday-${index}"]`).value),0);$('#schedule-total').textContent=hours(total);if(sync)$('[name="weeklyHours"]').value=total;};
  weekdays.forEach((day,index)=>$(`[name="weekday-${index}"]`).oninput=()=>updateTotal(true));updateTotal();wirePalette($('#person-form'));$('#back-settings').onclick=returnToSettings;
  $('#person-form').onsubmit=event=>{event.preventDefault();const form=new FormData(event.target),weekdayHours=weekdays.map((day,index)=>Number(form.get(`weekday-${index}`))),values={name:String(form.get('name')).trim(),hours:weekdayHours.find(value=>value>0)||8,weekdayHours,weeklyHours:Number(form.get('weeklyHours')),color:form.get('color'),from:form.get('from'),until:form.get('until')};if(!values.name||weekdayHours.some(value=>!Number.isFinite(value)||value<0||value>16||value*4%1!==0)||!Number.isFinite(values.weeklyHours)||values.weeklyHours<0||values.weeklyHours>112||(values.from&&values.until&&values.from>values.until)){$('#person-error').textContent='Bitte Name, Stunden und Zeitraum prüfen.';return;}if(person)Object.assign(person,values);else data.people.push({id:uid(),...values});persist();refresh();returnToSettings();};
}
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportCSV(){const rows=[['Name','Datum','Beginn','Ende','Aufgabe','Anwesenheit / Aufgabe (h)','Pausenanteil (h)','Ist netto (h)']];data.shifts.filter(s=>s.date>=dateKey(week)&&s.date<=dateKey(addDays(week,6))).forEach(s=>{const name=data.people.find(p=>p.id===s.person).name,work=shiftWork(s);rows.push([name,s.date,fmtTime(s.start),fmtTime(s.start+s.length),'Schicht',s.length,work.pause,work.net]);s.segments.toSorted((a,b)=>a.offset-b.offset).forEach(t=>rows.push([name,s.date,fmtTime(s.start+t.offset),fmtTime(s.start+t.offset+t.duration),t.label||task(t.type).name,t.duration,'','']));});download('\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/^[=+\-@]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n'),'text/csv;charset=utf-8',`Flow-${dateKey(week)}.csv`);}
function changeWeek(n){week=addDays(week,n);focusDate=null;picked=null;closePanel();refresh();}
let pickerMonth;
function closeMonthPicker(restoreFocus=false){
  $('#month-picker').hidden=true;$('#date-range').setAttribute('aria-expanded','false');
  if(restoreFocus)$('#date-range').focus();
}
function positionMonthPicker(){
  const picker=$('#month-picker');if(picker.hidden)return;
  const rect=$('#date-range').getBoundingClientRect(),width=picker.offsetWidth,height=picker.offsetHeight;
  picker.style.left=Math.max(8,Math.min(rect.left+rect.width/2-width/2,window.innerWidth-width-8))+'px';
  picker.style.top=Math.max(8,Math.min(rect.bottom+10,window.innerHeight-height-8))+'px';
}
function renderMonthPicker(focusDateKey){
  const picker=$('#month-picker'),first=new Date(pickerMonth.getFullYear(),pickerMonth.getMonth(),1,12),start=monday(first);
  const scheduled=new Set(data.shifts.map(s=>s.date)),months=new Set(data.shifts.map(s=>s.date.slice(0,7)));
  const monthLabel=first.toLocaleDateString('de-DE',{month:'long',year:'numeric'}),hasShifts=months.has(dateKey(first).slice(0,7));
  picker.innerHTML=`<div class="month-picker-heading"><button type="button" class="icon-button" data-month-step="-1" aria-label="Vorheriger Monat">${icon('chevron-left')}</button><strong aria-live="polite">${monthLabel}${hasShifts?'<i class="calendar-dot" aria-label="Schichten in diesem Monat"></i>':''}</strong><button type="button" class="icon-button" data-month-step="1" aria-label="Nächster Monat">${icon('chevron-right')}</button></div><div class="month-picker-weekdays" aria-hidden="true">${weekdays.map(day=>`<span>${day.slice(0,2)}</span>`).join('')}</div><div class="month-picker-days">${Array.from({length:42},(_,i)=>{
    const d=addDays(start,i),key=dateKey(d),scheduledDay=scheduled.has(key),inWeek=key>=dateKey(week)&&key<=dateKey(addDays(week,6)),today=key===todayKey();
    return `<button type="button" data-calendar-date="${key}" class="${d.getMonth()!==first.getMonth()?'outside-month ':''}${inWeek?'selected-week ':''}${today?'calendar-today':''}" aria-label="${d.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}${scheduledDay?', Schichten vorhanden':''}${inWeek?', angezeigte Woche':''}" ${today?'aria-current="date"':''}><span>${d.getDate()}</span>${scheduledDay?'<i class="calendar-dot" aria-hidden="true"></i>':''}</button>`;
  }).join('')}</div><p class="month-picker-note"><i class="calendar-dot" aria-hidden="true"></i> Schichten vorhanden · Tag öffnet die Woche</p>`;
  picker.querySelectorAll('[data-month-step]').forEach(button=>button.onclick=()=>{
    const step=Number(button.dataset.monthStep);
    pickerMonth=new Date(first.getFullYear(),first.getMonth()+step,1,12);renderMonthPicker();
    picker.querySelector(`[data-month-step="${step}"]`).focus();
  });
  picker.querySelectorAll('[data-calendar-date]').forEach(button=>{
    button.onclick=()=>{week=monday(parseDate(button.dataset.calendarDate));changeWeek(0);closeMonthPicker(true);};
    button.onkeydown=e=>{
      const date=parseDate(button.dataset.calendarDate),day=(date.getDay()+6)%7;
      const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-day,End:6-day}[e.key];
      if(delta===undefined)return;e.preventDefault();
      const next=addDays(date,delta),key=dateKey(next);
      if(next.getMonth()!==first.getMonth()||next.getFullYear()!==first.getFullYear()){
        pickerMonth=new Date(next.getFullYear(),next.getMonth(),1,12);renderMonthPicker(key);
      }else picker.querySelector(`[data-calendar-date="${key}"]`)?.focus();
    };
  });
  if(focusDateKey)picker.querySelector(`[data-calendar-date="${focusDateKey}"]`)?.focus();
  positionMonthPicker();
}
$('#date-range').onclick=()=>{
  if(!$('#month-picker').hidden){closeMonthPicker();return;}
  closeMenu();closePanel();closeWeekInfo();
  pickerMonth=new Date(week.getFullYear(),week.getMonth(),1,12);
  $('#month-picker').hidden=false;$('#date-range').setAttribute('aria-expanded','true');
  renderMonthPicker(dateKey(week));
};
$('#month-picker').onclick=e=>e.stopPropagation();
document.addEventListener('click',e=>{if(!e.target.closest('#month-picker,#date-range'))closeMonthPicker();});
document.addEventListener('focusin',e=>{if(!e.target.closest('#month-picker,#date-range'))closeMonthPicker();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#month-picker').hidden){e.preventDefault();e.stopImmediatePropagation();closeMonthPicker(true);}},true);
window.addEventListener('resize',positionMonthPicker);
function closeMenu(){$('#menu').hidden=true;$('#more').setAttribute('aria-expanded','false');}
$('#prev').onclick=()=>changeWeek(-7);$('#next').onclick=()=>changeWeek(7);$('#today').onclick=()=>{week=monday(parseDate(todayKey()));changeWeek(0);};
$('#settings-button').onclick=()=>openSettings();
$('#week-number').onclick=copyWeek;
// A week drop targets the entire canvas; intercept before day/shift handlers.
const weekCopySurface=$('#grid-scroll');
for(const type of ['dragenter','dragover'])weekCopySurface.addEventListener(type,e=>{if(drag?.kind==='week-copy')previewWeekCopy(e);},true);
weekCopySurface.addEventListener('dragleave',e=>{if(!weekCopySurface.contains(e.relatedTarget))clearWeekCopyPreview();});
weekCopySurface.addEventListener('drop',e=>{if(drag?.kind!=='week-copy')return;e.preventDefault();e.stopPropagation();clearDrop();placeWeekCopy();},true);
function pastePickedWeek(e){
  if(!copyPicked||!copiedWeek||suppressClick||e.target.closest('.day-copy,.shift-edit,.shift-copy,.task-copy'))return;
  if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;
  e.preventDefault();e.stopPropagation();placeWeekCopy();
}
weekCopySurface.addEventListener('click',pastePickedWeek,true);
weekCopySurface.addEventListener('keydown',pastePickedWeek,true);
$('.footer-label').textContent='AUFGABEN';
$('#detail').setAttribute('aria-label','Schicht-Toolkit');
function renderLegend(){$('#legend').innerHTML=tasks.filter(t=>!t.hidden).map(t=>`<button draggable="true" class="legend-item" data-type="${t.id}"><i class="legend-dot" style="--segment:${t.color}"></i>${esc(t.name)}</button>`).join('');document.querySelectorAll('[data-type]').forEach(el=>{el.ondragstart=e=>{drag={kind:'task',id:el.dataset.type};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='copy';};el.ondragend=clearDrop;el.onclick=()=>{const s=getShift(selected||editing);if(s)addTask(s,el.dataset.type,0);else toast('Aufgabe in eine Schicht ziehen oder zuerst eine Schicht auswählen.');};});}
$('#more').onclick=()=>{const hidden=!$('#menu').hidden;$('#menu').hidden=hidden;$('#more').setAttribute('aria-expanded',String(!hidden));};
$('#menu').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{closeMenu();({excel:()=>openExport('excel'),image:()=>openExport('image'),export:exportCSV,backup:()=>exportPlan(),import:()=>openPlanImport(),print:()=>window.print(),settings:()=>openSettings()})[b.dataset.action]();});
document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap'))closeMenu();if(!e.target.closest('#week-info,#week-info-toggle'))closeWeekInfo();if(!e.target.closest('#detail,.shift,.legend-item'))closePanel();});
document.addEventListener('keydown',event=>{if($('#modal').open){if(event.key==='Escape'){event.preventDefault();$('#modal-close').click();}return;}if(event.key==='Escape'){endGesture(true);editing=null;copyPicked=false;closeWeekInfo();picked=null;clearDrop();closePanel();closeMenu();refresh();}});
const surface=document.createElement('div');surface.className='canvas-surface';$('#grid-scroll').append(surface);surface.append($('#timeline'));
$('.board').insertAdjacentHTML('beforeend',`<div class="canvas-zoom" role="group" aria-label="Canvas-Zoom"><button id="zoom-out" aria-label="Herauszoomen">${icon('minus')}</button><button id="zoom-value" aria-label="Zoom auf 100 Prozent zurücksetzen">100%</button><button id="zoom-in" aria-label="Hineinzoomen">${icon('plus')}</button></div>`);
$('#zoom-out').onclick=()=>setZoom(zoom-.25);$('#zoom-in').onclick=()=>setZoom(zoom+.25);$('#zoom-value').onclick=()=>setZoom(1);
$('#grid-scroll').addEventListener('scroll',closePanel);window.addEventListener('resize',()=>{closePanel();applyZoom();});
if(window.ResizeObserver)new ResizeObserver(applyZoom).observe($('#grid-scroll'));
if(window.ResizeObserver){const trayObserver=new ResizeObserver(()=>positionCopyTray());trayObserver.observe($('.dock'));trayObserver.observe($('#tokens'));}
$('.dock').insertAdjacentHTML('beforeend','<div id="copy-tray" class="copy-tray" hidden></div>');
$('.board').insertAdjacentHTML('beforeend',`<button id="week-info-toggle" class="week-info-toggle" aria-label="Wochenübersicht" aria-expanded="false" aria-controls="week-info">${icon('info')}</button><section id="week-info" class="week-info" role="region" aria-label="Wochenstunden und Aufgabenverteilung" hidden></section>`);
$('#week-info-toggle').onclick=()=>{const panel=$('#week-info');panel.hidden=!panel.hidden;$('#week-info-toggle').setAttribute('aria-expanded',String(!panel.hidden));renderWeekInfo();};
hydrate();renderLegend();refresh();persist();initUpdates();
