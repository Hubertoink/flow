const EXCEL_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function weeklyExportSnapshot(includeWeekend=false){
  const start=dateKey(week),end=dateKey(addDays(week,6)),shifts=structuredClone(data.shifts.filter(s=>s.date>=start&&s.date<=end));
  const days=Array.from({length:includeWeekend?7:5},(_,i)=>dateKey(addDays(week,i)));
  const people=structuredClone(data.people.filter(p=>shifts.some(s=>s.person===p.id)||Array.from({length:7},(_,i)=>dateKey(addDays(week,i))).some(date=>activeOn(p,date))))
    .sort((a,b)=>a.name.localeCompare(b.name,'de')||a.id.localeCompare(b.id));
  return {start,end,days,people,shifts,weekNumber:isoWeek(week)};
}

function fillExcel(color){return {type:'pattern',pattern:'solid',fgColor:{argb:color}};}
function excelColor(color){return /^#[0-9a-f]{6}$/i.test(color||'')?'FF'+color.slice(1).toUpperCase():'FFE1E7EF';}
function styleExcelHeader(sheet,rowNumber){
  const row=sheet.getRow(rowNumber);row.height=32;
  row.eachCell(cell=>{cell.fill=fillExcel('FF263449');cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',wrapText:true};});
}
function buildWeeklyWorkbook(snapshot){
  const workbook=new ExcelJS.Workbook();workbook.creator='Flow! JugendPlan';
  const plan=workbook.addWorksheet('Wochenplan',{views:[{state:'frozen',xSplit:1,ySplit:4}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}});
  const headers=['Person',...snapshot.days.flatMap((date,i)=>{const day=weekdays[i]+' '+parseDate(date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});return [day+' von',day+' bis'];}),'Ist-Stunden (Mo–So)','Soll-Stunden'];
  const last=headers.length,actualColumn=last-1;
  plan.columns=headers.map((name,i)=>({width:i===0?24:i>=last-2?20:14}));
  plan.mergeCells(1,1,1,last);plan.getCell('A1').value=`Flow! Wochenplan · KW ${snapshot.weekNumber}`;
  plan.getCell('A1').font={name:'Calibri',size:18,bold:true,color:{argb:'FF263449'}};plan.getRow(1).height=34;
  plan.mergeCells(2,1,2,last);plan.getCell('A2').value=`${parseDate(snapshot.start).toLocaleDateString('de-DE')} – ${parseDate(snapshot.end).toLocaleDateString('de-DE')} · Ist/Soll: gesamte Woche Montag–Sonntag`;
  plan.mergeCells(3,1,3,last);plan.getCell('A3').value='Zeiten sind Excel-Zeitwerte, Stunden Dezimalzahlen. Alle Schichten und Aufgaben stehen unter „Schichtdetails“.';
  plan.getCell('A3').font={name:'Calibri',size:10,color:{argb:'FF64748B'}};
  plan.getRow(4).values=headers;styleExcelHeader(plan,4);
  const details=workbook.addWorksheet('Schichtdetails',{views:[{state:'frozen',ySplit:1}],pageSetup:{orientation:'landscape',paperSize:9}});
  details.columns=[{header:'Person',width:24},{header:'Datum',width:15},{header:'Wochentag',width:18},{header:'Eintrag',width:14},{header:'Von',width:12},{header:'Bis',width:12},{header:'Aufgabe',width:32},{header:'Stunden',width:14}];
  let actualTotal=0,targetTotal=0;
  snapshot.people.forEach((p,index)=>{
    const own=snapshot.shifts.filter(s=>s.person===p.id).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
    const actual=own.reduce((sum,s)=>sum+s.length,0),target=p.weeklyHours??weekHours(p);
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
        const entry=details.addRow([p.name,date,weekdays[(parseDate(s.date).getDay()+6)%7],kind,start/24,(start+length)/24,label,length]);
        entry.getCell(2).numFmt='dd.mm.yyyy';entry.getCell(5).numFmt=entry.getCell(6).numFmt='[hh]:mm';entry.getCell(8).numFmt='0.00';
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
  styleExcelHeader(details,1);details.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,details.rowCount),column:8}};
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
