import {z} from 'zod';
import {id,date,berlinToday,mondayKey,equal,fail} from './model.mjs';

export const actions=['create','update','delete','tasks'];
const actionSchema=z.object({create:z.boolean().default(false),update:z.boolean().default(false),delete:z.boolean().default(false),tasks:z.boolean().default(false)}).strict();
export const permissionsSchema=z.object({self:actionSchema.default({create:true,update:true,delete:true,tasks:true}),delegates:z.array(actionSchema.extend({personId:id,until:z.union([date,z.literal('')]).default('')})).max(1000).default([]),manageActivities:z.boolean().default(false),viewScope:z.enum(['team','self','delegated']).default('team'),viewDrafts:z.boolean().default(true)}).strict();
export const defaultPermissions=()=>permissionsSchema.parse({});
export function can(member,action,person){
  if(member.role==='admin')return true;
  if(person===member.personId&&member.permissions.self[action])return true;
  return member.permissions.delegates.some(d=>d.personId===person&&(!d.until||d.until>=berlinToday())&&d[action]);
}
export function canViewPerson(member,person){return member.role==='admin'||member.permissions.viewScope==='team'||person===member.personId||member.permissions.viewScope==='delegated'&&member.permissions.delegates.some(d=>d.personId===person&&(!d.until||d.until>=berlinToday()));}
export function canViewDate(member,day,periods){return member.role==='admin'||member.permissions.viewDrafts||periods.some(p=>p.week===mondayKey(day)&&p.published);}
export function periodFor(day,periods){return periods.find(p=>p.week===mondayKey(day));}
export function timeReason(member,s,periods,action='update'){
  if(!canViewDate(member,s.date,periods))return 'Diese Woche ist noch nicht veröffentlicht.';
  if(!can(member,action,s.person))return 'Du darfst die Arbeitszeiten dieser Person nicht planen.';
  if(s.lock!=='open')return 'Die Arbeitszeiten dieser Schicht sind fixiert. Ein Admin muss die Sperre aufheben.';
  if(periodFor(s.date,periods)?.timesLocked)return 'Die Arbeitszeitplanung dieser Woche ist gesperrt.';
  return '';
}
export function taskReason(member,s,periods){
  if(!canViewDate(member,s.date,periods))return 'Diese Woche ist noch nicht veröffentlicht.';
  if(!can(member,'tasks',s.person))return 'Du darfst die Aufgaben dieser Person nicht zuordnen.';
  if(s.lock==='all')return 'Die Aufgaben dieser Schicht sind fixiert.';
  return '';
}
const without=(o,...keys)=>Object.fromEntries(Object.entries(o).filter(([k])=>!keys.includes(k)));
function demand(reason){if(reason)fail(403,reason);}
export function authorizeChanges(member,before,after,changes,periods){
  for(const {collection,id:entityId} of changes){
    if(collection==='settings'){if(member.role!=='admin')fail(403,'Pausenregeln kann nur ein Admin ändern.');continue;}
    const old=before[collection]?.find(e=>e.id===entityId),next=after[collection]?.find(e=>e.id===entityId);
    if(['people','projects','taskTypes'].includes(collection)){if(member.role!=='admin')fail(403,'Mitarbeitende, Projekte und Vorlagen kann nur ein Admin verwalten.');continue;}
    if(collection==='activities'){
      // Derived activities are computed on the server from permitted assignments.
      if(old&&!old.explicit&&next&&!next.explicit&&equal(without(old,'start','end'),without(next,'start','end')))continue;
      if(!old&&next&&!next.explicit||old&&!old.explicit&&!next)continue;
      const metadataChanged=!old||!next||!equal(without(old,'start','end'),without(next,'start','end'));
      const usedBefore=before.shifts.some(s=>s.segments.some(t=>t.activityId===entityId));
      const usedAfter=after.shifts.some(s=>s.segments.some(t=>t.activityId===entityId));
      // Marking an existing task explicit is part of a personal assignment, not a global edit.
      const promoted=old&&next&&!old.explicit&&next.explicit&&equal(without(old,'explicit','start','end'),without(next,'explicit','start','end'))&&usedAfter;
      if(member.role!=='admin'&&!member.permissions.manageActivities&&!promoted&&(metadataChanged||!usedBefore&&!usedAfter&&!equal(old,next)))fail(403,'Gemeinsame Tagesaufgaben darfst du nicht bearbeiten.');
      if(old&&(!next||!equal(without(old,'start','end','explicit'),without(next,'start','end','explicit'))))for(const s of before.shifts){for(const t of s.segments.filter(t=>t.activityId===entityId)){demand(taskReason(member,s,periods));if(t.locked)fail(403,'Diese Tagesaufgabe enthält verbindliche Zuordnungen.');}}
      if(old&&next&&old.date!==next.date&&member.role!=='admin'&&!member.permissions.manageActivities)fail(403,'Gemeinsame Tagesaufgaben darfst du nicht verschieben.');
      for(const a of [old,next].filter(Boolean))if(!canViewDate(member,a.date,periods))fail(403,'Diese Woche ist noch nicht veröffentlicht.');
      continue;
    }
    if(collection!=='shifts')fail(400,'Unbekannte Planungsaktion.');
    if(!old){
      if(next.lock!=='open'||next.segments.some(t=>t.locked))fail(403,'Kopien und neue Schichten starten ohne Sperren.');
      demand(timeReason(member,next,periods,'create'));
      if(next.segments.length)demand(taskReason(member,next,periods));
      continue;
    }
    if(!next){demand(timeReason(member,old,periods,'delete'));if(old.segments.length){demand(taskReason(member,old,periods));if(old.segments.some(t=>t.locked))fail(403,'Diese Schicht enthält verbindliche Aufgaben.');}continue;}
    if(old.lock!==next.lock)fail(403,'Sperren müssen ausdrücklich über die Sperrverwaltung geändert werden.');
    const timeChanged=!equal(without(old,'segments','y','lock'),without(next,'segments','y','lock'));
    if(timeChanged){demand(timeReason(member,old,periods));demand(timeReason(member,next,periods));}
    const oldTasks=new Map(old.segments.map(t=>[t.id,t])),newTasks=new Map(next.segments.map(t=>[t.id,t]));
    const changed=[...new Set([...oldTasks.keys(),...newTasks.keys()])].filter(key=>!equal(oldTasks.get(key),newTasks.get(key)));
    if(changed.length){
      demand(taskReason(member,old,periods));demand(taskReason(member,next,periods));
      for(const key of changed){const a=oldTasks.get(key),b=newTasks.get(key);if(a?.locked||b?.locked)fail(403,'Eine verbindliche Aufgabenzuordnung muss zuerst entsperrt werden.');}
    }
    // Moving a shift moves its tasks even when offsets are unchanged.
    if(timeChanged&&old.segments.some(t=>t.locked)&&(!equal(old.date,next.date)||old.start!==next.start||old.person!==next.person))fail(403,'Diese Schicht enthält verbindliche Aufgaben.');
  }
}
export function visiblePlan(plan,member,periods){
  const visibleDate=day=>canViewDate(member,day,periods);
  const visiblePerson=person=>canViewPerson(member,person);
  const result=structuredClone(plan);
  result.people=result.people.filter(p=>visiblePerson(p.id));
  result.shifts=result.shifts.filter(s=>visiblePerson(s.person)&&visibleDate(s.date));
  const used=new Set(result.shifts.flatMap(s=>s.segments.map(t=>t.activityId)));
  result.activities=result.activities.filter(a=>visibleDate(a.date)&&(member.role==='admin'||member.permissions.viewScope==='team'||used.has(a.id)));
  result.projects=result.projects.map(p=>({...p,phases:p.phases.map(phase=>({...phase,people:phase.people.filter(visiblePerson)}))}));
  return result;
}
