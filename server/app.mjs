import express from 'express';
import {toNodeHandler,fromNodeHeaders} from 'better-auth/node';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {id,date,parse,fail,FlowError,entitySchemas,mondayKey,equal} from './model.mjs';
import {permissionsSchema,defaultPermissions,visiblePlan,canViewDate,canViewPerson} from './policy.mjs';
import {transaction,workspace,loadPlan,getPeriods,getMember,audit,bump,writeChanges} from './database.mjs';
import {passwordHash,provisionUser} from './auth.mjs';
import {applyCommands,undoCommand} from './planning.mjs';
import packageInfo from '../package.json' with {type:'json'};

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
// New asset URLs bypass caches populated by older releases, even on a normal reload.
const teamPage=readFileSync(path.join(root,'team.html'),'utf8').replace(/(href|src)="([^"]+\.(?:css|js))"/g,(_,attribute,asset)=>`${attribute}="${asset}?v=${encodeURIComponent(packageInfo.version)}"`);
const hash=value=>createHash('sha256').update(value).digest('hex');
const personalSchema=z.object({theme:z.enum(['dark','light','catppuccin']).optional(),background:z.enum(['','car','city','forest','snow']).optional(),saturday:z.boolean().optional(),sunday:z.boolean().optional(),weekend:z.boolean().optional(),zoom:z.number().min(.5).max(2).optional(),hoursTransition:z.enum(['count','fade']).optional(),projectsEnabled:z.boolean().optional(),projectsCollapsed:z.boolean().optional(),projectHeight:z.number().min(140).max(480).optional(),projectWeeks:z.union([z.literal(6),z.literal(12)]).optional()}).strict();
const email=z.string().trim().toLowerCase().email().max(254),name=z.string().trim().min(1).max(80),password=z.string().min(12).max(128);
const membershipSchema=z.object({personId:id.nullable(),role:z.enum(['admin','member']),active:z.boolean(),permissions:permissionsSchema}).strict();
const invitationSchema=z.object({email,name,personId:id.nullable(),role:z.enum(['admin','member']).default('member'),permissions:permissionsSchema.default(defaultPermissions())}).strict();

export function createApp({pool,auth,mail,config}){
  const app=express();app.disable('x-powered-by');app.set('trust proxy',config.proxy);
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"});
    if(config.production)res.set('Strict-Transport-Security','max-age=31536000');
    if(req.path.startsWith('/api'))res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      const origin=req.get('origin');if(origin&&origin!==config.url)return next(new FlowError(403,'Diese Herkunft ist nicht freigegeben.'));
      if(req.get('sec-fetch-site')==='cross-site')return next(new FlowError(403,'Diese Anfrage ist nicht freigegeben.'));
      if(!req.is('application/json'))return next(new FlowError(415,'Für Änderungen wird JSON erwartet.'));
    }next();
  });
  const limit=new Map();
  app.use(['/api/setup','/api/invitations/accept','/api/invitations/inspect'],(req,res,next)=>{
    const key=req.ip+'|'+req.path,now=Date.now(),entry=limit.get(key);if(!entry||entry.until<now)limit.set(key,{until:now+15*60000,count:1});else if(++entry.count>15)return next(new FlowError(429,'Zu viele Versuche. Bitte später erneut versuchen.'));
    if(limit.size>1000)for(const [k,v] of limit)if(v.until<now)limit.delete(k);next();
  });
  // No public account creation or generic admin endpoints are exposed.
  const authPaths=new Set(['/sign-in/email','/sign-out','/get-session','/request-password-reset','/reset-password','/change-password','/list-sessions','/revoke-session','/revoke-sessions','/revoke-other-sessions','/two-factor/enable','/two-factor/disable','/two-factor/verify-totp','/two-factor/verify-backup-code','/two-factor/generate-backup-codes','/two-factor/get-totp-uri','/ok']);
  app.all('/api/auth/*splat',(req,res,next)=>{const authPath=req.path.slice('/api/auth'.length);if(!authPaths.has(authPath)&&!(req.method==='GET'&&/^\/reset-password\/[^/]+$/.test(authPath)))return res.status(404).json({message:'Dieser Anmeldeweg ist nicht verfügbar.'});next();},toNodeHandler(auth));
  app.use(express.json({limit:'10mb'}));
  const route=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(error){next(error);}};
  const signedIn=async(req,res,next)=>{try{const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers),query:{disableCookieCache:true}});if(!session)fail(401,'Bitte melde dich an.');req.userId=session.user.id;req.member=await getMember(pool,req.userId);next();}catch(error){next(error);}};
  const admin=(req,res,next)=>req.member.role==='admin'?next():next(new FlowError(403,'Diese Funktion ist für Admins vorgesehen.'));
  const snapshot=async(db,userId)=>{
    const member=await getMember(db,userId),ws=await workspace(db),plan=await loadPlan(db),periods=await getPeriods(db),preferences=(await db.query('SELECT payload FROM flow_preferences WHERE user_id=$1',[userId])).rows[0]?.payload||{};
    return {version:packageInfo.version,member,organization:ws.name,revision:Number(ws.revision),plan:visiblePlan(plan,member,periods),periods:member.role==='admin'||member.permissions.viewDrafts?periods:periods.filter(p=>p.published),preferences,localMail:config.localMail,mailConfigured:mail.configured};
  };
  app.get('/health',route(async(req,res)=>{await pool.query('SELECT 1');res.json({status:'ok'});}));
  app.get('/api/status',route(async(req,res)=>{res.json({ready:(await workspace(pool)).ready});}));
  app.post('/api/setup',route(async(req,res)=>{
    const input=parse(z.object({token:z.string().max(500),organization:name,name,email,password}).strict(),req.body);
    const valid=timingSafeEqual(Buffer.from(hash(input.token)),Buffer.from(hash(config.setupToken)));if(!valid)fail(403,'Der Einrichtungsschlüssel ist ungültig.');
    const hashed=await passwordHash(input.password);
    await transaction(pool,async db=>{
      if((await workspace(db)).ready)fail(409,'Flow! wurde bereits eingerichtet.');
      const userId=await provisionUser(db,{...input,hash:hashed}),personId=randomUUID(),person=entitySchemas.people.parse({id:personId,name:input.name,color:'#8cbea7'});
      await writeChanges(db,[{collection:'people',id:personId,after:person}]);
      await db.query("INSERT INTO flow_members(user_id,person_id,role,permissions) VALUES($1,$2,'admin',$3)",[userId,personId,JSON.stringify(defaultPermissions())]);
      await db.query('UPDATE flow_workspace SET ready=true,name=$1,revision=revision+1 WHERE id=1',[input.organization]);
      await audit(db,{userId,name:input.name},'workspace.setup');
    });res.status(201).json({message:'Flow! ist eingerichtet. Du kannst dich jetzt anmelden.'});
  }));
  app.post('/api/invitations/inspect',route(async(req,res)=>{
    const {token}=parse(z.object({token:z.string().min(32).max(200)}).strict(),req.body),inv=(await pool.query('SELECT name,email,role,expires_at FROM flow_invitations WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()',[hash(token)])).rows[0];
    if(!inv)fail(410,'Diese Einladung ist abgelaufen, widerrufen oder bereits verwendet.');res.json(inv);
  }));
  app.post('/api/invitations/accept',route(async(req,res)=>{
    const input=parse(z.object({token:z.string().min(32).max(200),password}).strict(),req.body),hashed=await passwordHash(input.password);
    await transaction(pool,async db=>{
      const inv=(await db.query('SELECT * FROM flow_invitations WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',[hash(input.token)])).rows[0];if(!inv)fail(410,'Diese Einladung ist abgelaufen, widerrufen oder bereits verwendet.');
      const inviter=(await db.query("SELECT role,active FROM flow_members WHERE user_id=$1",[inv.invited_by])).rows[0];if(!inviter?.active||inviter.role!=='admin')fail(410,'Diese Einladung ist nicht mehr freigegeben.');
      if(inv.person_id&&(await db.query('SELECT 1 FROM flow_members WHERE person_id=$1',[inv.person_id])).rowCount)fail(409,'Diese Person hat bereits ein Konto.');
      const userId=await provisionUser(db,{name:inv.name,email:inv.email,hash:hashed});
      await db.query('INSERT INTO flow_members(user_id,person_id,role,permissions) VALUES($1,$2,$3,$4)',[userId,inv.person_id,inv.role,JSON.stringify(inv.permissions)]);
      await db.query('UPDATE flow_invitations SET accepted_at=now() WHERE id=$1',[inv.id]);await audit(db,{userId,name:inv.name},'invitation.accept',{detail:{invitationId:inv.id}});await bump(db);
    });res.status(201).json({message:'Dein Konto ist angelegt. Du kannst dich jetzt anmelden.'});
  }));
  app.use('/api',signedIn);
  app.get('/api/bootstrap',route(async(req,res)=>res.json(await transaction(pool,db=>snapshot(db,req.userId),{readOnly:true}))));
  app.post('/api/plan/commands',route(async(req,res)=>{
    const result=await transaction(pool,async db=>{const command=await applyCommands(db,req.userId,req.body);return {...await snapshot(db,req.userId),...command};});res.json(result);
  }));
  app.post('/api/plan/undo',route(async(req,res)=>{
    const input=parse(z.object({auditId:id,expectedRevision:z.number().int().nonnegative()}).strict(),req.body);
    res.json(await transaction(pool,async db=>({...await undoCommand(db,req.userId,input.auditId,input.expectedRevision),...await snapshot(db,req.userId)})));
  }));
  app.put('/api/preferences',route(async(req,res)=>{const preferences=parse(personalSchema,req.body);await pool.query('INSERT INTO flow_preferences(user_id,payload) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET payload=EXCLUDED.payload',[req.userId,JSON.stringify(preferences)]);res.json(preferences);}));
  app.get('/api/team',admin,route(async(req,res)=>{
    res.json(await transaction(pool,async db=>{const actor=await getMember(db,req.userId);if(actor.role!=='admin')fail(403,'Adminrechte erforderlich.');return {members:(await db.query('SELECT m.user_id AS "userId",m.person_id AS "personId",m.role,m.active,m.permissions,u.name,u.email,u."twoFactorEnabled" AS "twoFactorEnabled" FROM flow_members m JOIN "user" u ON u.id=m.user_id ORDER BY u.name')).rows,
      invitations:(await db.query('SELECT id,email,name,person_id AS "personId",role,permissions,expires_at AS "expiresAt",accepted_at AS "acceptedAt",revoked_at AS "revokedAt" FROM flow_invitations ORDER BY created_at DESC LIMIT 100')).rows};},{readOnly:true}));
  }));
  async function checkMembership(db,input){
    if(input.personId&&!(await db.query("SELECT 1 FROM flow_entities WHERE collection='people' AND id=$1",[input.personId])).rowCount)fail(400,'Die ausgewählte Person existiert nicht.');
    const people=new Set((await db.query("SELECT id FROM flow_entities WHERE collection='people'")).rows.map(p=>p.id)),delegates=new Set();
    for(const d of input.permissions.delegates){if(!people.has(d.personId)||delegates.has(d.personId)||d.personId===input.personId)fail(400,'Delegierte Personen müssen eindeutig sein und dürfen nicht die eigene Person sein.');delegates.add(d.personId);}
  }
  app.patch('/api/team/:userId',admin,route(async(req,res)=>{
    const target=parse(id,req.params.userId),input=parse(membershipSchema,req.body);
    await transaction(pool,async db=>{
      const actor=await getMember(db,req.userId);if(actor.role!=='admin')fail(403,'Adminrechte erforderlich.');await checkMembership(db,input);
      const old=(await db.query('SELECT * FROM flow_members WHERE user_id=$1',[target])).rows[0];if(!old)fail(404,'Dieses Konto existiert nicht.');
      if(old.role==='admin'&&old.active&&(!input.active||input.role!=='admin')&&(await db.query("SELECT 1 FROM flow_members WHERE role='admin' AND active=true AND user_id<>$1",[target])).rowCount===0)fail(409,'Mindestens ein aktiver Admin muss erhalten bleiben.');
      await db.query('UPDATE flow_members SET person_id=$1,role=$2,active=$3,permissions=$4 WHERE user_id=$5',[input.personId,input.role,input.active,JSON.stringify(input.permissions),target]);
      if(!input.active){await db.query('DELETE FROM session WHERE "userId"=$1',[target]);await db.query('UPDATE flow_invitations SET revoked_at=now() WHERE invited_by=$1 AND accepted_at IS NULL AND revoked_at IS NULL',[target]);}
      await audit(db,actor,'member.update',{detail:{userId:target,before:{personId:old.person_id,role:old.role,active:old.active,permissions:old.permissions},after:input}});await bump(db);
    });res.json({message:'Konto und Rechte gespeichert.'});
  }));
  app.post('/api/team/:userId/revoke-sessions',admin,route(async(req,res)=>{
    await transaction(pool,async db=>{const actor=await getMember(db,req.userId);if(actor.role!=='admin')fail(403,'Adminrechte erforderlich.');const target=parse(id,req.params.userId);await db.query('DELETE FROM session WHERE "userId"=$1',[target]);await audit(db,actor,'sessions.revoke',{detail:{userId:target}});});res.json({message:'Alle Sitzungen dieses Kontos wurden beendet.'});
  }));
  app.post('/api/invitations',admin,route(async(req,res)=>{
    const input=parse(invitationSchema,req.body),token=randomBytes(32).toString('hex'),invitationId=randomUUID(),url=config.url+'/#invite='+token;
    await transaction(pool,async db=>{
      const actor=await getMember(db,req.userId);if(actor.role!=='admin')fail(403,'Adminrechte erforderlich.');await checkMembership(db,input);
      if((await db.query('SELECT 1 FROM "user" WHERE email=$1',[input.email])).rowCount)fail(409,'Diese E-Mail-Adresse hat bereits ein Konto.');
      if(input.personId&&(await db.query('SELECT 1 FROM flow_members WHERE person_id=$1',[input.personId])).rowCount)fail(409,'Diese Person hat bereits ein Konto.');
      if((await db.query('SELECT 1 FROM flow_invitations WHERE (email=$1 OR person_id=$2) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()',[input.email,input.personId])).rowCount)fail(409,'Hierzu gibt es bereits eine offene Einladung. Widerrufe sie vor einer neuen Einladung.');
      await db.query("INSERT INTO flow_invitations(id,email,name,person_id,role,permissions,token_hash,expires_at,invited_by) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days',$8)",[invitationId,input.email,input.name,input.personId,input.role,JSON.stringify(input.permissions),hash(token),actor.userId]);
      await mail.enqueue(input.email,'Einladung zu Flow!',input.name+', du bist zu '+(await workspace(db)).name+' eingeladen.\n\nLege über diesen Link dein Passwort fest:\n'+url+'\n\nDer Link ist sieben Tage gültig.',db);
      await audit(db,actor,'invitation.create',{detail:{invitationId,email:input.email,personId:input.personId,role:input.role}});
    });res.status(201).json({id:invitationId,url,message:mail.configured?'Einladung angelegt; E-Mail wird versendet.':'Einladung angelegt. Gib den Link persönlich weiter.'});
  }));
  app.delete('/api/invitations/:id',admin,route(async(req,res)=>{
    await transaction(pool,async db=>{const actor=await getMember(db,req.userId);if(actor.role!=='admin')fail(403,'Adminrechte erforderlich.');const invitationId=parse(id,req.params.id);await db.query('UPDATE flow_invitations SET revoked_at=now() WHERE id=$1 AND accepted_at IS NULL',[invitationId]);await audit(db,actor,'invitation.revoke',{detail:{invitationId}});});res.json({message:'Einladung widerrufen.'});
  }));
  app.put('/api/shifts/:id/lock',admin,route(async(req,res)=>{
    const input=parse(z.object({expectedRevision:z.number().int().nonnegative(),lock:z.enum(['open','times','all'])}).strict(),req.body),shiftId=parse(id,req.params.id);
    res.json(await transaction(pool,async db=>{
      const actor=await getMember(db,req.userId);if(actor.role!=='admin')fail(403,'Adminrechte erforderlich.');if(Number((await workspace(db)).revision)!==input.expectedRevision)fail(409,'Der Plan wurde inzwischen geändert.');
      const old=(await db.query("SELECT payload FROM flow_entities WHERE collection='shifts' AND id=$1",[shiftId])).rows[0]?.payload;if(!old)fail(404,'Schicht nicht gefunden.');
      const next={...old,lock:input.lock};await writeChanges(db,[{collection:'shifts',id:shiftId,after:next}]);const revision=await bump(db);await audit(db,actor,'shift.lock',{revision,detail:{shiftId,before:old.lock,after:next.lock}});return snapshot(db,req.userId);
    }));
  }));
  app.put('/api/shifts/:id/assignments/:taskId/lock',admin,route(async(req,res)=>{
    const input=parse(z.object({expectedRevision:z.number().int().nonnegative(),locked:z.boolean()}).strict(),req.body),shiftId=parse(id,req.params.id),taskId=parse(id,req.params.taskId);
    res.json(await transaction(pool,async db=>{
      const actor=await getMember(db,req.userId);if(actor.role!=='admin')fail(403,'Adminrechte erforderlich.');if(Number((await workspace(db)).revision)!==input.expectedRevision)fail(409,'Der Plan wurde inzwischen geändert.');
      const old=(await db.query("SELECT payload FROM flow_entities WHERE collection='shifts' AND id=$1",[shiftId])).rows[0]?.payload,t=old?.segments.find(t=>t.id===taskId);if(!t)fail(404,'Zuordnung nicht gefunden.');
      const next=structuredClone(old);next.segments.find(t=>t.id===taskId).locked=input.locked;await writeChanges(db,[{collection:'shifts',id:shiftId,after:next}]);const revision=await bump(db);await audit(db,actor,'assignment.lock',{revision,detail:{shiftId,taskId,before:t.locked,after:input.locked}});return snapshot(db,req.userId);
    }));
  }));
  app.put('/api/periods/:week',admin,route(async(req,res)=>{
    const week=parse(date,req.params.week),input=parse(z.object({expectedRevision:z.number().int().nonnegative(),published:z.boolean(),timesLocked:z.boolean()}).strict(),req.body);if(mondayKey(week)!==week)fail(400,'Eine Planungswoche beginnt am Montag.');
    res.json(await transaction(pool,async db=>{
      const actor=await getMember(db,req.userId);if(actor.role!=='admin')fail(403,'Adminrechte erforderlich.');if(Number((await workspace(db)).revision)!==input.expectedRevision)fail(409,'Der Plan wurde inzwischen geändert.');
      const old=(await getPeriods(db)).find(p=>p.week===week)||{week,published:false,timesLocked:false};
      await db.query('INSERT INTO flow_periods(week,published,times_locked,published_at,updated_by) VALUES($1,$2,$3,CASE WHEN $2 THEN now() ELSE NULL END,$4) ON CONFLICT(week) DO UPDATE SET published=EXCLUDED.published,times_locked=EXCLUDED.times_locked,published_at=CASE WHEN EXCLUDED.published AND NOT flow_periods.published THEN now() WHEN NOT EXCLUDED.published THEN NULL ELSE flow_periods.published_at END,updated_by=EXCLUDED.updated_by',[week,input.published,input.timesLocked,actor.userId]);
      const revision=await bump(db);await audit(db,actor,'week.update',{revision,detail:{week,before:old,after:input}});return snapshot(db,req.userId);
    }));
  }));
  app.get('/api/audit',route(async(req,res)=>{
    const member=await getMember(pool,req.userId),entries=(await pool.query('SELECT id,actor_id,actor_name,action,revision,changes,detail,created_at,undone_by FROM flow_audit ORDER BY created_at DESC LIMIT 200')).rows;
    const periods=await getPeriods(pool);
    const result=entries.filter(entry=>member.role==='admin'||entry.action.startsWith('plan.')&&entry.changes.some(c=>c.collection==='shifts'&&[c.before,c.after].filter(Boolean).some(s=>canViewDate(member,s.date,periods)&&visiblePlan({version:3,people:[],shifts:[s],activities:[],projects:[],taskTypes:[],settings:{}},member,periods).shifts.length)));
    const names=new Map((await pool.query("SELECT id,payload->>'name' AS name FROM flow_entities WHERE collection='people'")).rows.map(p=>[p.id,p.name]));
    const time=n=>`${String(Math.floor(n)).padStart(2,'0')}:${String(Math.round(n*60)%60).padStart(2,'0')}`;
    const summary=entry=>entry.changes.flatMap(c=>{
      if(c.collection==='shifts'){const visible=s=>s&&canViewPerson(member,s.person)&&canViewDate(member,s.date,periods),old=visible(c.before)?c.before:null,next=visible(c.after)?c.after:null,s=next||old;if(!s)return [];const prefix=(names.get(s.person)||'Mitarbeitend')+' · '+s.date;return [prefix+' · '+(!old?'Schicht angelegt':!next?'Schicht entfernt':old.start!==next.start||old.length!==next.length?time(old.start)+'–'+time(old.start+old.length)+' → '+time(next.start)+'–'+time(next.start+next.length):'Aufgaben / Anordnung geändert')];}
      if(member.role!=='admin')return [];if(c.collection==='settings')return ['Pausenregelung geändert'];const e=c.after||c.before;return [(c.collection==='people'?'Mitarbeitendenprofil':c.collection==='projects'?'Projekt':c.collection==='taskTypes'?'Aufgabenvorlage':'Tagesaufgabe')+' · '+(e.name||e.label||c.id)];
    }).slice(0,8);
    res.json(result.map(e=>({id:e.id,actorName:e.actor_name,action:e.action,revision:Number(e.revision),createdAt:e.created_at,undone:!!e.undone_by,canUndo:e.action==='plan.change'&&!e.undone_by&&(member.role==='admin'||e.actor_id===req.userId),detail:member.role==='admin'?e.detail:undefined,count:e.changes.length,summary:summary(e)})));
  }));
  app.get('/api/local-mail',admin,route(async(req,res)=>{if(!config.localMail)fail(404,'Lokaler Postausgang ist hier nicht aktiviert.');res.json((await pool.query('SELECT id,recipient,subject,text_body AS text,created_at AS "createdAt",sent_at AS "sentAt",last_error AS "lastError" FROM flow_mail ORDER BY created_at DESC LIMIT 30')).rows);}));
  app.get('/api/mail-status',admin,route(async(req,res)=>res.json({configured:mail.configured,pending:Number((await pool.query('SELECT count(*) FROM flow_mail WHERE sent_at IS NULL')).rows[0].count),failed:Number((await pool.query('SELECT count(*) FROM flow_mail WHERE sent_at IS NULL AND attempts>=5')).rows[0].count)})));
  app.use('/api',(req,res)=>res.status(404).json({message:'Diese Funktion existiert nicht.'}));
  app.get('/app-shell',signedIn,(req,res)=>{res.set('Cache-Control','no-store');res.sendFile(path.join(root,'index.html'));});
  app.get(['/','/index.html','/team.html'],(req,res)=>res.set('Cache-Control','no-store').type('html').send(teamPage));
  app.use(express.static(root,{index:false,maxAge:config.production?'1h':0,setHeaders(res,file){if(/\.(?:css|js|html)$/.test(file))res.setHeader('Cache-Control','no-cache');}}));
  app.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    const status=error.status||error.type==='entity.too.large'&&413||error.code==='23505'&&409||500;
    if(status>=500)console.error('Flow! Serverfehler:',error);
    res.status(status).json({message:status===500?'Die Anfrage konnte nicht verarbeitet werden.':error.code==='23505'?'Diese Verknüpfung oder E-Mail-Adresse ist bereits vergeben.':error.message});
  });return app;
}
