import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('.flow-local',{recursive:true});
try{await readFile('.flow-local/config.env');console.log('Lokale Konfiguration vorhanden.');}
catch(error){if(error.code!=='ENOENT')throw error;const databasePassword=randomBytes(24).toString('hex');await writeFile('.flow-local/config.env',[
  'NODE_ENV=development','FLOW_HOST=127.0.0.1','FLOW_PORT=4174','FLOW_URL=http://localhost:4174',
  'FLOW_DB_PASSWORD='+databasePassword,'DATABASE_URL=postgresql://flow:'+databasePassword+'@127.0.0.1:55432/flow',
  'FLOW_AUTH_SECRET='+randomBytes(32).toString('hex'),'FLOW_SETUP_TOKEN='+randomBytes(24).toString('hex'),
  'FLOW_LOCAL_MAIL=true'
].join('\n')+'\n',{mode:0o600});console.log('Lokale Konfiguration erstellt.');}
