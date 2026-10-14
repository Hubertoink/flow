import {z} from 'zod';
import {collections,entitySchemas,settingsSchema,parse,equal,validatePlan,fail,id} from './model.mjs';
import {authorizeChanges} from './policy.mjs';
import {loadPlan,getPeriods,getMember,workspace,writeChanges,bump,audit} from './database.mjs';

const changeSchema=z.object({collection:z.enum([...collections,'settings']),id,before:z.unknown(),after:z.unknown()}).strict();
export const commandSchema=z.object({expectedRevision:z.number().int().nonnegative(),changes:z.array(changeSchema).min(1).max(10000)}).strict();
export function diffPlan(before,after){
  const changes=[];
  for(const collection of collections){const a=new Map(before[collection].map(e=>[e.id,e])),b=new Map(after[collection].map(e=>[e.id,e]));for(const id of new Set([...a.keys(),...b.keys()]))if(!equal(a.get(id),b.get(id)))changes.push({collection,id,before:a.get(id)||null,after:b.get(id)||null});}
  if(!equal(before.settings,after.settings))changes.push({collection:'settings',id:'settings',before:before.settings,after:after.settings});return changes;
}
function derivedActivities(plan){
  const used=new Map();
  for(const s of plan.shifts)for(const t of s.segments){const range=used.get(t.activityId)||{start:24,end:0};range.start=Math.min(range.start,s.start+t.offset);range.end=Math.max(range.end,s.start+t.offset+t.duration);used.set(t.activityId,range);}
  plan.activities=plan.activities.filter(a=>a.explicit||used.has(a.id)).map(a=>used.has(a.id)?{...a,...used.get(a.id)}:a);
}
export async function applyCommands(db,userId,input,{undoId=null}={}){
  const command=parse(commandSchema,input),member=await getMember(db,userId),ws=await workspace(db);
  if(Number(ws.revision)!==command.expectedRevision)fail(409,'Der Plan wurde inzwischen geändert. Aktualisiere ihn und führe die Änderung erneut aus.');
  const before=await loadPlan(db),after=structuredClone(before),seen=new Set();
  for(const change of command.changes){
    const key=change.collection+'|'+change.id;if(seen.has(key))fail(400,'Doppelte Änderung.');seen.add(key);
    const old=change.collection==='settings'?before.settings:before[change.collection].find(e=>e.id===change.id)||null;
    if(!equal(old,change.before))fail(409,'Die betroffenen Daten haben sich inzwischen geändert.');
    const next=change.after===null?null:parse(change.collection==='settings'?settingsSchema:entitySchemas[change.collection],change.after);
    if(change.collection==='settings'){if(!next)fail(400,'Einstellungen dürfen nicht gelöscht werden.');after.settings=next;}
    else{if(next&&next.id!==change.id)fail(400,'ID und Datensatz passen nicht zusammen.');after[change.collection]=after[change.collection].filter(e=>e.id!==change.id);if(next)after[change.collection].push(next);}
  }
  derivedActivities(after);validatePlan(after,{previous:before});
  const changes=diffPlan(before,after),periods=await getPeriods(db);
  authorizeChanges(member,before,after,changes,periods);
  // Deleting a staff profile must not leave accounts or pending invitations dangling.
  for(const change of changes.filter(c=>c.collection==='people'&&!c.after)){
    const linked=await db.query('SELECT 1 FROM flow_members WHERE person_id=$1 UNION ALL SELECT 1 FROM flow_invitations WHERE person_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()',[change.id]);
    if(linked.rowCount)fail(409,'Diese Person ist noch mit einem Konto oder einer Einladung verknüpft. Löse zuerst die Verknüpfung.');
  }
  if(!changes.length)return {revision:Number(ws.revision),auditId:null};
  await writeChanges(db,changes);const revision=await bump(db),auditId=await audit(db,member,undoId?'plan.undo':'plan.change',{changes,revision,detail:undoId?{undoOf:undoId}:{}});
  if(undoId)await db.query('UPDATE flow_audit SET undone_by=$1 WHERE id=$2',[auditId,undoId]);
  return {revision,auditId};
}
export async function undoCommand(db,userId,auditId,expectedRevision){
  const member=await getMember(db,userId),entry=(await db.query("SELECT * FROM flow_audit WHERE id=$1 AND action='plan.change'",[auditId])).rows[0];
  if(!entry||entry.actor_id!==userId&&member.role!=='admin')fail(403,'Diese Änderung darfst du nicht rückgängig machen.');
  if(entry.undone_by)fail(409,'Diese Änderung wurde bereits rückgängig gemacht.');
  // Every affected record must still equal that command's result. Other people's later edits remain intact.
  const plan=await loadPlan(db);
  for(const c of entry.changes){const current=c.collection==='settings'?plan.settings:plan[c.collection].find(e=>e.id===c.id)||null;if(!equal(current,c.after))fail(409,'Die betroffenen Daten wurden danach bearbeitet. Rückgängig würde diese Änderungen überschreiben.');}
  return applyCommands(db,userId,{expectedRevision,changes:entry.changes.map(c=>({...c,before:c.after,after:c.before}))},{undoId:auditId});
}
