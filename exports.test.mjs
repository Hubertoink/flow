import {JSDOM} from 'jsdom';
import ExcelJS from 'exceljs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const html=await readFile(path.join('dist','index.html'),'utf8');
const source=(await Promise.all(['icons.js','app.js','canvas.js','exports.js'].map(file=>readFile(path.join('dist',file),'utf8')))).join('\n');
const dom=new JSDOM(html,{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
w.structuredClone=structuredClone;w.Date=Date;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.eval(await readFile(path.join('dist','vendor','exceljs.min.js'),'utf8'));
w.eval(source+'\nwindow.runExportCode=code=>eval(code);');
const q=s=>d.querySelector(s),storage=()=>w.localStorage.getItem('flow-plan-v1');
const monday=w.runExportCode('dateKey(week)'),day=index=>w.runExportCode(`dateKey(addDays(week,${index}))`);
const fixture=JSON.parse(storage());
fixture.people=[
  {...fixture.people[0],id:'zoe',name:'Zoë',weeklyHours:16},
  {...fixture.people[1],id:'anna',name:'Anna',weeklyHours:8},
  {...fixture.people[2],id:'empty',name:'Berta',weeklyHours:7},
  {...fixture.people[3],id:'past',name:'Früher',from:'',until:'2000-01-01'}
];
fixture.shifts=[
  {id:'monday-shift',person:'zoe',date:monday,start:8.25,length:7.75,y:32,segments:[{id:'project',type:'flex',label:'=SUM(A1:A2)',color:'#112233',offset:0,duration:2},{id:'open',type:'open',label:'Jugendtreff',offset:2,duration:5.75}]},
  {id:'friday-shift',person:'zoe',date:day(4),start:17,length:7,y:32,segments:[]},
  {id:'sunday-shift',person:'zoe',date:day(6),start:10,length:2,y:32,segments:[]},
  {id:'anna-one',person:'anna',date:monday,start:9,length:2,y:96,segments:[]},
  {id:'anna-two',person:'anna',date:monday,start:14,length:2,y:160,segments:[]}
];
w.localStorage.setItem('flow-plan-v1',JSON.stringify(fixture));
w.runExportCode(`data=JSON.parse(localStorage.getItem('flow-plan-v1'));refresh();persist();`);
const snapshot=w.runExportCode('weeklyExportSnapshot(false)');
assert.equal(snapshot.days.length,5);assert.deepEqual([...snapshot.people].map(p=>p.name),['Anna','Berta','Zoë']);assert.equal(snapshot.shifts.length,5);
w.runExportCode(`data.shifts[0].segments[0].label='Andere Aufgabe';`);
assert.equal(snapshot.shifts[0].segments[0].label,'=SUM(A1:A2)');
w.runExportCode(`data=JSON.parse(localStorage.getItem('flow-plan-v1'));`);
const workbook=w.buildWeeklyWorkbook(snapshot),bytes=await workbook.xlsx.writeBuffer(),roundtrip=new ExcelJS.Workbook();
assert.equal(workbook.getWorksheet('Wochenplan').getCell('B7').value,8.25/24);
assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);await roundtrip.xlsx.load(Buffer.from(bytes));
const plan=roundtrip.getWorksheet('Wochenplan'),details=roundtrip.getWorksheet('Schichtdetails');
const excelTime=cell=>cell.value instanceof Date?(cell.value.getTime()-Date.UTC(1899,11,30))/86400000:cell.value;
assert.equal(plan.columnCount,13);assert.equal(plan.getCell('A5').value,'Anna');assert.equal(plan.getCell('A6').value,'Berta');assert.equal(plan.getCell('A7').value,'Zoë');
assert.match(plan.getCell('B4').value,/Montag.*von/);assert.match(plan.getCell('K4').value,/Freitag.*bis/);
assert.equal(excelTime(plan.getCell('B7')),8.25/24);assert.equal(excelTime(plan.getCell('C7')),16/24);
assert.equal(excelTime(plan.getCell('K7')),1);assert.equal(plan.getCell('K7').numFmt,'[hh]:mm');
assert.equal(plan.getCell('L7').value,16.75);assert.equal(plan.getCell('M7').value,16);assert.equal(plan.getCell('L5').value,4);assert.equal(plan.getCell('L6').value,0);
assert.equal(plan.getCell('B6').value,null);assert.equal(plan.getCell('B5').value,'09:00\n14:00');assert.equal(plan.getCell('C5').value,'11:00\n16:00');
assert.equal(plan.getCell('L8').value.result,20.75);assert.equal(plan.getCell('M8').value.result,31);assert.match(plan.getCell('L8').value.formula,/SUM/);
assert.equal(plan.autoFilter,'A4:M7');assert.equal(plan.views[0].xSplit,1);assert.equal(plan.views[0].ySplit,4);
assert.notEqual(plan.getCell('L7').fill.fgColor.argb,plan.getCell('M7').fill.fgColor.argb);assert.equal(details.rowCount,8);assert.equal(details.autoFilter,'A1:J8');
assert.equal(details.getCell('G5').value,'=SUM(A1:A2)');assert.equal(details.getCell('G5').type,ExcelJS.ValueType.String);assert.equal(details.getCell('H5').value,2);
assert.equal(details.getCell('B5').value.toISOString().slice(0,10),monday);assert.equal(details.getCell('G5').fill.fgColor.argb,'FF112233');
const full=w.buildWeeklyWorkbook(w.runExportCode('weeklyExportSnapshot(true)'));assert.equal(full.getWorksheet('Wochenplan').columnCount,17);
assert.match(full.getWorksheet('Wochenplan').getCell('N4').value,/Sonntag.*von/);
const empty=w.buildWeeklyWorkbook({...snapshot,people:[],shifts:[]});assert.equal(empty.getWorksheet('Wochenplan').getCell('L5').value,0);

// Net totals aggregate all shifts of a person per day and use snapshot rules.
const pausedSnapshot={...snapshot,breakRules:[{after:4,minutes:30},{after:7,minutes:40}]};
const pausedWorkbook=w.buildWeeklyWorkbook(pausedSnapshot),pausedBytes=await pausedWorkbook.xlsx.writeBuffer(),pausedRoundtrip=new ExcelJS.Workbook();
await pausedRoundtrip.xlsx.load(Buffer.from(pausedBytes));
const pausedPlan=pausedRoundtrip.getWorksheet('Wochenplan'),pausedDetails=pausedRoundtrip.getWorksheet('Schichtdetails');
assert.equal(pausedPlan.getCell('L5').value,3.5);assert.ok(Math.abs(pausedPlan.getCell('L7').value-(16.75-80/60))<1e-9);
assert.equal(pausedPlan.getCell('M7').value,16);assert.equal(pausedDetails.getCell('I2').value,.25);assert.equal(pausedDetails.getCell('I3').value,.25);
assert.equal(pausedDetails.getCell('J2').value,1.75);assert.equal(pausedDetails.getCell('H2').value,2);assert.equal(pausedDetails.getCell('I5').value,null);
w.runExportCode('data.settings.breakRules=[{after:6,minutes:30}];');
const frozenRules=w.runExportCode('weeklyExportSnapshot(false)');
w.runExportCode('data.settings.breakRules[0].minutes=45;');
assert.equal(frozenRules.breakRules[0].minutes,30);
w.runExportCode('delete data.settings.breakRules;');

// Export DOM covers all days and lanes, without changing focus, zoom, storage or live markup.
q('.day-head').click();q('[data-shift="monday-shift"] .shift-edit').click();q('#zoom-in').click();
const live=q('#timeline').innerHTML,state=w.runExportCode('({editing,focusDate,zoom})'),imageBefore=storage();
for(const expanded of [false,true]){
  const root=w.buildCanvasExport(snapshot,expanded);
  assert.equal(root.querySelectorAll('.day-column').length,5);assert.equal(root.querySelectorAll('.shift').length,4);
  assert.equal(root.querySelectorAll('.shift.editing').length,expanded?4:0);
  assert.equal(root.querySelector('.shift-edit,.shift-copy,.task-copy,.resize-handle,.task-resize'),null);assert.equal(root.querySelector('.folded'),null);
  const bars=[...root.querySelectorAll('.day-column:first-child .shift')],tops=bars.map(bar=>parseFloat(bar.style.top));
  assert.ok(tops[1]>=tops[0]+(expanded?164:44));assert.ok(tops[2]>=tops[1]+44);
  assert.match(root.textContent,/Zoë/);assert.equal(root.querySelectorAll('.canvas-export-empty').length,3);
  w.prepareCanvasExport(root,expanded);root.remove();
}
assert.equal(storage(),imageBefore);assert.equal(q('#timeline').innerHTML,live);assert.deepEqual(w.runExportCode('({editing,focusDate,zoom})'),state);

let captured=null,downloads=[];
w.runExportCode('download=(content,type,name)=>window.captureDownload(content,type,name)');
w.captureDownload=(content,type,name)=>downloads.push({content,type,name});
w.htmlToImage={async toBlob(root,options){captured={root,options};return new w.Blob(['png'],{type:'image/png'});}};
Object.defineProperty(w.HTMLElement.prototype,'offsetWidth',{configurable:true,get(){return this.classList.contains('canvas-export')?2848:0;}});
Object.defineProperty(w.HTMLElement.prototype,'offsetHeight',{configurable:true,get(){return this.classList.contains('canvas-export')?700:0;}});
await w.exportCanvasPNG(snapshot,true);assert.equal(captured.options.pixelRatio,2);assert.equal(captured.options.width,2848);assert.equal(captured.options.skipFonts,true);
assert.equal(captured.options.style.insetInline,'auto');assert.equal(captured.options.style.position,'static');
assert.equal(downloads[0].type,'image/png');assert.match(downloads[0].name,/ausgeklappt\.png$/);assert.equal(q('.canvas-export'),null);
w.htmlToImage.toBlob=async()=>{throw new Error('PNG-Testfehler');};await assert.rejects(w.exportCanvasPNG(snapshot,false),/PNG-Testfehler/);assert.equal(q('.canvas-export'),null);
Object.defineProperty(w.HTMLElement.prototype,'offsetHeight',{configurable:true,get(){return 20000;}});
await assert.rejects(w.exportCanvasPNG(snapshot,false),/zu groß/);assert.equal(q('.canvas-export'),null);

q('[data-action="excel"]').click();assert.equal(q('#modal').open,true);assert.equal(q('[name=weekend]').checked,true);
q('[name=weekend]').checked=false;await q('#export-form').onsubmit({preventDefault(){},currentTarget:q('#export-form')});
assert.equal(downloads.at(-1).type,w.EXCEL_TYPE||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.match(downloads.at(-1).name,/\.xlsx$/);assert.equal(q('#modal').open,false);
const downloaded=new ExcelJS.Workbook();await downloaded.xlsx.load(Buffer.from(downloads.at(-1).content));assert.equal(downloaded.getWorksheet('Wochenplan').columnCount,13);
q('[data-action="image"]').click();assert.equal(q('[name=mode]:checked').value,'expanded');const form=q('#export-form'),logs=[];w.console.error=(...args)=>logs.push(args);
await form.onsubmit({preventDefault(){},currentTarget:form});assert.match(q('#export-error').textContent,/zu groß/);assert.equal(q('#modal').open,true);assert.equal(q('#start-export').disabled,false);assert.equal(form.hasAttribute('aria-busy'),false);assert.equal(logs.length,1);
assert.equal(storage(),imageBefore);assert.equal(q('.canvas-export'),null);q('#cancel-export').click();assert.equal(q('#modal').open,false);
// Full-plan transfers include offscreen weeks, templates and settings.
w.runExportCode(`data.settings.breakRules=[{after:6,minutes:30}];data.settings.theme='light';data.settings.zoom=1.25;`);
const transfer=w.planTransfer(),transferText=JSON.stringify(transfer);
assert.equal(transfer.format,'flow-plan');assert.equal(transfer.formatVersion,1);
assert.equal(transfer.plan.shifts.length,fixture.shifts.length);assert.equal(transfer.week,monday);
assert.equal(transfer.plan.settings.breakRules[0].minutes,30);
const validated=w.readPlanTransfer(transferText);
assert.equal(validated.plan.taskTypes.find(t=>t.id==='flex').name,'Flexible Aufgabe');
assert.equal(validated.plan.shifts[0].segments[0].label,'=SUM(A1:A2)');
w.exportPlan();assert.match(downloads.at(-1).name,/Flow-Plan-.*\.json/);
const legacy=w.readPlanTransfer(JSON.stringify(transfer.plan));assert.equal(legacy.plan.version,3);assert.equal(legacy.week,undefined);
const old={version:1,settings:{weekend:false},people:[{id:'old',name:'Alt',color:'#112233',start:8,end:16}],shifts:[{id:'old-shift',person:'old',date:monday,start:8,segments:[{type:'open',duration:8}]}]};
const migrated=w.readPlanTransfer(JSON.stringify(old));assert.equal(migrated.plan.shifts[0].length,8);assert.equal(migrated.plan.people[0].weeklyHours,40);assert.ok(migrated.plan.shifts[0].segments[0].id);
const invalidPlan=change=>{const invalid=structuredClone(transfer);change(invalid);assert.throws(()=>w.readPlanTransfer(JSON.stringify(invalid)),/Ungültiger Plan/);};
invalidPlan(t=>t.formatVersion=2);invalidPlan(t=>t.plan.version=99);
invalidPlan(t=>t.plan.people.push(t.plan.people[0]));
invalidPlan(t=>t.plan.people[0].id='bad" onclick="alert(1)');
invalidPlan(t=>t.plan.people[0].weekdayHours=[8]);
invalidPlan(t=>t.plan.shifts[0].person='missing');
invalidPlan(t=>t.plan.shifts[0].date='2026-02-30');
invalidPlan(t=>t.plan.shifts[0].start=23);
invalidPlan(t=>t.plan.shifts[0].segments[0].duration=100);
invalidPlan(t=>t.plan.shifts[0].segments[1].offset=0);
invalidPlan(t=>t.plan.shifts[0].segments[0].type='missing');
invalidPlan(t=>t.plan.settings.breakRules=[{after:6,minutes:400}]);
invalidPlan(t=>t.plan.settings.breakRules=[{after:6,minutes:30},{after:9,minutes:20}]);
invalidPlan(t=>t.plan.taskTypes=null);
assert.throws(()=>w.readPlanTransfer('{bad'),/gültiges JSON/);
assert.throws(()=>w.readPlanTransfer(' '.repeat(10*1024*1024+1)),/10 MB/);

const importCandidate=structuredClone(transfer);
importCandidate.week=day(7);importCandidate.plan.people[0].name='Übertragene Person <Team>';
importCandidate.plan.settings.theme='catppuccin';importCandidate.plan.settings.weekend=true;
const candidateText=JSON.stringify(importCandidate),planBefore=storage(),weekBefore=w.runExportCode('dateKey(week)');
const chooseImport=async(text,name='Plan.json')=>{
  const input=q('#plan-import-file');
  Object.defineProperty(input,'files',{configurable:true,value:[new w.File([text],name,{type:'application/json'})]});
  await input.onchange();
};
w.openPlanImport();assert.equal(q('#confirm-plan-import').disabled,true);
await chooseImport(candidateText,'<script>Plan.json');assert.equal(q('#plan-import-preview').hidden,false);
assert.equal(q('#plan-import-preview script'),null);assert.equal(q('#plan-import-preview strong').textContent,'<script>Plan.json');
assert.equal(storage(),planBefore);assert.equal(q('#confirm-plan-import').disabled,true);
q('#plan-import-form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(storage(),planBefore);
q('#accept-plan-replacement').click();assert.equal(q('#confirm-plan-import').disabled,false);
const storagePrototype=w.Storage.prototype,originalSetItem=storagePrototype.setItem;
const originalConsoleError=w.console.error;w.console.error=()=>{};
storagePrototype.setItem=function(key,value){if(key==='flow-plan-before-import')throw new Error('Sicherung fehlgeschlagen');return originalSetItem.call(this,key,value);};
q('#plan-import-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.match(q('#plan-import-error').textContent,/Sicherung fehlgeschlagen/);assert.equal(storage(),planBefore);
storagePrototype.setItem=function(key,value){if(key==='flow-plan-v1')throw new Error('Kein Speicherplatz');return originalSetItem.call(this,key,value);};
q('#plan-import-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.match(q('#plan-import-error').textContent,/Kein Speicherplatz/);assert.equal(storage(),planBefore);
assert.equal(w.runExportCode('data.people[0].name'),transfer.plan.people[0].name);
storagePrototype.setItem=originalSetItem;
q('#plan-import-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(q('#modal').open,false);assert.equal(w.runExportCode('dateKey(week)'),importCandidate.week);
assert.equal(w.runExportCode('data.people[0].name'),'Übertragene Person <Team>');
assert.equal(d.documentElement.dataset.theme,'catppuccin');assert.equal(q('#zoom-value').textContent,'125%');
assert.equal(q('#copy-tray').hidden,true);assert.equal(q('.editing'),null);
assert.equal(JSON.parse(storage()).settings.breakRules[0].minutes,30);
const recovery=JSON.parse(w.localStorage.getItem('flow-plan-before-import'));
assert.equal(recovery.plan.people[0].name,transfer.plan.people[0].name);assert.equal(recovery.week,weekBefore);
assert.equal(w.readPlanTransfer(storage()).plan.people[0].name,'Übertragene Person <Team>');
w.openPlanImport();q('#restore-before-import').click();assert.equal(q('#plan-import-file').required,false);
q('#accept-plan-replacement').click();q('#plan-import-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(w.runExportCode('data.people[0].name'),transfer.plan.people[0].name);
assert.equal(w.runExportCode('dateKey(week)'),weekBefore);assert.equal(d.documentElement.dataset.theme,'light');
assert.equal(w.localStorage.getItem('flow-plan-before-import'),JSON.stringify(recovery));
w.openPlanImport();await chooseImport('{broken');assert.equal(q('#confirm-plan-import').disabled,true);assert.match(q('#plan-import-error').textContent,/gültiges JSON/);
q('#restore-before-import').click();q('#accept-plan-replacement').click();await chooseImport(candidateText);
assert.equal(q('#plan-import-file').required,true);assert.equal(q('#confirm-plan-import').textContent,'Plan ersetzen');assert.equal(q('#confirm-plan-import').disabled,true);
q('#modal').close();w.console.error=originalConsoleError;
console.log('PASS: XLSX roundtrip, net hours, PNG modes, full-plan export/import, legacy migration, validation, confirmation, storage failure and recovery.');
w.close();
