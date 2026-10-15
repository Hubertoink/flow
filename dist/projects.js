// Long-term responsibility stays separate from scheduled working hours.
let projectOffset=0;
const projectDay=date=>Math.round(Date.UTC(...date.split('-').map((n,i)=>Number(n)-(i===1?1:0)))/86400000);
const projectDate=day=>new Date(day*86400000).toISOString().slice(0,10);
const projectEnabled=()=>data.settings.projectsEnabled!==false;
const getProject=id=>(data.projects||[]).find(p=>p.id===id);
function projectPhaseDates(project,phase,end){
  const index=project.phases.indexOf(phase),next=project.phases[index+1];
  if(end<phase.start||(next&&end>=next.end))return false;
  phase.end=end;if(next)next.start=projectDate(projectDay(end)+1);else project.end=end;
  return true;
}
function addProjectPerson(project,phase,personId){
  const person=data.people.find(p=>p.id===personId);
  if(!person||person.from&&person.from>phase.end||person.until&&person.until<phase.start){toast('Diese Person ist während der Phase nicht im Team.');return false;}
  if(!phase.people.includes(personId))phase.people.push(personId);
  persist();renderProjects();return true;
}
function projectWindow(){
  const weeks=data.settings.projectWeeks===12?12:6;
  const first=projectDay(weeks===12?dateKey(monday(parseDate(todayKey()))):dateKey(week))+(projectOffset-(weeks===12?6:1))*7;
  return {weeks,first,last:first+weeks*7};
}
function renderProjects(){
  data.projects ||= [];
  const section=document.querySelector('#projects');if(!section)return;
  section.hidden=!projectEnabled();if(section.hidden)return;
  const collapsed=data.settings.projectsCollapsed===true,{weeks,first,last}=projectWindow(),today=projectDay(todayKey());
  const range=`${parseDate(projectDate(first)).toLocaleDateString('de-DE',{day:'numeric',month:'short'})} – ${parseDate(projectDate(last-1)).toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'})}`;
  section.classList.toggle('collapsed',collapsed);section.style.height=(collapsed?38:clamp(data.settings.projectHeight||210,140,480))+'px';
  section.innerHTML=`<div id="project-resize" role="separator" tabindex="0" aria-label="Höhe der Projektübersicht" aria-orientation="horizontal" aria-valuemin="140" aria-valuemax="480" aria-valuenow="${clamp(data.settings.projectHeight||210,140,480)}"></div><header class="project-header"><button id="project-toggle" aria-expanded="${!collapsed}" aria-controls="project-content">${icon(collapsed?'chevron-right':'chevron-down')}<strong>PROJEKTE</strong><span>${data.projects.length}</span></button><div class="project-controls"><button id="project-prev" class="icon-button" aria-label="Frühere Projektwochen">${icon('chevron-left')}</button><button id="project-current" data-tooltip="${weeks===12?'Um heute zentrieren':'Zur ausgewählten Planungswoche'}">${range}</button><button id="project-next" class="icon-button" aria-label="Spätere Projektwochen">${icon('chevron-right')}</button><select id="project-scale" aria-label="Projektzeitraum"><option value="6">6 Wochen</option><option value="12">3 Monate</option></select><button id="project-new" class="subtle-button">${icon('plus')} Projekt</button></div></header><div id="project-content" ${collapsed?'hidden':''}><div class="project-axis"><span></span><div>${Array.from({length:weeks},(_,i)=>`<span>KW ${isoWeek(parseDate(projectDate(first+i*7)))}<small>${parseDate(projectDate(first+i*7)).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</small></span>`).join('')}</div></div><div class="project-rows">${data.projects.length?data.projects.map(project=>{
    const start=Math.max(first,projectDay(project.start)),end=Math.min(last,projectDay(project.end)+1),visible=end>start;
    return `<div class="project-row"><button class="project-name" data-edit-project="${project.id}" data-tooltip="${esc(project.name)} · ${project.start} – ${project.end}">${esc(project.name)}</button><div class="project-track" style="--project-weeks:${weeks};--selected-week:${(projectDay(dateKey(week))-first)/(last-first)*100}%;--week-width:${100/weeks}%">${today>=first&&today<last?`<span class="project-today" style="left:${(today-first+.5)/(last-first)*100}%" data-tooltip="Heute · ${todayKey()}"></span>`:''}${visible?`<div class="project-bar" style="left:${(start-first)/(last-first)*100}%;width:${(end-start)/(last-first)*100}%;--project-color:${project.color}">${project.phases.map((phase,i)=>{
      const a=Math.max(start,projectDay(phase.start)),b=Math.min(end,projectDay(phase.end)+1);if(b<=a)return '';
      const people=phase.people.map(id=>data.people.find(p=>p.id===id)?.name).filter(Boolean).join(' · ');
      return `<button class="project-phase" draggable="true" data-project="${project.id}" data-phase="${phase.id}" style="left:${(a-start)/(end-start)*100}%;width:${(b-a)/(end-start)*100}%;--phase-shade:${i%2?26:12}%" data-tooltip="${esc(project.name+' · '+phase.name+' · '+phase.start+' – '+phase.end+' · '+(people||'Noch nicht zugeordnet'))}"><b>${esc(phase.name)}</b><small>${esc(people||'Person hierher ziehen')}</small>${projectDay(phase.end)<last?'<i class="project-phase-edge" aria-hidden="true"></i>':''}</button>`;
    }).join('')}</div>`:`<button class="project-outside" data-jump-project="${project.id}">Zeitraum anzeigen ${icon('chevron-right')}</button>`}</div></div>`;
  }).join(''):'<div class="project-empty"><span>Längerfristige Vorhaben, Phasen und Verantwortliche – unter deiner Wochenplanung.</span><button id="project-empty-add" class="subtle-button">+ Erstes Projekt anlegen</button></div>'}</div></div>`;
  $('#project-toggle').onclick=()=>{data.settings.projectsCollapsed=!collapsed;persist();renderProjects();};
  $('#project-scale').value=String(weeks);$('#project-scale').onchange=e=>{data.settings.projectWeeks=Number(e.target.value);persist();renderProjects();};
  $('#project-prev').onclick=()=>{projectOffset-=weeks;renderProjects();};$('#project-next').onclick=()=>{projectOffset+=weeks;renderProjects();};$('#project-current').onclick=()=>{projectOffset=0;renderProjects();};
  $('#project-new').onclick=e=>editProject(null,e.currentTarget);$('#project-empty-add')?.addEventListener('click',e=>editProject(null,e.currentTarget));
  section.querySelectorAll('[data-edit-project]').forEach(b=>b.onclick=()=>editProject(b.dataset.editProject,b));
  section.querySelectorAll('[data-jump-project]').forEach(b=>b.onclick=()=>{projectOffset+=Math.floor((projectDay(getProject(b.dataset.jumpProject).start)-first)/7);renderProjects();});
  section.querySelectorAll('.project-phase').forEach(b=>{
    const project=getProject(b.dataset.project),phase=project.phases.find(p=>p.id===b.dataset.phase);
    b.ondragstart=e=>{if(e.target.closest('.project-phase-edge')){e.preventDefault();return;}closePanel();copyPicked=false;picked=null;drag={kind:'project-phase',projectId:project.id,phaseId:phase.id};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='copy';document.body.classList.add('planning-project-phase');};b.ondragend=clearDrop;
    b.onclick=e=>{if(!suppressClick&&!e.target.closest('.project-phase-edge'))editProjectPhase(project.id,phase.id,b);};
    b.ondragover=e=>{if(drag?.kind!=='person')return;e.preventDefault();e.dataTransfer.dropEffect='copy';b.classList.add('project-drop');};
    b.ondragleave=()=>b.classList.remove('project-drop');b.ondrop=e=>{e.preventDefault();const payload=drag;clearDrop();if(payload?.kind==='person')addProjectPerson(project,phase,payload.id);};
    const handle=b.querySelector('.project-phase-edge');if(handle)handle.onpointerdown=e=>{
      if(e.button!==0)return;e.preventDefault();e.stopPropagation();closePanel();
      const original=structuredClone(project),x=e.clientX,width=b.closest('.project-track').getBoundingClientRect().width,initial=projectDay(phase.end);let wanted=initial;
      handle.setPointerCapture(e.pointerId);
      handle.onpointermove=event=>{
        const next=project.phases[project.phases.indexOf(phase)+1];wanted=clamp(initial+Math.round((event.clientX-x)/width*weeks*7),projectDay(phase.start),next?projectDay(next.end)-1:projectDay(project.start)+3649);
        const shown=projectDate(wanted);b.dataset.tooltip=phase.name+' · '+phase.start+' – '+shown;
        const bar=b.parentElement,barStart=Math.max(first,projectDay(project.start)),barEnd=Math.min(last,next?projectDay(project.end)+1:wanted+1);
        bar.style.width=(barEnd-barStart)/(last-first)*100+'%';
        project.phases.forEach((p,index)=>{const el=bar.querySelector(`[data-phase="${p.id}"]`);if(!el)return;const a=Math.max(barStart,p===next?wanted+1:projectDay(p.start)),z=Math.min(barEnd,p===phase?wanted+1:projectDay(p.end)+1);el.style.left=(a-barStart)/(barEnd-barStart)*100+'%';el.style.width=Math.max(0,z-a)/(barEnd-barStart)*100+'%';});
      };
      const finish=event=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;suppressClick=true;if(event.type==='pointerup'){projectPhaseDates(project,phase,projectDate(wanted));persist();}else Object.assign(project,original);renderProjects();setTimeout(()=>suppressClick=false,0);};handle.onpointerup=finish;handle.onpointercancel=finish;
    };
  });
  const resize=$('#project-resize');
  resize.onkeydown=e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();data.settings.projectHeight=e.key==='Home'?140:e.key==='End'?480:clamp((data.settings.projectHeight||210)+(e.key==='ArrowUp'?20:-20),140,480);persist();renderProjects();$('#project-resize').focus();};
  resize.onpointerdown=e=>{if(e.button!==0||collapsed)return;e.preventDefault();closePanel();const y=e.clientY,old=section.offsetHeight;resize.setPointerCapture(e.pointerId);resize.onpointermove=event=>{section.style.height=clamp(old+y-event.clientY,140,Math.min(480,innerHeight*.45))+'px';};const finish=event=>{resize.onpointermove=null;resize.onpointerup=null;resize.onpointercancel=null;if(event.type==='pointerup'){data.settings.projectHeight=parseFloat(section.style.height);persist();}renderProjects();};resize.onpointerup=finish;resize.onpointercancel=finish;};
}
function projectPanel(title,html,anchor){
  closePanel();const panel=$('#detail');panel.hidden=false;
  panel.scrollTop=0;
  panel.innerHTML=`<div class="toolkit-top"><strong>${esc(title)}</strong><button id="project-close" class="icon-button" aria-label="Schließen">${icon('close')}</button></div>${html}`;
  $('#project-close').onclick=closePanel;positionFloatingPanel(panel,anchor||$('#projects'),true);
}
function editProject(id,anchor){
  const project=getProject(id),start=project?.start||dateKey(week),end=project?.end||dateKey(addDays(week,41));
  projectPanel(project?'Projekt':'Neues Projekt',`<form id="project-form"><label class="full-field"><span class="field-label">Name</span><input id="project-name" maxlength="80" required value="${esc(project?.name||'')}"></label><div class="form-row"><label><span class="field-label">Beginn</span><input type="date" id="project-start" required value="${start}"></label><label><span class="field-label">Ende</span><input type="date" id="project-end" required value="${end}"></label></div>${paletteField(project?.color||'#85b9e2')}<label class="full-field"><span class="field-label">Notiz</span><textarea id="project-note" maxlength="2000">${esc(project?.notes||'')}</textarea></label><p id="project-error" class="form-error"></p>${project?'<button type="button" id="project-phases" class="secondary-button project-focus-button">Projektphasen festlegen</button>':''}<div class="toolkit-actions">${project?`<button type="button" id="project-delete" class="delete-button" aria-label="Projekt löschen">${icon('trash')}</button>`:''}<button class="primary-button">${project?'Übernehmen':'Anlegen'}</button></div></form>`,anchor);
  wirePalette($('#project-form'));$('#project-form [name=color]').id='project-color';
  $('#project-phases')?.addEventListener('click',()=>openProjectFocus(id));
  $('#project-form').onsubmit=e=>{
    e.preventDefault();const name=$('#project-name').value.trim(),start=$('#project-start').value,end=$('#project-end').value,days=projectDay(end)-projectDay(start)+1;
    if(!name||!Number.isFinite(days)||days<1||days>3650){$('#project-error').textContent='Bitte einen Namen und einen Zeitraum bis maximal zehn Jahre wählen.';return;}
    if(project&&days<project.phases.length){$('#project-error').textContent='Jede Phase benötigt mindestens einen Tag.';return;}
    const item=project||{id:uid(),phases:[]};
    if(project){const delta=projectDay(start)-projectDay(project.start);const last=project.phases.at(-1);if(project.phases.length>1&&projectDay(end)<projectDay(last.start)+delta){$('#project-error').textContent='Das Ende liegt vor der letzten Phase. Bitte zuerst die Phasengrenzen anpassen.';return;}project.phases.forEach(p=>{p.start=projectDate(projectDay(p.start)+delta);p.end=projectDate(projectDay(p.end)+delta);});last.end=end;}
    else {const count=Math.min(3,days);item.phases=Array.from({length:count},(_,i)=>({id:uid(),name:['Vorbereitung','Durchführung','Abschluss'][i],start:projectDate(projectDay(start)+Math.floor(i*days/count)),end:projectDate(projectDay(start)+Math.floor((i+1)*days/count)-1),people:[],notes:''}));data.projects.push(item);}
    Object.assign(item,{name,start,end,color:$('#project-color').value,notes:$('#project-note').value.trim()});persist();renderProjects();closePanel();
  };
  $('#project-delete')?.addEventListener('click',()=>{const before=structuredClone(data.projects);data.projects=data.projects.filter(p=>p.id!==id);persist();renderProjects();closePanel();toast('Projekt gelöscht. Bereits eingeplante Tagesaufgaben bleiben erhalten.',()=>{data.projects=before;persist();renderProjects();});});
}
function editProjectPhase(projectId,phaseId,anchor){
  const project=getProject(projectId),phase=project?.phases.find(p=>p.id===phaseId);if(!phase)return;
  projectPanel('Projektphase',`<form id="phase-form"><p class="modal-note">${esc(project.name)}</p><label class="full-field"><span class="field-label">Phase</span><input id="phase-name" maxlength="80" required value="${esc(phase.name)}"></label><div class="form-row"><label><span class="field-label">Beginn</span><input type="date" id="phase-start" value="${phase.start}" required></label><label><span class="field-label">Ende</span><input type="date" id="phase-end" value="${phase.end}" required></label></div><label class="full-field"><span class="field-label">Notiz</span><textarea id="phase-note" maxlength="2000">${esc(phase.notes)}</textarea></label><div class="assignment-list">${phase.people.map(id=>`<button type="button" class="activity-assignment" data-phase-person="${id}"><span>${esc(data.people.find(p=>p.id===id)?.name||'Unbekannt')}</span>${icon('close')}</button>`).join('')}</div><label class="full-field"><span class="field-label">Verantwortliche hinzufügen</span><select id="phase-person"><option value="">Person wählen …</option>${data.people.filter(p=>!phase.people.includes(p.id)).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><p id="phase-error" class="form-error"></p><div class="project-phase-actions"><button type="button" class="secondary-button" id="phase-plan">Als Tagesaufgabe planen</button><button type="button" class="secondary-button" id="phase-split">Phase teilen</button></div><div class="toolkit-actions"><button type="button" class="delete-button" id="phase-delete" aria-label="Phase entfernen" ${project.phases.length===1?'disabled':''}>${icon('trash')}</button><button class="primary-button">Übernehmen</button></div></form>`,anchor);
  $('#phase-form').onsubmit=e=>{
    e.preventDefault();const start=$('#phase-start').value,end=$('#phase-end').value,name=$('#phase-name').value.trim(),i=project.phases.indexOf(phase),prev=project.phases[i-1],next=project.phases[i+1];
    if(!name||!start||!end||start>end||prev&&start<=prev.start||next&&end>=next.end||projectDay(next?project.end:end)-projectDay(prev?project.start:start)>=3650){$('#phase-error').textContent='Die Phase darf benachbarte Phasen nicht verdrängen.';return;}
    if(prev)prev.end=projectDate(projectDay(start)-1);else project.start=start;
    if(next)next.start=projectDate(projectDay(end)+1);else project.end=end;
    Object.assign(phase,{name,start,end,notes:$('#phase-note').value.trim()});persist();renderProjects();closePanel();
  };
  $('#phase-person').onchange=e=>{if(e.target.value&&addProjectPerson(project,phase,e.target.value))editProjectPhase(projectId,phaseId);};
  document.querySelectorAll('[data-phase-person]').forEach(b=>b.onclick=()=>{phase.people=phase.people.filter(id=>id!==b.dataset.phasePerson);persist();renderProjects();editProjectPhase(projectId,phaseId);});
  $('#phase-split').onclick=()=>{const days=projectDay(phase.end)-projectDay(phase.start)+1;if(days<2){$('#phase-error').textContent='Zum Teilen benötigt die Phase mindestens zwei Tage.';return;}const start=projectDate(projectDay(phase.start)+Math.floor(days/2)),part={...structuredClone(phase),id:uid(),name:'Neue Phase',start};phase.end=projectDate(projectDay(start)-1);project.phases.splice(project.phases.indexOf(phase)+1,0,part);persist();renderProjects();editProjectPhase(projectId,part.id);};
  $('#phase-delete').onclick=()=>{if(project.phases.length<2)return;const i=project.phases.indexOf(phase),next=project.phases[i+1],prev=project.phases[i-1];if(next)next.start=phase.start;else prev.end=phase.end;project.phases.splice(i,1);persist();renderProjects();closePanel();};
  $('#phase-plan').onclick=()=>planProjectPhase(projectId,phaseId,anchor);
}
function createProjectDayTask(project,phase,date,start,end){
  if(date<phase.start||date>phase.end)return {error:'Dieser Tag liegt außerhalb der Projektphase.'};
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<8||end>24||end-start<.25)return {error:'Bitte eine Zeit zwischen 08:00 und 24:00 wählen.'};
  const label=project.name+' · '+phase.name;
  if(data.activities.some(a=>activityKey(a.date,a)===activityKey(date,{type:'flex',label})))return {error:'Diese Projektphase ist an diesem Tag bereits eingeplant.'};
  const activity={id:uid(),date,type:'flex',label,color:project.color,start,end,explicit:true};data.activities.push(activity);return {activity};
}
function clearProjectPlanPreview(){
  document.body.classList.remove('planning-project-phase');
  document.querySelectorAll('.project-plan-target,.project-plan-blocked').forEach(el=>el.classList.remove('project-plan-target','project-plan-blocked'));
  document.querySelectorAll('.project-plan-preview').forEach(el=>el.remove());
}
function projectPlanDropInfo(event){
  const project=getProject(drag?.projectId),phase=project?.phases.find(p=>p.id===drag.phaseId);if(!phase)return null;
  const column=event.target.closest('.day-column'),date=column?.dataset.date;
  const anchor=column||event.target.closest('.date-wrap')||$('#grid-scroll');
  let start=10;
  if(column&&!column.classList.contains('folded')&&event.target.closest('.day-cell,.day-agenda'))start=clamp(hourAt(column,event.clientX),8,22);
  const error=date?(date<phase.start||date>phase.end?'Außerhalb der Projektphase':data.activities.some(a=>activityKey(a.date,a)===activityKey(date,{type:'flex',label:project.name+' · '+phase.name}))?'An diesem Tag bereits eingeplant':''):'';
  return {project,phase,column,date,anchor,start,end:start+2,error};
}
function showProjectWeekPlan(projectId,phaseId,anchor){
  const project=getProject(projectId),phase=project?.phases.find(p=>p.id===phaseId);if(!phase)return;
  const label=project.name+' · '+phase.name,days=dates().map(dateKey).filter(date=>date>=phase.start&&date<=phase.end);
  const available=days.filter(date=>!data.activities.some(a=>activityKey(a.date,a)===activityKey(date,{type:'flex',label})));
  projectPanel('Projektphase in dieser Woche',`<form id="project-week-plan"><p class="modal-note">${esc(label)}</p>${available.length?`<fieldset class="project-plan-days"><legend>Tagesaufgaben anlegen für</legend>${days.map(date=>`<label><input type="checkbox" name="project-plan-date" value="${date}" ${available.includes(date)?'checked':'disabled'}><span>${dayLabel(date)} · ${parseDate(date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}${available.includes(date)?'':' · eingeplant'}</span></label>`).join('')}</fieldset><div class="form-row"><label><span class="field-label">Beginn</span><input id="project-week-start" value="10:00" required></label><label><span class="field-label">Ende</span><input id="project-week-end" value="12:00" required></label></div><p class="modal-note">Gleiche Uhrzeit für die gewählten Tage. Schichten anschließend zuordnen.</p><p id="project-week-error" class="form-error"></p><div class="toolkit-actions"><button class="primary-button">Tagesaufgaben anlegen</button></div>`:`<p class="modal-note">${days.length?'Die Phase ist an allen passenden Tagen bereits eingeplant.':'Diese Phase liegt außerhalb der angezeigten Tage. Wähle oben eine passende Woche oder blende das Wochenende ein.'}</p>`}</form>`,anchor);
  $('#project-week-plan').onsubmit=e=>{
    e.preventDefault();if(!available.length)return;
    const chosen=[...document.querySelectorAll('[name=project-plan-date]:checked')].map(el=>el.value),start=toHour($('#project-week-start').value),end=toHour($('#project-week-end').value);
    if(!chosen.length||chosen.some(date=>!available.includes(date))||!Number.isFinite(start)||!Number.isFinite(end)||start<8||end>24||end-start<.25){$('#project-week-error').textContent='Bitte Tage und eine Zeit zwischen 08:00 und 24:00 wählen.';return;}
    const created=chosen.map(date=>createProjectDayTask(project,phase,date,start,end)).filter(result=>result.activity).map(result=>result.activity);
    persist();refresh();closePanel();toast(`${created.length} Tagesaufgaben aus der Projektphase angelegt.`,()=>{const ids=new Set(created.map(a=>a.id));data.activities=data.activities.filter(a=>!ids.has(a.id));data.shifts.forEach(s=>s.segments=s.segments.filter(t=>!ids.has(t.activityId)));persist();refresh();});
  };
}
function handleProjectPhaseDrag(event){
  if(drag?.kind!=='project-phase'||!event.target.closest('#grid-scroll,.date-wrap'))return;
  event.preventDefault();event.stopPropagation();
  const info=projectPlanDropInfo(event);if(!info)return;
  const {project,phase,column,date,anchor,start,end,error}=info;
  clearProjectPlanPreview();
  if(event.type==='drop'){
    clearDrop();if(error){toast(error+'.');return;}
    if(!date){showProjectWeekPlan(project.id,phase.id,anchor);return;}
    const result=createProjectDayTask(project,phase,date,start,end);if(result.error){toast(result.error);return;}
    persist();refresh();expandDay(date);toast(`${phase.name} · ${dayLabel(date)} · ${fmtTime(start)}–${fmtTime(end)} als Tagesaufgabe angelegt.`,()=>{data.activities=data.activities.filter(a=>a.id!==result.activity.id);data.shifts.forEach(s=>s.segments=s.segments.filter(t=>t.activityId!==result.activity.id));persist();refresh();});return;
  }
  document.body.classList.add('planning-project-phase');event.dataTransfer.dropEffect=error?'none':'copy';anchor.classList.add(error?'project-plan-blocked':'project-plan-target');
  const text=error||`${phase.name} · ${date?fmtTime(start)+'–'+fmtTime(end):'Tage und Uhrzeit auswählen'}`;
  const host=column?.querySelector('.day-agenda')||anchor;
  const preview=document.createElement('span');preview.className='project-plan-preview';preview.textContent=text;host.append(preview);
}
for(const type of ['dragenter','dragover','drop'])document.addEventListener(type,handleProjectPhaseDrag,true);
document.addEventListener('dragleave',event=>{if(drag?.kind==='project-phase'&&!event.relatedTarget?.closest?.('#grid-scroll,.date-wrap'))clearProjectPlanPreview();});
function planProjectPhase(projectId,phaseId,anchor){
  const project=getProject(projectId),phase=project?.phases.find(p=>p.id===phaseId);if(!phase)return;
  const days=Array.from({length:7},(_,i)=>dateKey(addDays(week,i))).filter(d=>d>=phase.start&&d<=phase.end);
  projectPanel('Als Tagesaufgabe planen',`<form id="phase-plan-form"><p class="modal-note">${esc(project.name+' · '+phase.name)}</p>${days.length?`<label class="full-field"><span class="field-label">Tag</span><select id="phase-plan-day">${days.map(d=>`<option value="${d}">${dayLabel(d)} · ${d}</option>`).join('')}</select></label><div class="form-row"><label><span class="field-label">Beginn</span><input id="phase-plan-start" value="10:00" required></label><label><span class="field-label">Ende</span><input id="phase-plan-end" value="12:00" required></label></div><p class="modal-note">Die Aufgabe wird oben angelegt. Personen anschließend einer konkreten Schicht zuordnen.</p><p id="phase-plan-error" class="form-error"></p><div class="toolkit-actions"><button class="primary-button">Tagesaufgabe anlegen</button></div>`:'<p class="modal-note">Diese Phase liegt außerhalb der ausgewählten Woche. Wähle oben eine passende Planungswoche.</p>'}</form>`,anchor);
  $('#phase-plan-form').onsubmit=e=>{e.preventDefault();if(!days.length)return;const date=$('#phase-plan-day').value,start=toHour($('#phase-plan-start').value),end=toHour($('#phase-plan-end').value),label=project.name+' · '+phase.name;
    if(!days.includes(date)||!Number.isFinite(start)||!Number.isFinite(end)||start<8||end>24||end-start<.25){$('#phase-plan-error').textContent='Bitte eine Zeit zwischen 08:00 und 24:00 wählen.';return;}
    if(data.activities.some(a=>activityKey(a.date,a)===activityKey(date,{type:'flex',label}))){$('#phase-plan-error').textContent='Diese Projektphase ist an diesem Tag bereits eingeplant.';return;}
    data.activities.push({id:uid(),date,type:'flex',label,color:project.color,start,end,explicit:true});persist();refresh();closePanel();expandDay(date);toast('Projektphase als Tagesaufgabe angelegt.');
  };
}
let projectFocus=null;
function openProjectFocus(id){
  const project=getProject(id);if(!project)return;
  closePanel();projectFocus={id,draft:structuredClone(project),selected:project.phases[0].id};
  const dialog=$('#project-focus');renderProjectFocus();dialog.showModal();
}
function closeProjectFocus(){
  const id=projectFocus?.id;$('#project-focus').close();projectFocus=null;
  [...document.querySelectorAll('[data-edit-project]')].find(el=>el.dataset.editProject===id)?.focus({preventScroll:true});
}
function reorderFocusPhase(from,to){
  const p=projectFocus.draft;if(from===to||to<0||to>=p.phases.length)return;
  const spans=new Map(p.phases.map(phase=>[phase.id,projectDay(phase.end)-projectDay(phase.start)+1]));
  const [phase]=p.phases.splice(from,1);p.phases.splice(to,0,phase);let day=projectDay(p.start);
  p.phases.forEach(phase=>{phase.start=projectDate(day);day+=spans.get(phase.id);phase.end=projectDate(day-1);});
  projectFocus.selected=phase.id;renderProjectFocus();
}
function splitFocusPhase(day){
  const p=projectFocus.draft,phase=p.phases.find(p=>p.id===projectFocus.selected),start=projectDay(phase.start),end=projectDay(phase.end)+1;
  if(end-start<2){$('#focus-error').textContent='Diese Phase ist nur einen Tag lang. Ziehe zuerst ihre Grenze weiter.';return;}
  const boundary=clamp(day??Math.floor((start+end)/2),start+1,end-1),next={...structuredClone(phase),id:uid(),name:'Neue Phase',start:projectDate(boundary)};
  phase.end=projectDate(boundary-1);p.phases.splice(p.phases.indexOf(phase)+1,0,next);projectFocus.selected=next.id;renderProjectFocus();$('#focus-name').select();
}
function paintProjectFocus(){
  const p=projectFocus.draft,start=projectDay(p.start),days=projectDay(p.end)-start+1;
  p.phases.forEach(phase=>{const el=$('#project-focus').querySelector(`[data-focus-phase="${phase.id}"]`);if(!el)return;el.style.left=(projectDay(phase.start)-start)/days*100+'%';el.style.width=(projectDay(phase.end)-projectDay(phase.start)+1)/days*100+'%';el.querySelector('time').textContent=phase.start+' – '+phase.end;});
}
function renderProjectFocus(){
  if(!projectFocus)return;
  const p=projectFocus.draft,phase=p.phases.find(p=>p.id===projectFocus.selected)||p.phases[0],index=p.phases.indexOf(phase),start=projectDay(p.start),days=projectDay(p.end)-start+1,today=projectDay(todayKey());
  projectFocus.selected=phase.id;
  const dialog=$('#project-focus');
  dialog.innerHTML=`<header class="focus-heading"><div><span>PROJEKTPHASEN</span><h2 id="project-focus-title">${esc(p.name)}</h2><p>${p.start} – ${p.end} · ${days} Tage</p></div><button id="focus-close" class="icon-button" aria-label="Phasenansicht schließen">${icon('close')}</button></header><div class="focus-ruler">${Array.from({length:7},(_,i)=>`<span>${parseDate(projectDate(start+Math.round(i*(days-1)/6))).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</span>`).join('')}</div><div class="focus-timeline" style="--project-color:${p.color};--focus-ink:${taskInk({type:'flex',color:p.color})}">${p.phases.map((item,i)=>`<button class="focus-phase ${item.id===phase.id?'selected':''}" draggable="true" data-focus-phase="${item.id}" aria-pressed="${item.id===phase.id}" style="--phase-shade:${i%2?24:8}%"><b>${esc(item.name)}</b><time></time><small>${esc(item.people.map(id=>data.people.find(p=>p.id===id)?.name).filter(Boolean).join(' · ')||'Noch nicht zugeordnet')}</small>${i<p.phases.length-1?'<i class="focus-edge" aria-hidden="true"></i>':''}</button>`).join('')}${today>=start&&today<start+days?`<span class="focus-today" style="left:${(today-start+.5)/days*100}%"><small>Heute</small></span>`:''}</div><div class="focus-tools"><span>Grenzen ziehen · Phasen zum Umsortieren ziehen · Doppelklick zum Teilen</span><button id="focus-add" class="subtle-button">${icon('plus')} Phase hinzufügen</button></div><form id="focus-phase-form"><div class="focus-fields"><label><span class="field-label">Phase</span><input id="focus-name" maxlength="80" required value="${esc(phase.name)}"></label><label><span class="field-label">Beginn</span><input id="focus-start" type="date" required value="${phase.start}" ${index===0?'disabled':''}></label><label><span class="field-label">Ende</span><input id="focus-end" type="date" required value="${phase.end}" ${index===p.phases.length-1?'disabled':''}></label><div class="focus-order"><button type="button" id="focus-left" class="icon-button" aria-label="Phase nach links verschieben" ${index===0?'disabled':''}>${icon('chevron-left')}</button><button type="button" id="focus-right" class="icon-button" aria-label="Phase nach rechts verschieben" ${index===p.phases.length-1?'disabled':''}>${icon('chevron-right')}</button><button type="button" id="focus-delete" class="delete-button" aria-label="Phase löschen" ${p.phases.length===1?'disabled':''}>${icon('trash')}</button></div></div><label class="focus-notes"><span class="field-label">Notiz</span><textarea id="focus-note" maxlength="2000">${esc(phase.notes)}</textarea></label><div class="focus-people"><span>Verantwortlich</span>${data.people.map(person=>`<button type="button" class="focus-person" data-focus-person="${person.id}" aria-pressed="${phase.people.includes(person.id)}" style="--person:${person.color}"><i></i>${esc(person.name)}</button>`).join('')}</div><p id="focus-error" class="form-error" role="status"></p><footer class="focus-footer"><button type="button" id="focus-cancel" class="secondary-button">Abbrechen</button><button class="primary-button">Änderungen übernehmen</button></footer></form>`;
  paintProjectFocus();
  $('#focus-close').onclick=$('#focus-cancel').onclick=closeProjectFocus;
  const updateFields=()=>{
    const name=$('#focus-name').value.trim(),a=$('#focus-start').value,b=$('#focus-end').value,prev=p.phases[index-1],next=p.phases[index+1];
    if(!name||!a||!b||a>b||prev&&a<=prev.start||next&&b>=next.end){$('#focus-error').textContent='Jede Phase benötigt mindestens einen Tag.';return false;}
    phase.name=name;phase.notes=$('#focus-note').value;phase.start=a;phase.end=b;if(prev)prev.end=projectDate(projectDay(a)-1);if(next)next.start=projectDate(projectDay(b)+1);
    dialog.querySelector(`[data-focus-phase="${phase.id}"] b`).textContent=name;paintProjectFocus();$('#focus-error').textContent='';return true;
  };
  for(const id of ['focus-name','focus-start','focus-end','focus-note'])$('#'+id).onchange=updateFields;
  $('#focus-phase-form').onsubmit=e=>{e.preventDefault();if(!updateFields())return;const project=getProject(projectFocus.id);if(!project)return closeProjectFocus();Object.assign(project,structuredClone(p));persist();renderProjects();closeProjectFocus();};
  $('#focus-add').onclick=()=>{if(updateFields())splitFocusPhase();};
  $('#focus-left').onclick=()=>{if(updateFields())reorderFocusPhase(index,index-1);};$('#focus-right').onclick=()=>{if(updateFields())reorderFocusPhase(index,index+1);};
  $('#focus-delete').onclick=()=>{if(p.phases.length===1)return;const next=p.phases[index+1],prev=p.phases[index-1];if(next)next.start=phase.start;else prev.end=phase.end;p.phases.splice(index,1);projectFocus.selected=(next||prev).id;renderProjectFocus();};
  dialog.querySelectorAll('[data-focus-person]').forEach(b=>b.onclick=()=>{if(!updateFields())return;const person=data.people.find(p=>p.id===b.dataset.focusPerson),has=phase.people.includes(person.id);if(!has&&(person.from&&person.from>phase.end||person.until&&person.until<phase.start)){$('#focus-error').textContent='Diese Person ist während der Phase nicht im Team.';return;}phase.people=has?phase.people.filter(id=>id!==person.id):[...phase.people,person.id];renderProjectFocus();});
  let dragged=null;
  dialog.querySelectorAll('[data-focus-phase]').forEach(el=>{
    const item=p.phases.find(p=>p.id===el.dataset.focusPhase);
    el.onclick=e=>{if(e.target.closest('.focus-edge')||suppressClick)return;if(projectFocus.selected!==item.id&&updateFields()){projectFocus.selected=item.id;renderProjectFocus();}};
    el.ondblclick=e=>{e.preventDefault();projectFocus.selected=item.id;const r=dialog.querySelector('.focus-timeline').getBoundingClientRect();splitFocusPhase(start+Math.round((e.clientX-r.left)/r.width*days));};
    el.ondragstart=e=>{if(e.target.closest('.focus-edge')||!updateFields()){e.preventDefault();return;}dragged=item.id;e.dataTransfer.setData('text/plain',item.id);e.dataTransfer.effectAllowed='move';};
    el.ondragover=e=>{if(dragged){e.preventDefault();e.dataTransfer.dropEffect='move';el.classList.add('focus-drop');}};
    el.ondragleave=()=>el.classList.remove('focus-drop');el.ondrop=e=>{e.preventDefault();if(dragged)reorderFocusPhase(p.phases.findIndex(p=>p.id===dragged),p.phases.indexOf(item));};el.ondragend=()=>{dragged=null;dialog.querySelectorAll('.focus-drop').forEach(el=>el.classList.remove('focus-drop'));};
    const handle=el.querySelector('.focus-edge');if(handle)handle.onpointerdown=e=>{
      if(e.button!==0||!updateFields())return;e.preventDefault();e.stopPropagation();
      const next=p.phases[p.phases.indexOf(item)+1],old=item.end,oldNext=next.start,x=e.clientX,width=dialog.querySelector('.focus-timeline').getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);
      handle.onpointermove=event=>{const end=clamp(projectDay(old)+Math.round((event.clientX-x)/width*days),projectDay(item.start),projectDay(next.end)-1);item.end=projectDate(end);next.start=projectDate(end+1);paintProjectFocus();if(phase===item)$('#focus-end').value=item.end;if(phase===next)$('#focus-start').value=next.start;};
      const finish=event=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;if(event.type==='pointercancel'){item.end=old;next.start=oldNext;}suppressClick=true;renderProjectFocus();setTimeout(()=>suppressClick=false,0);};handle.onpointerup=finish;handle.onpointercancel=finish;
    };
  });
}
document.body.insertAdjacentHTML('beforeend','<dialog id="project-focus" aria-labelledby="project-focus-title"></dialog>');
$('#project-focus').addEventListener('cancel',e=>{e.preventDefault();closeProjectFocus();});
document.addEventListener('keydown',e=>{if($('#project-focus').open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeProjectFocus();}},true);
document.querySelector('.workspace').insertAdjacentHTML('afterend','<section id="projects" aria-label="Projektübersicht" hidden></section>');
renderProjects();
