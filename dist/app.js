const icon=name=>lucideIcons[name]||lucideIcons.plus;
function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(e=>{e.insertAdjacentHTML('afterbegin',icon(e.dataset.icon));e.removeAttribute('data-icon')})}
const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tasks=[{id:'prep',name:'Vorbereitung',short:'Vorbereitung',color:'#c482b9'},{id:'admin',name:'Admin',short:'Admin',color:'#dba8c4'},{id:'open',name:'Offener Bereich',short:'Offener Bereich',color:'#c5cdd7'},{id:'project',name:'Projekte',short:'Medienwerkstatt',color:'#85b9e2'},{id:'homework',name:'Hausaufgabenhilfe',short:'Hausaufgabenhilfe',color:'#e6b078'},{id:'holiday',name:'Ferienprogramm',short:'Ferienprogramm',color:'#ad95df'},{id:'planning',name:'Planung',short:'Planung',color:'#8cbea7'}];
const task=id=>tasks.find(t=>t.id===id)||tasks[2];
const initialPeople=[{id:'kayla',name:'Kayla',start:8,end:16,color:'#c482b9'},{id:'niko',name:'Niko',start:10,end:18,color:'#85b9e2'},{id:'lea',name:'Lea',start:13,end:20,color:'#8cbea7'},{id:'sam',name:'Sam',start:9,end:15,color:'#e6b078'}];
const todayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const parseDate=s=>new Date(s+'T12:00:00');
const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays=(d,n)=>{const v=new Date(d);v.setDate(v.getDate()+n);return v};
const monday=d=>addDays(d,-((d.getDay()+6)%7));
const uid=()=>crypto.randomUUID();
const fmtTime=n=>`${String(Math.floor(n)).padStart(2,'0')}:${String(Math.round((n%1)*60)).padStart(2,'0')}`;
const hours=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n)+' h';
const toHour=s=>{if(!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/.test(s))return NaN;const [h,m]=s.split(':').map(Number);return h+m/60};
function seed(){const base=monday(parseDate(todayKey()));const shifts=[];const put=(p,d,start,segments)=>shifts.push({id:uid(),person:p,date:dateKey(addDays(base,d)),start,segments:segments.map(([type,duration,label])=>({type,duration,label:label||''}))});put('kayla',0,8,[['prep',2],['admin',1],['open',5]]);put('kayla',1,8,[['prep',2],['open',6]]);put('kayla',2,10,[['holiday',6,'Mädchentreff']]);put('kayla',3,8,[['admin',3],['open',5]]);put('kayla',4,10,[['planning',2,'Team-Meeting'],['open',4]]);put('niko',0,10,[['project',6],['admin',2]]);put('niko',1,10,[['project',4],['open',4]]);put('niko',2,10,[['project',8]]);put('niko',3,10,[['prep',2],['project',6]]);put('niko',4,10,[['planning',2,'Team-Meeting'],['project',4]]);put('lea',0,13,[['planning',3],['open',4]]);put('lea',1,13,[['homework',3],['open',4]]);put('lea',2,10,[['open',8]]);put('lea',3,13,[['planning',3,'Jugendforum'],['open',4]]);put('lea',4,10,[['planning',2,'Team-Meeting'],['open',4]]);put('sam',0,9,[['homework',5],['admin',1]]);put('sam',1,9,[['admin',2],['open',4]]);put('sam',3,9,[['holiday',6]]);put('sam',4,10,[['planning',2,'Team-Meeting'],['homework',3]]);return {version:1,people:initialPeople,shifts,settings:{weekend:false}}}
