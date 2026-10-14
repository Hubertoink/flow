import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createPool} from '../server/database.mjs';
import assert from 'node:assert/strict';

export async function testBackup(connectionString){
  const source=new URL(connectionString),sourceDatabase=decodeURIComponent(source.pathname.slice(1)),restoreDatabase='flow_restore_'+randomUUID().replaceAll('-','');
  const control=createPool(connectionString),container=process.env.FLOW_TEST_DB_CONTAINER||'flow-development-database-1';
  const run=(args,input)=>new Promise((resolve,reject)=>{const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']}),chunks=[],errors=[];child.stdout.on('data',chunk=>chunks.push(chunk));child.stderr.on('data',chunk=>errors.push(chunk));child.on('error',reject);child.on('close',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error('Sicherungsprobe fehlgeschlagen: '+Buffer.concat(errors).toString())));child.stdin.end(input);});
  let restored;
  try{
    const dump=await run(['exec',container,'pg_dump','-U',source.username,'-d',sourceDatabase,'--format=custom','--no-owner']);assert(dump.length>1000);
    await control.query('CREATE DATABASE "'+restoreDatabase+'"');
    await run(['exec','-i',container,'pg_restore','-U',source.username,'-d',restoreDatabase,'--no-owner'],dump);
    const restoredUrl=new URL(source);restoredUrl.pathname='/'+restoreDatabase;restored=createPool(restoredUrl.href);
    for(const table of ['flow_workspace','flow_entities','flow_members','flow_invitations','flow_audit','user','account','session']){
      const a=(await control.query('SELECT * FROM "'+table+'" ORDER BY 1')).rows,b=(await restored.query('SELECT * FROM "'+table+'" ORDER BY 1')).rows;assert.deepEqual(b,a,'Wiederherstellung: '+table);
    }
    console.log('PASS: Echter PostgreSQL-Dump und Wiederherstellung in eine separate Datenbank, einschließlich Konten, Sitzungen, Rechten, Einladungen und Änderungshistorie.');
  }finally{if(restored)await restored.end();await control.query('DROP DATABASE IF EXISTS "'+restoreDatabase+'"');await control.end();}
}
