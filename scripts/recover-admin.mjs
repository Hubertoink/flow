import {createInterface} from 'node:readline/promises';
import {createPool,transaction,audit,bump} from '../server/database.mjs';
import {passwordHash} from '../server/auth.mjs';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL fehlt.');
const terminal=createInterface({input:process.stdin,output:process.stdout});
const email=(await terminal.question('E-Mail des Admin-Kontos: ')).trim().toLowerCase();
let password='';
if(process.stdin.isTTY){const writer=terminal._writeToOutput.bind(terminal);terminal._writeToOutput=value=>writer(value.includes('Neues Passwort')?value:'*');password=await terminal.question('Neues Passwort (mindestens 12 Zeichen): ');terminal._writeToOutput=writer;process.stdout.write('\n');}
else password=await terminal.question('Neues Passwort (mindestens 12 Zeichen): ');
terminal.close();if(password.length<12||password.length>128)throw new Error('Das Passwort muss 12 bis 128 Zeichen lang sein.');
const pool=createPool(process.env.DATABASE_URL);
try{const hash=await passwordHash(password);await transaction(pool,async db=>{
  const target=(await db.query('SELECT u.id,u.name FROM "user" u JOIN flow_members m ON m.user_id=u.id WHERE u.email=$1 AND m.role=\'admin\'',[email])).rows[0];if(!target)throw new Error('Kein passendes Admin-Konto gefunden.');
  await db.query('UPDATE account SET password=$1,"updatedAt"=now() WHERE "userId"=$2 AND "providerId"=\'credential\'',[hash,target.id]);
  await db.query('DELETE FROM session WHERE "userId"=$1',[target.id]);await db.query('DELETE FROM "twoFactor" WHERE "userId"=$1',[target.id]);await db.query('UPDATE "user" SET "twoFactorEnabled"=false,"updatedAt"=now() WHERE id=$1',[target.id]);await db.query('UPDATE flow_members SET active=true WHERE user_id=$1',[target.id]);
  await audit(db,null,'admin.recovery',{detail:{userId:target.id}});await bump(db);
});console.log('Admin-Konto wiederhergestellt. Richte die Zwei-Faktor-Anmeldung erneut ein.');}finally{await pool.end();}
