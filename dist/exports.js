const EXCEL_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PLAN_IMPORT_LIMIT=10*1024*1024;
const PLAN_RECOVERY_KEY='flow-plan-before-import';

function planTransfer(){
  return {format:'flow-plan',formatVersion:1,exportedAt:new Date().toISOString(),week:dateKey(week),plan:{...structuredClone(data),taskTypes:structuredClone(tasks)}};
}
function exportPlan(){
  download(JSON.stringify(planTransfer(),null,2),'application/json',`Flow-Plan-${todayKey()}.json`);
}
function readPlanTransfer(text){
  if(new Blob([text]).size>PLAN_IMPORT_LIMIT)throw new Error('Die Datei ist größer als 10 MB.');
  let input;
  try{input=JSON.parse(text);}catch{throw new Error('Die Datei enthält kein gültiges JSON. Bitte einen Flow!-Planexport auswählen.');}
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const fail=message=>{throw new Error('Ungültiger Plan: '+message);};
  const number=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
  const string=(value,max)=>typeof value==='string'&&value.length<=max;
  const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(parseDate(value).getTime())&&dateKey(parseDate(value))===value;
  const id=value=>string(value,100)&&/^[A-Za-z0-9_-]+$/.test(value);
  const unique=(values,label)=>{if(new Set(values).size!==values.length)fail(label+' enthalten doppelte IDs.');};
  if(!object(input))fail('Erwartet wird ein JSON-Objekt.');
  let selectedWeek;
  if(input.format!==undefined){
    if(input.format!=='flow-plan'||input.formatVersion!==1)fail('Dieses Dateiformat wird nicht unterstützt. Bitte Flow! aktualisieren.');
    if(!validDate(input.week))fail('Die ausgewählte Woche ist ungültig.');
    selectedWeek=input.week;input=input.plan;
  }
  if(!object(input)||![1,2,3].includes(input.version))fail('Diese Planversion wird nicht unterstützt.');
  if(!Array.isArray(input.people)||!Array.isArray(input.shifts)||input.people.length>1000||input.shifts.length>50000)fail('Mitarbeitende oder Schichten fehlen oder sind zu umfangreich.');
  if(!object(input.settings))fail('Einstellungen fehlen.');
  const settings=input.settings;
  if(settings.background!==undefined&&settings.background!==''&&!backgrounds.some(background=>background.id===settings.background))fail('Der Hintergrund ist unbekannt.');
  if(typeof settings.weekend!=='boolean'||(settings.theme!==undefined&&!themes.includes(settings.theme))||(settings.zoom!==undefined&&!number(settings.zoom,.5,2)))fail('Design, Wochenende oder Zoom sind ungültig.');
  if(settings.breakRules!==undefined&&(!Array.isArray(settings.breakRules)||settings.breakRules.length>100))fail('Pausenregeln sind ungültig.');
  const rules=(settings.breakRules||[]).map(rule=>{
    if(!object(rule)||!number(rule.after,.25,24)||rule.after*4%1!==0||!number(rule.minutes,0,1439)||!Number.isInteger(rule.minutes)||rule.minutes>=rule.after*60)fail('Eine Pausenstufe ist ungültig.');
    return {after:rule.after,minutes:rule.minutes};
  }).sort((a,b)=>a.after-b.after);
  if(rules.some((rule,i)=>i>0&&(rule.after===rules[i-1].after||rule.minutes<rules[i-1].minutes)))fail('Pausengrenzen müssen eindeutig und Pausen aufsteigend sein.');
  const people=input.people.map(p=>{
    if(!object(p)||!id(p.id)||!string(p.name,100)||!p.name.trim()||!color(p.color))fail('Eine Person ist ungültig.');
    const amount=p.hours??(p.end-p.start),schedule=p.weekdayHours??Array.from({length:7},(_,i)=>i<5?amount:0);
    if(!number(amount,0,16)||!Array.isArray(schedule)||schedule.length!==7||schedule.some(h=>!number(h,0,16)||h*4%1!==0))fail('Tagesstunden sind ungültig.');
    const weekly=p.weeklyHours??schedule.reduce((sum,h)=>sum+h,0);
    if((p.from!==undefined&&!string(p.from,10))||(p.until!==undefined&&!string(p.until,10)))fail('Beschäftigungsdaten sind ungültig.');
    const from=p.from||'',until=p.until||'';
    if(!number(weekly,0,112)||(from&&!validDate(from))||(until&&!validDate(until))||(from&&until&&from>until))fail('Sollstunden oder Beschäftigungszeitraum sind ungültig.');
    return {id:p.id,name:p.name,color:p.color,hours:amount,weekdayHours:[...schedule],weeklyHours:weekly,from,until};
  });
  unique(people.map(p=>p.id),'Mitarbeitende');
  const types=input.taskTypes===undefined?structuredClone(defaultTaskTypes):input.taskTypes;
  if(!Array.isArray(types)||types.length>1000)fail('Aufgabenvorlagen sind ungültig.');
  const taskTypes=types.map(t=>{
    if(!object(t)||!id(t.id)||!string(t.name,100)||!t.name.trim()||!color(t.color)||(t.short!==undefined&&!string(t.short,100))||(t.hidden!==undefined&&typeof t.hidden!=='boolean'))fail('Eine Aufgabenvorlage ist ungültig.');
    return {id:t.id,name:t.name,color:t.color,...(t.short!==undefined?{short:t.short}:{}),...(t.hidden!==undefined?{hidden:t.hidden}:{})};
  });
  unique(taskTypes.map(t=>t.id),'Aufgabenvorlagen');
  if(!taskTypes.some(t=>t.id==='flex'))taskTypes.push({id:'flex',name:'Flexible Aufgabe',color:'#b9a5eb'});
  const personIds=new Set(people.map(p=>p.id)),typeIds=new Set(taskTypes.map(t=>t.id)),segmentIds=[],dayRows=new Map();
  const shifts=input.shifts.map(s=>{
    if(!object(s)||!id(s.id)||!personIds.has(s.person)||!validDate(s.date)||!number(s.start,8,24)||!Array.isArray(s.segments)||s.segments.length>1000)fail('Eine Schicht ist ungültig oder verweist auf eine unbekannte Person.');
    const row=dayRows.get(s.date)||0;dayRows.set(s.date,row+1);
    const length=s.length??s.segments.reduce((sum,t)=>sum+Number(t?.duration),0),y=s.y??32+row*64;
    if(!number(length,.25,16)||s.start+length>24+.000001||!number(y,0,1000000))fail('Schichtzeit oder Position ist ungültig.');
    let cursor=0;
    const segments=s.segments.map(t=>{
      if(!object(t)||!typeIds.has(t.type)||(t.label!==undefined&&!string(t.label,1000))||(t.color!==undefined&&!color(t.color)))fail('Eine Aufgabe ist ungültig.');
      const offset=t.offset??cursor,taskId=t.id??uid();cursor=offset+t.duration;
      if(!id(taskId)||!number(offset,0,length)||!number(t.duration,.25,length)||offset+t.duration>length+.000001)fail('Eine Aufgabe liegt außerhalb ihrer Schicht.');
      segmentIds.push(taskId);
      return {id:taskId,type:t.type,label:t.label||'',offset,duration:t.duration,...(t.color?{color:t.color}:{})};
    });
    const sorted=segments.toSorted((a,b)=>a.offset-b.offset);
    if(sorted.some((t,i)=>i>0&&t.offset<sorted[i-1].offset+sorted[i-1].duration-.000001))fail('Aufgaben überlappen sich.');
    return {id:s.id,person:s.person,date:s.date,start:s.start,length,y,segments};
  });
  unique(shifts.map(s=>s.id),'Schichten');unique(segmentIds,'Aufgaben');
  return {week:selectedWeek,plan:{version:3,people,shifts,taskTypes,settings:{weekend:settings.weekend,breakRules:rules,...(settings.theme?{theme:settings.theme}:{}),...(settings.background!==undefined?{background:settings.background}:{}),...(settings.zoom!==undefined?{zoom:settings.zoom}:{})}}};
}
function applyImportedPlan(transfer){
  clearDrop();closePanel();closeWeekInfo();closeMonthPicker();
  data=transfer.plan;tasks.splice(0,tasks.length,...data.taskTypes);
  selected=null;editing=null;focusDate=null;picked=null;copyPicked=false;copiedShift=null;copiedTask=null;
  zoom=Number(data.settings.zoom)||1;week=monday(parseDate(transfer.week||todayKey()));
  applyTheme();applyBackground();renderLegend();refresh();
}
function storeImportedPlan(transfer,backup=true){
  endGesture(true);
  const serialized=JSON.stringify(transfer.plan);
  // Write before changing live state; a failed write must leave the current plan intact.
  if(backup)localStorage.setItem(PLAN_RECOVERY_KEY,JSON.stringify(planTransfer()));
  localStorage.setItem('flow-plan-v1',serialized);
  applyImportedPlan(transfer);
}
function openPlanImport(){
  openModal(`${modalTop('Kompletten Plan importieren')}<form id="plan-import-form"><p class="modal-note">Überträgt alle Wochen, Mitarbeitenden, Aufgabenvorlagen und Einstellungen. Der Plan auf diesem Rechner wird vollständig ersetzt – nicht zusammengeführt. Die Datei wird nur lokal gelesen, nicht hochgeladen.</p><label class="full-field"><span class="field-label">Flow!-Planexport (.json)</span><input id="plan-import-file" type="file" accept=".json,application/json" required></label><div id="plan-import-preview" hidden></div><p id="plan-import-error" class="form-error" role="alert"></p><div class="form-actions"><button type="button" id="save-current-plan" class="secondary-button">Aktuellen Plan exportieren</button><button id="confirm-plan-import" class="primary-button" disabled>Plan ersetzen</button></div></form>${localStorage.getItem(PLAN_RECOVERY_KEY)?'<button type="button" id="restore-before-import" class="secondary-button">Plan vor dem letzten Import wiederherstellen</button>':''}`);
  const form=$('#plan-import-form'),fileInput=$('#plan-import-file'),error=$('#plan-import-error'),preview=$('#plan-import-preview'),button=$('#confirm-plan-import');
  let candidate,readId=0,restoring=false;
  const showError=cause=>{console.error('Flow! Planimport fehlgeschlagen:',cause);error.textContent='Import fehlgeschlagen. '+cause.message;};
  $('#save-current-plan').onclick=exportPlan;
  fileInput.onchange=async()=>{
    const current=++readId;candidate=null;restoring=false;fileInput.required=true;button.textContent='Plan ersetzen';button.disabled=true;preview.hidden=true;error.textContent='';
    const file=fileInput.files[0];if(!file)return;
    try{
      if(file.size>PLAN_IMPORT_LIMIT)throw new Error('Die Datei ist größer als 10 MB.');
      const text=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));reader.readAsText(file);});
      if(current!==readId||!form.isConnected)return;
      candidate=readPlanTransfer(text);
      const {plan}=candidate,dates=plan.shifts.map(s=>s.date).sort();
      const weekCount=new Set(dates.map(date=>dateKey(monday(parseDate(date))))).size;
      preview.innerHTML=`<p><strong>${esc(file.name)}</strong></p><p>${plan.people.length} Mitarbeitende · ${plan.shifts.length} Schichten · ${weekCount} ${weekCount===1?'geplante Woche':'geplante Wochen'}</p><p>${dates.length?`${esc(dates[0])} bis ${esc(dates.at(-1))}`:'Keine Schichten enthalten.'}</p><p class="modal-note">Vor dem Ersetzen wird dein bisheriger Plan automatisch auf diesem Rechner gesichert. Mitarbeitende, Vorlagen, Design und Pausenregeln werden aus der Datei übernommen.</p><label><input type="checkbox" id="accept-plan-replacement"> Ich möchte den gesamten aktuellen Plan ersetzen.</label>`;
      preview.hidden=false;
      preview.querySelector('input').onchange=e=>button.disabled=!e.target.checked;
    }catch(cause){if(current===readId&&form.isConnected)showError(cause);}
  };
  form.onsubmit=e=>{
    e.preventDefault();if(!candidate||!$('#accept-plan-replacement')?.checked)return;
    try{storeImportedPlan(candidate,!restoring);$('#modal').close();toast(restoring?'Plan vor dem Import wiederhergestellt.':'Plan importiert. Die Sicherung findest du unter „Plan importieren“.');}
    catch(cause){showError(cause);}
  };
  $('#restore-before-import')?.addEventListener('click',()=>{
    try{
      candidate=readPlanTransfer(localStorage.getItem(PLAN_RECOVERY_KEY));
      ++readId;restoring=true;fileInput.required=false;error.textContent='';
      preview.innerHTML='<p>Die Sicherung vor dem letzten Import ersetzt deinen aktuellen Plan vollständig.</p><label><input type="checkbox" id="accept-plan-replacement"> Ich möchte die Sicherung wiederherstellen.</label>';
      preview.hidden=false;button.disabled=true;button.textContent='Sicherung wiederherstellen';
      preview.querySelector('input').onchange=e=>button.disabled=!e.target.checked;
    }catch(cause){showError(cause);}
  });
}

function weeklyExportSnapshot(includeWeekend=false){
  const start=dateKey(week),end=dateKey(addDays(week,6)),shifts=structuredClone(data.shifts.filter(s=>s.date>=start&&s.date<=end));
  const days=Array.from({length:includeWeekend?7:5},(_,i)=>dateKey(addDays(week,i)));
  const people=structuredClone(data.people.filter(p=>shifts.some(s=>s.person===p.id)||Array.from({length:7},(_,i)=>dateKey(addDays(week,i))).some(date=>activeOn(p,date))))
    .sort((a,b)=>a.name.localeCompare(b.name,'de')||a.id.localeCompare(b.id));
  return {start,end,days,people,shifts,breakRules:structuredClone(breakRules()),weekNumber:isoWeek(week)};
}

function fillExcel(color){return {type:'pattern',pattern:'solid',fgColor:{argb:color}};}
function excelColor(color){return /^#[0-9a-f]{6}$/i.test(color||'')?'FF'+color.slice(1).toUpperCase():'FFE1E7EF';}
function styleExcelHeader(sheet,rowNumber){
  const row=sheet.getRow(rowNumber);row.height=32;
  row.eachCell(cell=>{cell.fill=fillExcel('FF263449');cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',wrapText:true};});
}
function buildWeeklyWorkbook(snapshot){
  const workbook=new ExcelJS.Workbook();workbook.creator='Flow!';
  const plan=workbook.addWorksheet('Wochenplan',{views:[{state:'frozen',xSplit:1,ySplit:4}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}});
  const headers=['Person',...snapshot.days.flatMap((date,i)=>{const day=weekdays[i]+' '+parseDate(date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});return [day+' von',day+' bis'];}),'Ist netto (Mo–So)','Soll-Stunden netto'];
  const last=headers.length,actualColumn=last-1;
  plan.columns=headers.map((name,i)=>({width:i===0?24:i>=last-2?20:14}));
  plan.mergeCells(1,1,1,last);plan.getCell('A1').value=`Flow! Wochenplan · KW ${snapshot.weekNumber}`;
  plan.getCell('A1').font={name:'Calibri',size:18,bold:true,color:{argb:'FF263449'}};plan.getRow(1).height=34;
  plan.mergeCells(2,1,2,last);plan.getCell('A2').value=`${parseDate(snapshot.start).toLocaleDateString('de-DE')} – ${parseDate(snapshot.end).toLocaleDateString('de-DE')} · Ist/Soll: gesamte Woche Montag–Sonntag`;
  plan.mergeCells(3,1,3,last);plan.getCell('A3').value='Ist = Anwesenheit minus Pause je Person/Tag. Soll = Netto-Arbeitszeit. Schichtdetails: Pausen proportional auf Schichten verteilt; Aufgabenzeiten brutto.';
  plan.getCell('A3').font={name:'Calibri',size:10,color:{argb:'FF64748B'}};
  plan.getRow(4).values=headers;styleExcelHeader(plan,4);
  const details=workbook.addWorksheet('Schichtdetails',{views:[{state:'frozen',ySplit:1}],pageSetup:{orientation:'landscape',paperSize:9}});
  details.columns=[{header:'Person',width:24},{header:'Datum',width:15},{header:'Wochentag',width:18},{header:'Eintrag',width:14},{header:'Von',width:12},{header:'Bis',width:12},{header:'Aufgabe',width:32},{header:'Anwesenheit / Aufgabe (h)',width:24},{header:'Pausenanteil (h)',width:20},{header:'Ist netto (h)',width:18}];
  let actualTotal=0,targetTotal=0;
  snapshot.people.forEach((p,index)=>{
    const own=snapshot.shifts.filter(s=>s.person===p.id).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
    const actual=workTotals(own,snapshot.breakRules||[]).net,target=p.weeklyHours??weekHours(p);
    actualTotal+=actual;targetTotal+=target;
    const row=plan.addRow([p.name,...snapshot.days.flatMap(date=>{
      const entries=own.filter(s=>s.date===date);
      if(!entries.length)return [null,null];
      if(entries.length===1)return [entries[0].start/24,(entries[0].start+entries[0].length)/24];
      return [entries.map(s=>fmtTime(s.start)).join('\n'),entries.map(s=>fmtTime(s.start+s.length)).join('\n')];
    }),actual,target]);
    row.height=Math.max(30,...snapshot.days.map(date=>own.filter(s=>s.date===date).length*16+12));
    row.eachCell({includeEmpty:true},(cell,column)=>{
      cell.font={name:'Calibri',size:11,color:{argb:'FF263449'}};
      cell.alignment={vertical:'middle',horizontal:column===1?'left':'center',wrapText:true};
      cell.fill=fillExcel(index%2?'FFF3F6FA':'FFFFFFFF');
      cell.border={bottom:{style:'hair',color:{argb:'FFDCE3ED'}}};
      if(column>1&&column<actualColumn){cell.numFmt='[hh]:mm';if(Math.floor((column-2)/2)%2===0)cell.fill=fillExcel(index%2?'FFE5EDF8':'FFEEF4FC');}
      if(column>=actualColumn)cell.numFmt='0.00" h"';
    });
    row.getCell(1).fill=fillExcel(excelColor(p.color));row.getCell(1).font={name:'Calibri',size:11,bold:true,color:{argb:excelColor(taskInk({color:p.color,type:'flex'}))}};
    row.getCell(actualColumn).fill=fillExcel(actual<target-.001?'FFFFE9CC':actual>target+.001?'FFFADDE2':'FFDDF0E5');
    row.getCell(last).fill=fillExcel('FFEAE3F6');
    own.forEach(s=>{
      const date=new Date(Date.UTC(...s.date.split('-').map((n,i)=>Number(n)-(i===1?1:0))));
      const add=(kind,start,length,label,color)=>{
        const work=kind==='Schicht'?shiftWork(s,snapshot.shifts,snapshot.breakRules||[]):null;
        const entry=details.addRow([p.name,date,weekdays[(parseDate(s.date).getDay()+6)%7],kind,start/24,(start+length)/24,label,length,work?.pause??null,work?.net??null]);
        entry.getCell(2).numFmt='dd.mm.yyyy';entry.getCell(5).numFmt=entry.getCell(6).numFmt='[hh]:mm';[8,9,10].forEach(column=>entry.getCell(column).numFmt='0.00');
        entry.eachCell(cell=>{cell.font={name:'Calibri',size:11,color:{argb:'FF263449'}};cell.alignment={vertical:'middle',wrapText:true};});
        entry.getCell(7).fill=fillExcel(excelColor(color));entry.getCell(7).font.color={argb:excelColor(taskInk({color,type:'flex'}))};
      };
      add('Schicht',s.start,s.length,'Gesamtschicht',p.color);
      s.segments.toSorted((a,b)=>a.offset-b.offset).forEach(t=>add('Aufgabe',s.start+t.offset,t.duration,t.label||task(t.type).name,taskColor(t)));
    });
  });
  plan.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,plan.rowCount),column:last}};
  const total=plan.addRow(['Gesamt',...Array(last-3).fill(null),actualTotal,targetTotal]);
  total.height=30;total.eachCell({includeEmpty:true},cell=>{cell.fill=fillExcel('FF263449');cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle'};});
  [actualColumn,last].forEach((column,i)=>{total.getCell(column).value=snapshot.people.length?{formula:`SUM(${plan.getColumn(column).letter}5:${plan.getColumn(column).letter}${total.number-1})`,result:i?targetTotal:actualTotal}:0;total.getCell(column).numFmt='0.00" h"';});
  plan.pageSetup.printTitlesRow='1:4';plan.pageSetup.printArea=`A1:${plan.getColumn(last).letter}${total.number}`;
  styleExcelHeader(details,1);details.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,details.rowCount),column:10}};
  return workbook;
}

function buildCanvasExport(snapshot,expanded){
  const root=document.createElement('section');root.className='canvas-export';root.setAttribute('aria-hidden','true');
  root.style.width=(snapshot.days.length*560+48)+'px';
  root.innerHTML=`<header class="canvas-export-title"><img src="assets/Flow!_Logo.png" alt="" width="44" height="44"><strong>Flow! · KW ${snapshot.weekNumber}</strong><span>${esc(parseDate(snapshot.start).toLocaleDateString('de-DE'))} – ${esc(parseDate(snapshot.end).toLocaleDateString('de-DE'))} · ${expanded?'Teilschichten ausgeklappt':'Kompakte Schichten'}</span></header><div class="timeline export-timeline"></div>`;
  const grid=root.querySelector('.timeline');grid.style.gridTemplateColumns=`repeat(${snapshot.days.length},minmax(0,1fr))`;grid.style.setProperty('--days',snapshot.days.length);
  snapshot.days.forEach((date,i)=>{
    const column=document.createElement('section');column.className='day-column';
    column.innerHTML=`<div class="day-head"><div class="day-title"><span class="day-name">${weekdays[i]}</span><span class="day-date">${esc(parseDate(date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}))}</span></div><div class="hours">${[8,10,12,14,16,18,20,22,24].map(hour=>`<span>${String(hour).padStart(2,'0')}</span>`).join('')}</div></div><div class="day-cell"></div>`;
    const cell=column.querySelector('.day-cell'),shifts=snapshot.shifts.filter(s=>s.date===date).toSorted((a,b)=>a.y-b.y||a.start-b.start);
    let bottom=32;
    shifts.forEach(s=>{
      const holder=document.createElement('div');holder.innerHTML=shiftMarkup(s);const bar=holder.firstElementChild;
      const y=Math.max(s.y,bottom),extra=expanded&&s.segments.length?12+s.segments.length*48:0;
      bar.classList.toggle('editing',expanded);bar.style.top=y+'px';bar.querySelectorAll('.shift-edit,.shift-copy,.task-copy,.resize-handle,.task-resize').forEach(el=>el.remove());
      bar.removeAttribute('tabindex');bar.querySelectorAll('button').forEach(el=>el.tabIndex=-1);
      cell.append(bar);bottom=y+44+extra+24;
    });
    cell.style.minHeight=Math.max(300,bottom)+'px';if(!shifts.length)cell.innerHTML='<p class="canvas-export-empty">Keine Schichten</p>';
    grid.append(column);
  });
  root.insertAdjacentHTML('beforeend','<footer class="canvas-export-note">Zeitskala 08:00–24:00 · Farben entsprechen dem Wochenplan</footer>');
  document.body.append(root);
  return root;
}
function prepareCanvasExport(root,expanded){
  root.querySelectorAll('.shift').forEach(bar=>{
    if(!expanded){bar.style.color=bar.style.getPropertyValue('--meta-ink');return;}
    bar.querySelectorAll('.segment').forEach(el=>{
      const label=el.querySelector('.task-outside'),rect=el.getBoundingClientRect(),cell=el.closest('.day-cell').getBoundingClientRect();
      const left=rect.left-cell.left-14,right=cell.right-rect.right-14,outside=rect.width<label.scrollWidth+22&&Math.max(left,right)>80;
      el.classList.toggle('outside-label',outside);label.classList.toggle('on-left',left>right);label.style.maxWidth=Math.max(80,Math.max(left,right))+'px';
    });
  });
}
async function exportCanvasPNG(snapshot,expanded){
  const root=buildCanvasExport(snapshot,expanded);
  try{
    if(document.fonts)await document.fonts.ready;
    prepareCanvasExport(root,expanded);
    const width=root.offsetWidth,height=root.offsetHeight,pixelRatio=2;
    if(width*pixelRatio>16384||height*pixelRatio>16384||width*height*pixelRatio**2>64000000)throw new Error('Der Plan ist für ein einzelnes Bild zu groß. Bitte kompakt oder ohne Wochenende exportieren.');
    const blob=await htmlToImage.toBlob(root,{width,height,pixelRatio,backgroundColor:'#151d29',skipFonts:true,style:{position:'static',inset:'auto',insetInline:'auto',insetBlock:'auto'}});
    if(!blob||!blob.size)throw new Error('Das Canvas-Bild konnte nicht erzeugt werden.');
    download(blob,'image/png',`Flow-${snapshot.start}-${expanded?'ausgeklappt':'kompakt'}.png`);
  }finally{root.remove();}
}

function openExport(kind){
  const isExcel=kind==='excel',hasWeekend=data.settings.weekend||data.shifts.some(s=>s.date>=dateKey(addDays(week,5))&&s.date<=dateKey(addDays(week,6)));
  openModal(`${modalTop(isExcel?'Excel-Wochenplan exportieren':'Canvas als Bild exportieren')}<form id="export-form"><p class="modal-note">${isExcel?'Eine Zeile pro Person, Tageszeiten links und Ist-/Sollstunden rechts. Die Stunden summieren immer Montag bis Sonntag. Ein zweites Blatt enthält die sortierbaren Schicht- und Aufgabendetails.':'Exportiert den gesamten Wochen-Canvas, auch außerhalb des sichtbaren Ausschnitts. Alle Tage werden gleich breit dargestellt; der Live-Plan bleibt unverändert.'}</p>${isExcel?'':`<fieldset class="export-modes"><legend>Darstellung der Schichten</legend><label><input type="radio" name="mode" value="expanded" checked><span><strong>Alle ausgeklappt</strong><small>Jede Teilschicht in einer eigenen Zeile</small></span></label><label><input type="radio" name="mode" value="compact"><span><strong>Alle eingeklappt</strong><small>Kompakte Personenschichten mit Aufgabenfarben</small></span></label></fieldset>`}<label class="export-weekend"><input type="checkbox" name="weekend" ${hasWeekend?'checked':''}><span>Samstag und Sonntag mit anzeigen</span></label><p id="export-error" class="form-error" role="alert"></p><div class="form-actions"><button type="button" id="cancel-export" class="secondary-button">Abbrechen</button><button id="start-export" class="primary-button">${isExcel?'Excel herunterladen':'PNG herunterladen'}</button></div></form>`);
  $('#cancel-export').onclick=()=>$('#modal').close();
  $('#export-form').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('#start-export');if(button.disabled)return;
    const snapshot=weeklyExportSnapshot(form.querySelector('[name=weekend]').checked),expanded=form.querySelector('[name=mode]:checked')?.value==='expanded',error=form.querySelector('#export-error');
    error.textContent='';button.disabled=true;button.textContent='Export wird erstellt …';form.setAttribute('aria-busy','true');
    try{
      if(isExcel){const buffer=await buildWeeklyWorkbook(snapshot).xlsx.writeBuffer();download(buffer,EXCEL_TYPE,`Flow-${snapshot.start}.xlsx`);}
      else await exportCanvasPNG(snapshot,expanded);
      if(form.isConnected)$('#modal').close();toast(isExcel?'Excel-Wochenplan erstellt.':'Canvas-Bild erstellt.');
    }catch(cause){console.error('Flow! Export fehlgeschlagen:',cause);const message='Export fehlgeschlagen. '+(cause instanceof Error?cause.message:'Bitte erneut versuchen.');if(form.isConnected)error.textContent=message;else toast(message);}
    finally{button.disabled=false;button.textContent=isExcel?'Excel herunterladen':'PNG herunterladen';form.removeAttribute('aria-busy');}
  };
}
