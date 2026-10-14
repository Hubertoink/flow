import {spawn} from 'node:child_process';
import './local-config.mjs';
const envFile='.flow-local/config.env';
function command(executable,args,options={}){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{stdio:'inherit',...options});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(executable+' endete mit '+code)));});}
await command('docker',['compose','--env-file',envFile,'-f','compose.dev.yml','-f','compose.local.yml','up','--build','-d','--wait']);
console.log('Flow! Team läuft unter http://localhost:4174');
