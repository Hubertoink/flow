(() => {
  const team=window.flowTeam;
  let state=team.bootstrap,base=structuredClone(state.plan),saving=false,scheduled=false,resolveSave=null,pending=null,pollBusy=false,offline=false;
  const collectionNames=['people','shifts','activities','projects','taskTypes'];
  const preferenceKeys=['theme','background','saturday','sunday','weekend','zoom','hoursTransition','projectsEnabled','projectsCollapsed','projectHeight','projectWeeks'];
  let preferences=structuredClone(state.preferences),lastAudit=null;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  const clone=v=>structuredClone(v);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const weekKey=day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};
  const period=day=>state.periods.find(p=>p.week===weekKey(day));
  const admin=()=>state.member.role==='admin';
  const can=(action,person)=>admin()||person===state.member.personId&&state.member.permissions.self[action]||state.member.permissions.delegates.some(d=>d.personId===person&&(!d.until||d.until>=today())&&d[action]);
  const viewDate=day=>admin()||state.member.permissions.viewDrafts||period(day)?.published;
  const timeReason=(s,action='update')=>!viewDate(s.date)?'Diese Woche ist noch nicht veröffentlicht.':!can(action,s.person)?'Du darfst die Arbeitszeiten dieser Person nicht planen.':(s.lock||'open')!=='open'?'Die Arbeitszeiten dieser Schicht sind fixiert.':period(s.date)?.timesLocked?'Die Arbeitszeitplanung dieser Woche ist gesperrt.':'';
  const taskReason=(s,t)=>!viewDate(s.date)?'Diese Woche ist noch nicht veröffentlicht.':!can('tasks',s.person)?'Du darfst die Aufgaben dieser Person nicht zuordnen.':s.lock==='all'?'Diese Schicht ist vollständig fixiert.':t?.locked?'Diese Aufgabe ist verbindlich festgelegt.':'';
  const check=reason=>{if(reason){toast(reason);return false;}return true;};
  async function request(url,body,method=body?'POST':'GET'){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{const response=await fetch(url,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const result=await response.json();if(!response.ok){const error=new Error(result.message||'Die Anfrage ist fehlgeschlagen.');error.status=response.status;throw error;}return result;}
    catch(error){if(!error.status)error.message='Der Server ist nicht erreichbar. Änderungen wurden nicht bestätigt.';throw error;}finally{clearTimeout(timeout);}
  }
  function banner(message){const element=document.querySelector('#team-error-banner');if(!element)return;element.hidden=!message;element.querySelector('span').textContent=message||'';}
  function status(message){const el=document.querySelector('#team-status');if(!el)return;el.textContent=message||(saving?'Wird gespeichert …':offline?'Verbindung unterbrochen':'Gespeichert');el.dataset.state=offline?'offline':'ok';}
  function busy(value){saving=value;document.body.classList.toggle('team-saving',value);document.querySelector('#app')?.setAttribute('aria-busy',String(value));status();}
  function reconcile(current,next){
    if(Array.isArray(next)){const byId=new Map((Array.isArray(current)?current:[]).filter(v=>v&&typeof v==='object'&&v.id).map(v=>[v.id,v]));return next.map(value=>value&&typeof value==='object'&&value.id&&byId.has(value.id)?reconcile(byId.get(value.id),value):clone(value));}
    if(next&&typeof next==='object'){const target=current&&typeof current==='object'&&!Array.isArray(current)?current:{};for(const key of Object.keys(target))if(!(key in next))delete target[key];for(const [key,value] of Object.entries(next))target[key]=reconcile(target[key],value);return target;}
    return next;
  }
  function apply(next,{close=true}={}){
    state=next;base=clone(next.plan);preferences=clone(next.preferences);team.bootstrap=next;
    if(close){endGesture(true);closePanel();document.querySelector('#modal')?.close();window.closeProjectFocus?.();editing=null;selected=null;picked=null;clearDrop();}
    const updated={...clone(next.plan),settings:{...clone(next.plan.settings),...clone(next.preferences)}};
    const unchanged=!close&&same(data,updated);
    data=close?updated:reconcile(data,updated);
    tasks.splice(0,tasks.length,...clone(data.taskTypes));
    // A save acknowledgement usually confirms the already rendered optimistic plan.
    // Keep its DOM, scroll position and open editor instead of rebuilding the canvas.
    if(unchanged){decorate();return;}
    zoom=Number(data.settings.zoom)||1;applyTheme();applyBackground();renderLegend();refresh();status();
  }
  function diff(before,after){const changes=[];for(const collection of collectionNames){const a=new Map(before[collection].map(e=>[e.id,e])),b=new Map(after[collection].map(e=>[e.id,e]));for(const id of new Set([...a.keys(),...b.keys()]))if(!same(a.get(id),b.get(id)))changes.push({collection,id,before:a.get(id)||null,after:b.get(id)||null});}if(!same(before.settings,after.settings))changes.push({collection:'settings',id:'settings',before:before.settings,after:after.settings});return changes;}
  async function submit(){
    scheduled=false;
    const plan={...clone(data),settings:{breakRules:clone(data.settings.breakRules||[])}};
    const personal=Object.fromEntries(preferenceKeys.filter(k=>data.settings[k]!==undefined).map(k=>[k,clone(data.settings[k])])),changes=diff(base,plan);
    busy(true);let result={auditId:null};
    try{
      if(!same(preferences,personal)){await request('/api/preferences',personal,'PUT');preferences=personal;}
      if(changes.length){const next=await request('/api/plan/commands',{expectedRevision:state.revision,changes});result={auditId:next.auditId};lastAudit=next.auditId;apply(next,{close:false});}
      offline=false;document.body.classList.remove('team-offline');banner('');
    }catch(error){
      result=null;
      if(error.status===401){location.assign('/');return;}
      try{const current=await request('/api/bootstrap');apply(current);offline=false;}catch{offline=true;document.body.classList.add('team-offline');data={...clone(base),settings:{...clone(base.settings),...clone(preferences)}};tasks.splice(0,tasks.length,...clone(data.taskTypes));closePanel();editing=null;refresh();}
      banner(error.message);toast(error.message);
    }finally{busy(false);const resolve=resolveSave;resolveSave=null;pending=null;if(resolve)resolve(result);}
  }
  team.save=()=>{
    if(scheduled||saving)return pending||Promise.resolve(null);
    scheduled=true;pending=new Promise(resolve=>resolveSave=resolve);queueMicrotask(submit);return pending;
  };
  team.attachUndo=button=>{
    queueMicrotask(()=>{const operation=pending;button.disabled=true;if(!operation){button.hidden=true;return;}operation.then(result=>{if(!button.isConnected)return;if(!result?.auditId){button.hidden=true;return;}button.disabled=false;button.onclick=()=>undo(result.auditId);});});
  };
  async function undo(auditId){if(saving)return;busy(true);try{const next=await request('/api/plan/undo',{auditId,expectedRevision:state.revision});apply(next);banner('');toast('Änderung rückgängig gemacht.');}catch(error){banner(error.message);toast(error.message);}finally{busy(false);}}
  team.checkTime=(s,action)=>check(timeReason(s,action));team.checkTasks=(s,t)=>check(taskReason(s,t));
  team.canCreate=(person,date,withTasks=false)=>!timeReason({person,date,lock:'open'},'create')&&(!withTasks||can('tasks',person));
  team.canTasks=s=>!taskReason(s);team.canActivities=()=>admin()||state.member.permissions.manageActivities;
  team.checkActivities=()=>check(admin()||state.member.permissions.manageActivities?'':'Gemeinsame Tagesaufgaben darfst du nicht bearbeiten.');
  team.syncActivities=(plan,templates)=>{
    plan.activities ||= [];
    const oldShifts=new Map(base.shifts.map(s=>[s.id,s])),oldTasks=new Set(base.shifts.flatMap(s=>s.segments.map(t=>t.id))),ranges=new Map();
    for(const s of plan.shifts){if(!oldShifts.has(s.id))s.lock='open';else s.lock??='open';for(const t of s.segments){
      if(!oldTasks.has(t.id))t.locked=false;else t.locked??=false;
      const name=t.label?.trim().replace(/\s+/g,' ')||templates.find(type=>type.id===t.type)?.name||'Aufgabe';
      let a=plan.activities.find(a=>a.id===t.activityId&&a.date===s.date&&a.type===t.type&&a.label===name);
      if(!a){a={id:crypto.randomUUID(),date:s.date,type:t.type,label:name,color:t.color||templates.find(type=>type.id===t.type)?.color||'#c5cdd7',start:s.start+t.offset,end:s.start+t.offset+t.duration,explicit:false};plan.activities.push(a);}
      t.activityId=a.id;const r=ranges.get(a.id)||{start:24,end:0};r.start=Math.min(r.start,s.start+t.offset);r.end=Math.max(r.end,s.start+t.offset+t.duration);ranges.set(a.id,r);
    }}
    plan.activities=plan.activities.filter(a=>a.explicit||ranges.has(a.id));for(const a of plan.activities)if(ranges.has(a.id))Object.assign(a,ranges.get(a.id));
  };
  async function administrative(url,body,method='PUT'){
    if(saving||scheduled)return;busy(true);try{const next=await request(url,body,method);if(next.plan)apply(next);else{const current=await request('/api/bootstrap');apply(current);}banner('');return next;}
    catch(error){banner(error.message);toast(error.message);if(error.status===409)try{apply(await request('/api/bootstrap'));}catch{}return null;}
    finally{busy(false);}
  }
  function decorate(){
    const weekState=document.querySelector('#team-week-state');if(weekState){const p=period(dateKey(week));weekState.textContent=[p?.published?'Veröffentlicht':'',p?.timesLocked?'Zeiten fixiert':''].filter(Boolean).join(' · ');weekState.hidden=!weekState.textContent;document.querySelector('#team-publish').innerHTML=icon('users')+(p?.published?'Woche als Entwurf':'Woche veröffentlichen');document.querySelector('#team-week-lock').innerHTML=icon('lock')+(p?.timesLocked?'Wochenzeiten freigeben':'Wochenzeiten fixieren');}
    document.querySelectorAll('.shift').forEach(element=>{
      const s=getShift(element.dataset.shift);if(!s)return;
      element.classList.toggle('team-readonly',!!timeReason(s));
      if(admin()&&!element.querySelector('.team-shift-lock')){
        const button=document.createElement('button');button.className='team-shift-lock';button.type='button';button.innerHTML=icon('key');button.setAttribute('aria-label','Fixierung der Schicht ändern');button.title='Schicht fixieren';
        button.onpointerdown=e=>e.stopPropagation();button.onkeydown=e=>e.stopPropagation();button.onclick=e=>{e.stopPropagation();showShiftLock(s);};element.append(button);
      }
      const lockText=s.lock==='all'?'Vollständig fixiert':s.lock==='times'?'Zeiten fixiert':period(s.date)?.timesLocked?'Wochenzeiten fixiert':'';
      element.querySelector('.team-lock-label')?.remove();if(lockText)element.insertAdjacentHTML('beforeend',`<span class="team-lock-label">${icon('lock')}${lockText}</span>`);
      for(const t of s.segments)element.querySelector(`[data-task="${t.id}"]`)?.setAttribute('data-team-pinned',String(t.locked));
    });
    if(!admin()){
      document.querySelectorAll('#project-new,#project-empty-add,.project-phase-edge,.focus-edge').forEach(el=>el.hidden=true);
      document.querySelectorAll('.project-phase').forEach(el=>{el.draggable=state.member.permissions.manageActivities;});
    }
    document.querySelectorAll('.token').forEach(el=>{const allowed=can('create',el.dataset.person)||can('tasks',el.dataset.person);el.draggable=allowed;el.style.opacity=allowed?'':'0.55';});
    const importButton=document.querySelector('[data-action=import]');if(importButton)importButton.hidden=!admin();
    for(const key of ['team-management','team-publish','team-week-lock']){const button=document.querySelector('#'+key);if(button)button.hidden=!admin();}
    document.querySelector('#team-outbox-menu')?.setAttribute('aria-hidden',String(!admin()||!state.localMail));
    if(document.querySelector('#team-outbox-menu'))document.querySelector('#team-outbox-menu').hidden=!admin()||!state.localMail;
    status();
  }
  team.decorateToolkit=(s,t,panel)=>{
    const reason=t?taskReason(s,t):timeReason(s),removeReason=t?reason:timeReason(s,'delete')||s.segments.some(t=>t.locked)&&'Enthält verbindliche Aufgaben.';
    if(reason){panel.querySelectorAll('#tool-start,#tool-end,#task-label,#task-color,.color-swatch,#toolkit-form .primary-button').forEach(el=>el.disabled=true);panel.insertAdjacentHTML('beforeend',`<p class="modal-note">${escape(reason)}</p>`);}
    const remove=panel.querySelector('#delete-shift');if(remove)remove.disabled=!!removeReason;
    const add=panel.querySelector('#tool-add');if(add)add.disabled=!!taskReason(s);
    if(admin()&&t){
      panel.insertAdjacentHTML('beforeend',`<div class="team-lock-controls"><label><span>Verbindliche Aufgabe</span><input id="team-pin-assignment" type="checkbox" ${t.locked?'checked':''}></label></div>`);
      panel.querySelector('#team-pin-assignment').onchange=e=>administrative(`/api/shifts/${s.id}/assignments/${t.id}/lock`,{expectedRevision:state.revision,locked:e.target.checked});
    }
  };
  function showShiftLock(s){
    modal('Schicht fixieren',`<p class="modal-note">Zeiten fixieren lässt die Aufgabenplanung frei. Vollständig fixieren schützt auch die Aufgaben.</p><label><span class="field-label">Fixierung</span><select id="team-shift-lock"><option value="open">Offen</option><option value="times">Zeiten fixiert</option><option value="all">Vollständig fixiert</option></select></label><p class="modal-note">${period(s.date)?.timesLocked?'Die Wochenzeiten sind zusätzlich fixiert.':''}</p>`,{wide:false});
    const input=document.querySelector('#team-shift-lock');input.value=s.lock||'open';input.onchange=action(async()=>{await administrative(`/api/shifts/${s.id}/lock`,{expectedRevision:state.revision,lock:input.value});document.querySelector('#modal-close')?.click();});
  }
  team.decorateActivity=(a,panel)=>{
    if(!admin()&&!state.member.permissions.manageActivities)panel.querySelectorAll('#activity-name,#activity-start,#activity-end,#activity-delete,#activity-form .primary-button').forEach(el=>el.disabled=true);
    panel.querySelectorAll('[data-unassign]').forEach(button=>{const s=data.shifts.find(s=>s.segments.some(t=>t.id===button.dataset.unassign)),t=s?.segments.find(t=>t.id===button.dataset.unassign);button.disabled=!s||!!taskReason(s,t);});
  };
  function modal(title,html,{wide=true}={}){openModal(`${modalTop(escape(title))}<div class="team-dialog-body">${html}</div><p id="team-dialog-error" class="form-error" role="alert"></p>`);document.querySelector('#modal').classList.toggle('team-modal',wide);}
  function action(fn){return async e=>{const target=e.currentTarget.tagName==='FORM'?e.currentTarget.querySelector('[type=submit]'):e.currentTarget;target.disabled=true;try{await fn(e);}catch(error){document.querySelector('#team-dialog-error')?.replaceChildren(document.createTextNode(error.message));}finally{if(target.isConnected)target.disabled=false;}};}
  const personOptions=(selected,none=true)=>`${none?'<option value="">Keine Verknüpfung</option>':''}${data.people.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${escape(p.name)}</option>`).join('')}`;
  const actionLabels={create:'Anlegen',update:'Ändern',delete:'Löschen',tasks:'Aufgaben'};
  const defaultRights=()=>({self:{create:true,update:true,delete:true,tasks:true},delegates:[],manageActivities:false,viewScope:'team',viewDrafts:true});
  function rightsFields(permissions,personId){
    const rows=[{id:'self',name:'Eigene Person',rights:permissions.self,until:''},...data.people.map(p=>({id:p.id,name:p.name,rights:permissions.delegates.find(d=>d.personId===p.id)||{},until:permissions.delegates.find(d=>d.personId===p.id)?.until||''}))];
    return `<fieldset><legend>Planungsrechte</legend><p class="modal-note">Arbeitszeiten und Aufgaben werden getrennt freigegeben. Schicht- und Wochensperren gelten zusätzlich.</p><div class="team-rights"><table class="team-table"><thead><tr><th>Für wen?</th>${Object.values(actionLabels).map(label=>`<th>${label}</th>`).join('')}<th>Bis einschließlich</th></tr></thead><tbody>${rows.map(row=>`<tr data-rights-person="${row.id}" ${row.id===personId?'hidden':''}><td>${escape(row.name)}</td>${Object.entries(actionLabels).map(([key,label])=>`<td><input type="checkbox" data-right="${key}" aria-label="${escape(row.name)}: ${label}" ${row.rights[key]?'checked':''}></td>`).join('')}<td>${row.id==='self'?'Unbefristet':`<input type="date" data-until value="${row.until}" aria-label="Freigabe für ${escape(row.name)} bis einschließlich"></td>`}</tr>`).join('')}</tbody></table></div></fieldset><div class="team-form-grid"><label><span class="field-label">Sichtbare Personen</span><select name="viewScope"><option value="team" ${permissions.viewScope==='team'?'selected':''}>Gesamtes Team</option><option value="self" ${permissions.viewScope==='self'?'selected':''}>Eigene Person</option><option value="delegated" ${permissions.viewScope==='delegated'?'selected':''}>Eigene und delegierte Personen</option></select></label><div><label class="team-choice"><input name="viewDrafts" type="checkbox" ${permissions.viewDrafts?'checked':''}> Entwürfe sehen und planen</label><label class="team-choice"><input name="manageActivities" type="checkbox" ${permissions.manageActivities?'checked':''}> Gemeinsame Tagesaufgaben verwalten</label></div></div>`;
  }
  function readRights(form,personId){const permissions={self:{},delegates:[],manageActivities:form.elements.manageActivities.checked,viewScope:form.elements.viewScope.value,viewDrafts:form.elements.viewDrafts.checked};form.querySelectorAll('[data-rights-person]').forEach(row=>{const rights=Object.fromEntries([...row.querySelectorAll('[data-right]')].map(el=>[el.dataset.right,el.checked]));if(row.dataset.rightsPerson==='self')permissions.self=rights;else if(row.dataset.rightsPerson!==personId&&Object.values(rights).some(Boolean))permissions.delegates.push({personId:row.dataset.rightsPerson,...rights,until:row.querySelector('[data-until]').value});});return permissions;}
  function wirePerson(form){form.elements.personId.onchange=()=>{const selected=form.elements.personId.value;form.querySelectorAll('[data-rights-person]').forEach(row=>row.hidden=row.dataset.rightsPerson===selected);if(form.elements.name){const p=data.people.find(p=>p.id===selected);if(p)form.elements.name.value=p.name;}};}
  async function openTeam(){
    const response=await request('/api/team');
    modal('Team und Zugänge',`<div class="team-toolbar"><p class="modal-note">${escape(state.organization)} · ${response.members.length} Konten</p><button id="team-invite" class="primary-button">Person einladen</button></div><div class="team-rights"><table class="team-table"><thead><tr><th>Konto</th><th>Person / Rolle</th><th>Status</th><th></th></tr></thead><tbody>${response.members.map(m=>`<tr><td><strong>${escape(m.name)}</strong><small>${escape(m.email)}</small></td><td>${escape(data.people.find(p=>p.id===m.personId)?.name||'Nicht verknüpft')}<small>${m.role==='admin'?'Admin':'Mitarbeitend'}</small></td><td>${m.active?'Aktiv':'Deaktiviert'}<small>${m.twoFactorEnabled?'2FA aktiv':'2FA aus'}</small></td><td><button data-edit-member="${m.userId}">Rechte & Konto</button></td></tr>`).join('')}</tbody></table></div><h3>Einladungen</h3>${response.invitations.length?`<div class="team-rights"><table class="team-table"><tbody>${response.invitations.map(i=>`<tr><td>${escape(i.name)}<small>${escape(i.email)}</small></td><td>${i.acceptedAt?'Angenommen':i.revokedAt?'Widerrufen':Date.parse(i.expiresAt)<Date.now()?'Abgelaufen':'Offen bis '+new Date(i.expiresAt).toLocaleDateString('de-DE')}</td><td>${!i.acceptedAt&&!i.revokedAt?`<button data-revoke-invite="${i.id}">Widerrufen</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="modal-note">Noch keine Einladungen.</p>'}${state.localMail?'<button id="team-outbox" class="secondary-button">Lokalen Postausgang öffnen</button>':''}<p class="modal-note">Mitarbeitendenprofile legst du unter Einstellungen → Mitarbeitende an. Eine Einladung verknüpft das Profil mit einem Konto.</p>`);
    document.querySelector('#team-invite').onclick=()=>invitationForm();
    document.querySelectorAll('[data-edit-member]').forEach(button=>button.onclick=()=>memberForm(response.members.find(m=>m.userId===button.dataset.editMember)));
    document.querySelectorAll('[data-revoke-invite]').forEach(button=>button.onclick=action(async()=>{await request('/api/invitations/'+button.dataset.revokeInvite,{},'DELETE');await openTeam();}));
    document.querySelector('#team-outbox')?.addEventListener('click',()=>openOutbox());
  }
  function invitationForm(){
    modal('Person einladen',`<form id="team-invitation-form"><div class="team-form-grid"><label><span class="field-label">Mitarbeitendenprofil</span><select name="personId">${personOptions(null)}</select></label><label><span class="field-label">Rolle</span><select name="role"><option value="member">Mitarbeitend</option><option value="admin">Admin</option></select></label><label><span class="field-label">Name</span><input name="name" required maxlength="80"></label><label><span class="field-label">E-Mail</span><input name="email" type="email" required maxlength="254"></label></div>${rightsFields(defaultRights(),null)}<div class="form-actions"><button type="button" id="team-invite-back" class="secondary-button">Zurück</button><button type="submit" class="primary-button">Einladung erstellen</button></div></form>`);
    const form=document.querySelector('#team-invitation-form');wirePerson(form);document.querySelector('#team-invite-back').onclick=()=>openTeam();
    form.onsubmit=action(async e=>{e.preventDefault();const fields=new FormData(form),personId=fields.get('personId')||null;const result=await request('/api/invitations',{personId,name:fields.get('name'),email:fields.get('email'),role:fields.get('role'),permissions:readRights(form,personId)});modal('Einladung erstellt',`<p>${escape(result.message)}</p><p class="modal-note">Der Link ist sieben Tage gültig und kann einmal verwendet werden.</p><div class="team-invite-link"><input id="new-invitation-link" readonly value="${escape(result.url)}"><button id="copy-invitation" class="secondary-button">Kopieren</button></div><button id="invitation-done" class="primary-button">Zum Team</button>`);document.querySelector('#copy-invitation').onclick=action(async()=>{await navigator.clipboard.writeText(result.url);toast('Einladungslink kopiert.');});document.querySelector('#invitation-done').onclick=()=>openTeam();});
  }
  function memberForm(member){
    modal(member.name+' · Konto und Rechte',`<form id="team-member-form"><p>${escape(member.email)}</p><div class="team-form-grid"><label><span class="field-label">Mitarbeitendenprofil</span><select name="personId">${personOptions(member.personId)}</select></label><label><span class="field-label">Rolle</span><select name="role"><option value="member" ${member.role==='member'?'selected':''}>Mitarbeitend</option><option value="admin" ${member.role==='admin'?'selected':''}>Admin</option></select></label></div><label class="team-choice"><input name="active" type="checkbox" ${member.active?'checked':''}> Konto aktiv</label>${rightsFields(member.permissions,member.personId)}<p class="modal-note">Admins verwalten das gesamte Team. Die einzelnen Freigaben gelten für die Rolle „Mitarbeitend“. Deaktivieren beendet alle Sitzungen und erhält historische Planungsdaten.</p><div class="form-actions"><button type="button" id="member-back" class="secondary-button">Zurück</button><button type="submit" class="primary-button">Speichern</button></div><button type="button" id="member-sessions" class="subtle-button">Alle Sitzungen dieses Kontos beenden</button></form>`);
    const form=document.querySelector('#team-member-form');wirePerson(form);document.querySelector('#member-back').onclick=()=>openTeam();
    form.onsubmit=action(async e=>{e.preventDefault();const personId=form.elements.personId.value||null;await request('/api/team/'+member.userId,{personId,role:form.elements.role.value,active:form.elements.active.checked,permissions:readRights(form,personId)},'PATCH');apply(await request('/api/bootstrap'));await openTeam();});
    document.querySelector('#member-sessions').onclick=action(async()=>{await request('/api/team/'+member.userId+'/revoke-sessions',{});toast('Sitzungen beendet.');});
  }
  async function openOutbox(){const messages=await request('/api/local-mail');modal('Lokaler Postausgang',`<p class="team-notice">Für diesen lokalen Test werden E-Mails hier angezeigt. Auf dem Server richtest du SMTP für Einladungen und Passwortlinks ein.</p>${messages.length?messages.map(m=>`<article class="team-mail"><strong>${escape(m.subject)}</strong><p class="modal-note">An ${escape(m.recipient)} · ${new Date(m.createdAt).toLocaleString('de-DE')}</p><pre>${escape(m.text)}</pre></article>`).join(''):'<p>Noch keine Nachrichten.</p>'}`);}
  async function openAudit(){
    const entries=await request('/api/audit'),labels={'plan.change':'Plan geändert','plan.undo':'Planänderung rückgängig gemacht','workspace.setup':'Team eingerichtet','invitation.create':'Person eingeladen','invitation.revoke':'Einladung widerrufen','invitation.accept':'Einladung angenommen','member.update':'Konto oder Rechte geändert','sessions.revoke':'Sitzungen beendet','shift.lock':'Schichtsperre geändert','assignment.lock':'Verbindliche Aufgabe geändert','week.update':'Wochenfreigabe geändert'};
    modal('Änderungsverlauf',entries.map(e=>`<div class="team-audit-entry"><div><strong>${escape(labels[e.action]||e.action)}</strong><small>${escape(e.actorName)} · ${new Date(e.createdAt).toLocaleString('de-DE')}${e.detail?.week?' · '+e.detail.week:''}</small>${(e.summary||[]).map(text=>`<small>${escape(text)}</small>`).join('')}${e.undone?'<small>Bereits rückgängig gemacht</small>':''}</div>${e.canUndo?`<button class="secondary-button" data-undo-audit="${e.id}">Rückgängig</button>`:''}</div>`).join('')||'<p>Noch keine Änderungen.</p>');document.querySelectorAll('[data-undo-audit]').forEach(button=>button.onclick=()=>undo(button.dataset.undoAudit));
  }
  function account(){
    modal('Mein Konto',`<p><strong>${escape(state.member.name)}</strong><br>${escape(state.member.email)}</p><h3>Passwort ändern</h3><form id="team-password-form"><label><span class="field-label">Aktuelles Passwort</span><input name="currentPassword" type="password" required autocomplete="current-password"></label><label><span class="field-label">Neues Passwort</span><input name="newPassword" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label><span class="field-label">Passwort wiederholen</span><input name="repeat" type="password" required minlength="12" autocomplete="new-password"></label><button type="submit" class="primary-button">Passwort speichern</button></form><h3>Zwei-Faktor-Anmeldung</h3><p class="modal-note">${state.member.twoFactorEnabled?'Aktiv. Bei der Anmeldung wird zusätzlich ein Code benötigt.':'Sichere dein Konto zusätzlich mit einer Authenticator-App.'}</p><form id="team-twofactor-form"><label><span class="field-label">Aktuelles Passwort</span><input name="password" type="password" required autocomplete="current-password"></label><button type="submit" class="secondary-button">${state.member.twoFactorEnabled?'Zwei-Faktor-Anmeldung deaktivieren':'Zwei-Faktor-Anmeldung einrichten'}</button></form><div class="form-actions"><button id="team-revoke-own" class="secondary-button">Andere Sitzungen beenden</button><button id="team-logout" class="secondary-button">Abmelden</button></div>`,{wide:false});
    const passwordForm=document.querySelector('#team-password-form');passwordForm.onsubmit=action(async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(passwordForm));if(body.newPassword!==body.repeat)throw new Error('Die Passwörter stimmen nicht überein.');delete body.repeat;await request('/api/auth/change-password',{...body,revokeOtherSessions:true});toast('Passwort gespeichert.');passwordForm.reset();});
    document.querySelector('#team-twofactor-form').onsubmit=action(async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));if(state.member.twoFactorEnabled){await request('/api/auth/two-factor/disable',body);apply(await request('/api/bootstrap'));toast('Zwei-Faktor-Anmeldung deaktiviert.');}else{const result=await request('/api/auth/two-factor/enable',body);const secret=new URL(result.totpURI).searchParams.get('secret');modal('Authenticator verbinden',`<p>Füge in deiner Authenticator-App ein Konto mit diesem Schlüssel hinzu. Typ: zeitbasiert (TOTP).</p><div class="team-secret">${escape(secret)}</div><h3>Wiederherstellungscodes</h3><p class="modal-note">Bewahre diese Codes sicher auf. Jeder kann einmal verwendet werden, wenn deine App nicht verfügbar ist.</p><div class="team-backup-codes">${result.backupCodes.map(code=>`<span>${escape(code)}</span>`).join('')}</div><button id="download-backup-codes" class="secondary-button">Codes speichern</button><form id="verify-twofactor-form"><label><span class="field-label">Code aus der App</span><input name="code" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6}"></label><button type="submit" class="primary-button">Aktivierung bestätigen</button></form>`,{wide:false});document.querySelector('#download-backup-codes').onclick=()=>download(result.backupCodes.join('\n'),'text/plain','Flow-Wiederherstellungscodes.txt');const form=document.querySelector('#verify-twofactor-form');form.onsubmit=action(async event=>{event.preventDefault();await request('/api/auth/two-factor/verify-totp',{code:form.elements.code.value,trustDevice:false});apply(await request('/api/bootstrap'));toast('Zwei-Faktor-Anmeldung aktiviert.');});}});
    document.querySelector('#team-revoke-own').onclick=action(async()=>{await request('/api/auth/revoke-other-sessions',{});toast('Andere Sitzungen beendet.');});document.querySelector('#team-logout').onclick=action(async()=>{await request('/api/auth/sign-out',{});location.assign('/');});
  }
  team.importPlan=async transfer=>{
    if(!admin())throw new Error('Den Teamplan kann nur ein Admin importieren.');
    const p=clone(transfer.plan),fields={people:['id','name','color','start','end','hours','weekdayHours','weeklyHours','from','until'],shifts:['id','person','date','start','length','y','segments','lock'],activities:['id','date','type','label','color','start','end','explicit'],projects:['id','name','start','end','color','notes','phases'],taskTypes:['id','name','short','color','hidden']};
    for(const collection of collectionNames)p[collection]=(p[collection]||[]).map(e=>Object.fromEntries(fields[collection].filter(k=>e[k]!==undefined).map(k=>[k,e[k]])));
    for(const s of p.shifts){const existing=base.shifts.find(old=>old.id===s.id);s.lock=existing?.lock||'open';for(const t of s.segments)t.locked=existing?.segments.find(old=>old.id===t.id)?.locked||false;}
    data=p;tasks.splice(0,tasks.length,...p.taskTypes);syncActivities();compactShifts();
    const result=await team.save();if(!result)throw new Error('Der Import wurde nicht gespeichert. Prüfe die Meldung am Plan.');
    apply(await request('/api/bootstrap'));toast('Teamplan importiert. Konten und Rechte bleiben erhalten.');
  };
  team.openImport=()=>{
    if(!admin()){toast('Den Teamplan kann nur ein Admin importieren.');return;}
    modal('Teamplan importieren',`<p>Ersetzt sämtliche Wochen, Mitarbeitendenprofile, Projekte und Aufgabenvorlagen dieser Einrichtung. Konten, Rechte und Wochenfreigaben bleiben erhalten. Bestehende Sperren werden geprüft.</p><button id="team-export-before-import" class="secondary-button">Aktuellen Plan sichern</button><form id="team-import-form"><label><span class="field-label">Flow!-Planexport (.json)</span><input name="file" type="file" accept=".json,application/json" required></label><p id="team-import-preview" class="modal-note"></p><label class="team-choice"><input name="confirmed" type="checkbox" required> Ich möchte den aktuellen Teamplan ersetzen.</label><button type="submit" class="primary-button" disabled>Teamplan ersetzen</button></form>`,{wide:false});
    let candidate;const form=document.querySelector('#team-import-form'),button=form.querySelector('[type=submit]');document.querySelector('#team-export-before-import').onclick=exportPlan;
    form.elements.file.onchange=action(async()=>{candidate=null;button.disabled=true;const file=form.elements.file.files[0];if(!file)return;if(file.size>PLAN_IMPORT_LIMIT)throw new Error('Die Datei ist größer als 10 MB.');candidate=readPlanTransfer(await file.text());document.querySelector('#team-import-preview').textContent=candidate.plan.people.length+' Mitarbeitende · '+candidate.plan.shifts.length+' Schichten · '+candidate.plan.projects.length+' Projekte';button.disabled=!form.elements.confirmed.checked;});
    form.elements.confirmed.onchange=()=>button.disabled=!candidate||!form.elements.confirmed.checked;
    form.onsubmit=action(async event=>{event.preventDefault();if(candidate&&form.elements.confirmed.checked)await team.importPlan(candidate);});
  };
  async function poll(force=false){
    if(saving||scheduled||pollBusy)return;pollBusy=true;
    try{
      const next=await request('/api/bootstrap');offline=false;document.body.classList.remove('team-offline');
      const rightsChanged=!same(next.member,state.member);
      if(force||rightsChanged){apply(next);banner('');}
      else if(next.revision!==state.revision){
        if(gesture||editing||document.querySelector('#modal').open||document.querySelector('#project-focus')?.open)banner('Der Teamplan wurde geändert. Aktualisiere ihn, bevor du weiter bearbeitest.');
        else{apply(next);banner('');toast('Teamplan aktualisiert.');}
      }status();
    }catch(error){if(error.status===401){location.assign('/');return;}offline=true;document.body.classList.add('team-offline');banner(error.message+' Du kannst nach Wiederherstellung der Verbindung aktualisieren.');status();}finally{pollBusy=false;}
  }
  team.init=()=>{
    document.querySelector('#settings-button').insertAdjacentHTML('afterend',`<div id="team-user-wrap" class="menu-wrap"><button id="team-user-toggle" class="icon-button" aria-label="Benutzer und Team" aria-haspopup="menu" aria-expanded="false" aria-controls="team-user-menu">${icon('user')}</button><div id="team-user-menu" class="dropdown team-user-menu" role="menu" hidden><div class="menu-label">${escape(state.member.name)}<small>${escape(state.organization)} · ${admin()?'Admin':'Mitarbeitend'}</small></div><button id="team-account" role="menuitem">${icon('user')}Mein Konto</button><button id="team-management" role="menuitem" ${admin()?'':'hidden'}>${icon('users')}Team & Zugänge</button><button id="team-outbox-menu" role="menuitem" ${admin()&&state.localMail?'':'hidden'}>${icon('info')}Lokaler Postausgang</button><div class="menu-divider"></div><button id="team-history" role="menuitem">${icon('clock')}Änderungsverlauf</button><button id="team-signout" role="menuitem">Abmelden</button></div></div>`);
    document.querySelector('#app').insertAdjacentHTML('beforebegin',`<div id="team-error-banner" class="team-error-banner" role="alert" hidden><span></span><button id="team-reload" class="secondary-button">Aktualisieren</button></div>`);
    document.querySelector('.footer').insertAdjacentHTML('beforeend','<div class="team-plan-meta"><span id="team-week-state" class="team-week-state"></span><span id="team-status" class="team-status" role="status"></span></div>');
    document.querySelector('#menu').insertAdjacentHTML('beforeend',`<div class="menu-divider" ${admin()?'':'hidden'}></div><div class="menu-label" ${admin()?'':'hidden'}>PLANUNGSFREIGABE</div><button id="team-publish" ${admin()?'':'hidden'}>${icon('users')}Woche veröffentlichen</button><button id="team-week-lock" ${admin()?'':'hidden'}>${icon('lock')}Wochenzeiten fixieren</button>`);
    const userMenu=document.querySelector('#team-user-menu'),toggle=document.querySelector('#team-user-toggle');
    const closeUserMenu=(focus=false)=>{userMenu.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();};
    const openUserMenu=()=>{closeMenu();userMenu.hidden=false;toggle.setAttribute('aria-expanded','true');};
    toggle.onclick=()=>userMenu.hidden?openUserMenu():closeUserMenu();
    toggle.onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();openUserMenu();userMenu.querySelector('button:not([hidden])')?.focus();}};
    userMenu.onkeydown=event=>{const buttons=[...userMenu.querySelectorAll('button:not([hidden])')],index=buttons.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeUserMenu(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};
    document.addEventListener('click',event=>{if(!event.target.closest('#team-user-wrap'))closeUserMenu();});
    document.addEventListener('focusin',event=>{if(!event.target.closest('#team-user-wrap'))closeUserMenu();});
    const userAction=fn=>action(async event=>{closeUserMenu();await fn(event);});
    document.querySelector('#team-publish').onclick=()=>{const p=period(dateKey(week));administrative('/api/periods/'+dateKey(week),{expectedRevision:state.revision,published:!p?.published,timesLocked:p?.timesLocked||false});};
    document.querySelector('#team-week-lock').onclick=()=>{const p=period(dateKey(week));administrative('/api/periods/'+dateKey(week),{expectedRevision:state.revision,published:p?.published||false,timesLocked:!p?.timesLocked});};
    document.querySelector('#team-history').onclick=userAction(openAudit);document.querySelector('#team-management').onclick=userAction(openTeam);document.querySelector('#team-account').onclick=()=>{closeUserMenu();account();};document.querySelector('#team-outbox-menu').onclick=userAction(openOutbox);document.querySelector('#team-signout').onclick=userAction(async()=>{await request('/api/auth/sign-out',{});location.assign('/');});document.querySelector('#team-reload').onclick=()=>poll(true);
    const originalModal=openModal;openModal=function(...args){document.querySelector('#modal').classList.remove('team-modal');originalModal(...args);};
    const originalTimeline=renderTimeline;renderTimeline=function(){originalTimeline();decorate();};
    const originalProjects=renderProjects;renderProjects=function(){originalProjects();decorate();};
    const originalSettings=openSettings;openSettings=function(...args){originalSettings(...args);document.querySelector('#modal').classList.remove('team-modal');document.querySelector('[data-settings-tab=updates]').hidden=true;if(!admin()){document.querySelectorAll('[data-settings-tab=breaks],[data-settings-tab=people],[data-settings-tab=presets]').forEach(el=>el.hidden=true);document.querySelectorAll('#settings-panel-breaks input,#settings-panel-breaks button,#settings-panel-people button,#settings-panel-presets button').forEach(el=>el.disabled=true);}};
    const originalOpenProject=editProject;editProject=function(...args){if(!admin()){toast('Projekte kann nur ein Admin bearbeiten.');return;}originalOpenProject(...args);};
    const originalPhase=editProjectPhase;editProjectPhase=function(...args){if(!admin()){toast('Projektphasen kann nur ein Admin bearbeiten.');return;}originalPhase(...args);};
    const originalFocus=openProjectFocus;openProjectFocus=function(...args){if(!admin()){toast('Projektphasen kann nur ein Admin bearbeiten.');return;}originalFocus(...args);};
    document.addEventListener('keydown',event=>{if((saving||offline)&&!event.target.closest('#team-user-wrap,#team-error-banner')){event.preventDefault();event.stopImmediatePropagation();}},true);
    for(const type of ['input','change','submit','pointerdown','dragstart'])document.addEventListener(type,event=>{if((saving||offline)&&!event.target.closest('#team-user-wrap,#team-error-banner')){event.preventDefault();event.stopImmediatePropagation();}},true);
    window.addEventListener('beforeunload',event=>{if(saving||scheduled){event.preventDefault();event.returnValue='';}});
    setInterval(()=>poll(),5000);window.addEventListener('online',()=>poll(true));decorate();
  };
})();
