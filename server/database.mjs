import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {collections,emptyPlan,fail} from './model.mjs';

export function createPool(connectionString){return new pg.Pool({connectionString,max:10,connectionTimeoutMillis:10000});}
export async function migrate(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS flow_workspace (
    id integer PRIMARY KEY CHECK (id=1), name text NOT NULL DEFAULT 'Flow!', ready boolean NOT NULL DEFAULT false,
    revision bigint NOT NULL DEFAULT 0, settings jsonb NOT NULL DEFAULT '{"breakRules":[]}', schema_version integer NOT NULL DEFAULT 1
  );
  INSERT INTO flow_workspace(id) VALUES(1) ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS flow_entities (
    collection text NOT NULL CHECK (collection IN ('people','shifts','activities','projects','taskTypes')),
    id text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(collection,id)
  );
  CREATE TABLE IF NOT EXISTS flow_members (
    user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    person_id text, role text NOT NULL CHECK(role IN ('admin','member')), active boolean NOT NULL DEFAULT true,
    permissions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS flow_member_person ON flow_members(person_id) WHERE person_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS flow_invitations (
    id text PRIMARY KEY, email text NOT NULL, name text NOT NULL, person_id text,
    role text NOT NULL CHECK(role IN ('admin','member')), permissions jsonb NOT NULL,
    token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, accepted_at timestamptz,
    revoked_at timestamptz, invited_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS flow_periods (
    week date PRIMARY KEY, published boolean NOT NULL DEFAULT false, times_locked boolean NOT NULL DEFAULT false,
    published_at timestamptz, updated_by text REFERENCES "user"(id)
  );
  CREATE TABLE IF NOT EXISTS flow_preferences (
    user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, payload jsonb NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS flow_audit (
    id text PRIMARY KEY, actor_id text REFERENCES "user"(id), actor_name text NOT NULL, action text NOT NULL,
    revision bigint, changes jsonb NOT NULL DEFAULT '[]', detail jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(), undone_by text REFERENCES flow_audit(id)
  );
  CREATE INDEX IF NOT EXISTS flow_audit_time ON flow_audit(created_at DESC);
  CREATE TABLE IF NOT EXISTS flow_mail (
    id text PRIMARY KEY, recipient text NOT NULL, subject text NOT NULL, text_body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, attempts integer NOT NULL DEFAULT 0, last_error text
  );`);
  if(!(await workspace(pool)).ready&&(await pool.query('SELECT 1 FROM flow_entities LIMIT 1')).rowCount===0)for(const entity of emptyPlan().taskTypes)await pool.query('INSERT INTO flow_entities(collection,id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',['taskTypes',entity.id,JSON.stringify(entity)]);
}
export async function transaction(pool,fn,{readOnly=false}={}){
  const client=await pool.connect();
  try{await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');if(!readOnly)await client.query('SELECT id FROM flow_workspace WHERE id=1 FOR UPDATE');const result=await fn(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function workspace(db){return (await db.query('SELECT * FROM flow_workspace WHERE id=1')).rows[0];}
export async function loadPlan(db){
  const plan=emptyPlan();for(const collection of collections)plan[collection]=[];
  const [entities,ws]=await Promise.all([db.query('SELECT collection,payload FROM flow_entities ORDER BY collection,id'),workspace(db)]);
  for(const {collection,payload} of entities.rows)plan[collection].push(payload);
  plan.settings={defaultShiftLock:'open',...ws.settings};return plan;
}
export async function getPeriods(db){return (await db.query("SELECT to_char(week,'YYYY-MM-DD') AS week,published,times_locked AS \"timesLocked\",published_at AS \"publishedAt\" FROM flow_periods ORDER BY week")).rows;}
export async function getMember(db,userId){
  const member=(await db.query('SELECT m.user_id AS "userId",m.person_id AS "personId",m.role,m.active,m.permissions,u.name,u.email,u."twoFactorEnabled" AS "twoFactorEnabled" FROM flow_members m JOIN "user" u ON u.id=m.user_id WHERE m.user_id=$1',[userId])).rows[0];
  if(!member?.active)fail(401,'Dein Konto ist deaktiviert oder nicht für dieses Team freigegeben.');return member;
}
export async function writeChanges(db,changes){
  for(const {collection,id,after} of changes){
    if(collection==='settings'){await db.query('UPDATE flow_workspace SET settings=$1 WHERE id=1',[JSON.stringify(after)]);continue;}
    if(after===null)await db.query('DELETE FROM flow_entities WHERE collection=$1 AND id=$2',[collection,id]);
    else await db.query('INSERT INTO flow_entities(collection,id,payload) VALUES($1,$2,$3) ON CONFLICT(collection,id) DO UPDATE SET payload=EXCLUDED.payload',[collection,id,JSON.stringify(after)]);
  }
}
export async function audit(db,member,action,{changes=[],detail={},revision=null}={}){
  const auditId=randomUUID();await db.query('INSERT INTO flow_audit(id,actor_id,actor_name,action,revision,changes,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',[auditId,member?.userId||null,member?.name||'System',action,revision,JSON.stringify(changes),JSON.stringify(detail)]);return auditId;
}
export async function bump(db){return Number((await db.query('UPDATE flow_workspace SET revision=revision+1 WHERE id=1 RETURNING revision')).rows[0].revision);}
