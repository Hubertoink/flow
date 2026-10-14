import {readConfig} from './config.mjs';
import {createPool,migrate} from './database.mjs';
import {createAuth,migrateAuth,authOptions} from './auth.mjs';
import {createMail} from './mail.mjs';
import {createApp} from './app.mjs';

const config=readConfig(),pool=createPool(config.databaseUrl),mail=createMail(pool,config);
try{
  for(let attempt=0;;attempt++){try{await pool.query('SELECT 1');break;}catch(error){if(attempt>=14)throw error;await new Promise(resolve=>setTimeout(resolve,2000));}}
  // Serialize schema setup across app restarts/replicas.
  const migrationClient=await pool.connect();
  try{await migrationClient.query('SELECT pg_advisory_lock(17840741)');await migrateAuth(authOptions(pool,config,mail));await migrate(pool);}finally{await migrationClient.query('SELECT pg_advisory_unlock(17840741)');migrationClient.release();}
  const auth=createAuth(pool,config,mail);
  const app=createApp({pool,auth,mail,config}),server=app.listen(config.port,config.host,()=>console.log('Flow! Team: '+config.url));
  const timer=setInterval(()=>mail.flush().catch(error=>console.error('Postausgang:',error.message)),15000);timer.unref();
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(async()=>{await pool.end();process.exit(0);});});
}catch(error){console.error('Flow! Start fehlgeschlagen:',error.message);await pool.end();process.exitCode=1;}
