import {betterAuth} from 'better-auth';
import {twoFactor} from 'better-auth/plugins';
import {getMigrations} from 'better-auth/db/migration';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID} from 'node:crypto';
import {fail} from './model.mjs';

export function authOptions(pool,config,mail){
  return {
    appName:'Flow!',baseURL:config.url,secret:config.authSecret,database:pool,
    trustedOrigins:[config.url],
    emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:12,maxPasswordLength:128,revokeSessionsOnPasswordReset:true,
      sendResetPassword:async({user,url})=>{await mail.enqueue(user.email,'Flow! – Passwort zurücksetzen','Du kannst dein Passwort über diesen Link zurücksetzen:\n\n'+url+'\n\nFalls du das nicht angefordert hast, ignoriere diese Nachricht.');}},
    session:{expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
    advanced:{useSecureCookies:config.url.startsWith('https:'),defaultCookieAttributes:{httpOnly:true,sameSite:'lax'},database:{generateId:()=>randomUUID()}},
    rateLimit:{enabled:true,window:60,max:60,storage:'database',customRules:{'/sign-in/email':{window:60,max:8},'/request-password-reset':{window:300,max:3}}},
    plugins:[twoFactor({issuer:'Flow!'})],
    databaseHooks:{session:{create:{before:async(session)=>{const member=(await pool.query('SELECT active FROM flow_members WHERE user_id=$1',[session.userId])).rows[0];if(!member?.active)return false;return {data:session};}}}}
  };
}
export function createAuth(pool,config,mail){return betterAuth(authOptions(pool,config,mail));}
export async function migrateAuth(options){const migration=await getMigrations(options.options||options);await migration.runMigrations();}
export const passwordHash=password=>hashPassword(password);
// Account provisioning is intentionally only available through our transaction-protected setup and invitations.
// Password hashing and all login/session/2FA behavior belong to Better Auth.
export async function provisionUser(db,{name,email,hash}){
  if((await db.query('SELECT id FROM "user" WHERE email=$1',[email])).rowCount)fail(409,'Diese E-Mail-Adresse hat bereits ein Konto.');
  const userId=randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt","twoFactorEnabled") VALUES($1,$2,$3,true,now(),now(),false)',[userId,name,email]);
  await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),userId,hash]);return userId;
}
