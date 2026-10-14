import {z} from 'zod';

export class FlowError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
export const fail=(status,message)=>{throw new FlowError(status,message);};
export const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value);
const optionalDate=z.union([date,z.literal('')]).default('');
const color=z.string().regex(/^#[0-9a-f]{6}$/i);
const quarter=z.number().min(0).max(24).refine(n=>Math.abs(n*4-Math.round(n*4))<.00001);
const minute=z.number().min(0).max(24).refine(n=>Math.abs(n*60-Math.round(n*60))<.00001);
const person=z.object({id,name:z.string().trim().min(1).max(80),color,start:minute.default(8),end:minute.default(16),hours:z.number().min(0).max(16).default(8),weekdayHours:z.array(z.number().min(0).max(16)).length(7).default([8,8,8,8,8,0,0]),weeklyHours:z.number().min(0).max(112).default(40),from:optionalDate,until:optionalDate}).strict();
const segment=z.object({id,type:id,label:z.string().max(100).default(''),offset:minute,duration:minute.refine(n=>n>=.25),color:color.optional(),activityId:id.optional(),locked:z.boolean().default(false)}).strict();
const shift=z.object({id,person:id,date,start:minute,length:minute.refine(n=>n>=.25),y:z.number().min(0).max(1000000).default(32),segments:z.array(segment).max(96),lock:z.enum(['open','times','all']).default('open')}).strict();
const activity=z.object({id,date,type:id,label:z.string().trim().min(1).max(100),color,start:minute,end:minute,explicit:z.boolean()}).strict();
const phase=z.object({id,name:z.string().trim().min(1).max(80),start:date,end:date,notes:z.string().max(2000).default(''),people:z.array(id).max(1000).default([])}).strict();
const project=z.object({id,name:z.string().trim().min(1).max(80),start:date,end:date,color,notes:z.string().max(2000).default(''),phases:z.array(phase).min(1).max(500)}).strict();
const template=z.object({id,name:z.string().trim().min(1).max(80),short:z.string().max(80).optional(),color,hidden:z.boolean().optional()}).strict();
export const settingsSchema=z.object({breakRules:z.array(z.object({after:quarter.refine(n=>n>=.25),minutes:z.number().int().min(0).max(1439)}).strict().refine(r=>r.minutes<r.after*60)).max(100).default([])}).strict();
export const entitySchemas={people:person,shifts:shift,activities:activity,projects:project,taskTypes:template};
export const collections=Object.keys(entitySchemas);
export const defaultTemplates=[['prep','Vorbereitung','#c482b9'],['admin','Admin','#dba8c4'],['open','Offener Bereich','#c5cdd7'],['project','Projekte','#85b9e2'],['homework','Hausaufgabenhilfe','#e6b078'],['holiday','Ferienprogramm','#ad95df'],['planning','Planung','#8cbea7'],['flex','Flexible Aufgabe','#b9a5eb']].map(([id,name,color])=>({id,name,color}));
export const emptyPlan=()=>({version:3,people:[],shifts:[],activities:[],projects:[],taskTypes:structuredClone(defaultTemplates),settings:{breakRules:[]}});
export function parse(schema,value){const result=schema.safeParse(value);if(!result.success)fail(400,'Ungültige Angaben: '+result.error.issues.slice(0,3).map(i=>i.path.join('.')+' '+i.message).join('; '));return result.data;}
export const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
export const berlinToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function mondayKey(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
export function validatePlan(plan,{previous=null}={}){
  const maps=Object.fromEntries(collections.map(c=>[c,new Map(plan[c].map(e=>[e.id,e]))]));
  for(const c of collections)if(maps[c].size!==plan[c].length)fail(400,'Doppelte IDs im Plan.');
  const segmentIds=new Set(),personDays=new Set();
  for(const p of plan.people)if(p.from&&p.until&&p.from>p.until)fail(400,'Ungültiger Mitarbeitendenzeitraum.');
  for(const a of plan.activities)if(!maps.taskTypes.has(a.type)||a.start<8||a.end>24||a.end-a.start<.25)fail(400,'Ungültige Tagesaufgabe.');
  for(const s of plan.shifts){
    const p=maps.people.get(s.person);
    if(!p||s.start<8||s.start+s.length>24.00001)fail(400,'Schicht liegt außerhalb des gültigen Zeitrahmens.');
    if((p.from&&s.date<p.from||p.until&&s.date>p.until)&&!previous?.shifts.some(old=>old.id===s.id&&old.person===s.person&&old.date===s.date&&old.start===s.start&&old.length===s.length))fail(400,'Diese Person ist an diesem Tag nicht im Team.');
    const key=s.person+'|'+s.date;if(personDays.has(key))fail(400,'Eine Person ist an diesem Tag bereits eingeplant.');personDays.add(key);
    let end=0;
    for(const t of [...s.segments].sort((a,b)=>a.offset-b.offset)){
      if(segmentIds.has(t.id)||!maps.taskTypes.has(t.type)||t.offset<end-.00001||t.offset+t.duration>s.length+.00001)fail(400,'Ungültige oder überlappende Aufgabenzuordnung.');
      segmentIds.add(t.id);end=t.offset+t.duration;
      const a=maps.activities.get(t.activityId);
      if(!a||a.date!==s.date||a.type!==t.type)fail(400,'Aufgabenzuordnung verweist auf keine passende Tagesaufgabe.');
    }
  }
  for(const p of plan.projects){
    if(p.start>p.end||p.phases[0].start!==p.start||p.phases.at(-1).end!==p.end)fail(400,'Ungültiger Projektzeitraum.');
    const seen=new Set();
    p.phases.forEach((phase,i)=>{const previous=p.phases[i-1];const next=previous?new Date(previous.end+'T12:00:00Z'):null;if(next)next.setUTCDate(next.getUTCDate()+1);
      if(seen.has(phase.id)||phase.start>phase.end||phase.start<p.start||phase.end>p.end||next&&next.toISOString().slice(0,10)!==phase.start||phase.people.some(person=>!maps.people.has(person)))fail(400,'Ungültige Projektphase.');seen.add(phase.id);
    });
  }
  let last=-1,pause=-1;
  for(const rule of [...plan.settings.breakRules].sort((a,b)=>a.after-b.after)){if(rule.after===last||rule.minutes<pause)fail(400,'Pausenregeln müssen eindeutige Grenzen und aufsteigende Pausen haben.');last=rule.after;pause=rule.minutes;}
}
