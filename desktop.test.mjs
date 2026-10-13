import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const require=createRequire(import.meta.url),temp=await mkdtemp(path.join(os.tmpdir(),'flow-desktop-smoke-'));
try{
  const code=await new Promise((resolve,reject)=>{
    const env={...process.env,FLOW_SMOKE_USER_DATA:temp};
    delete env.ELECTRON_RUN_AS_NODE;
    const args=[path.join('desktop','smoke.cjs')];
    if(process.platform==='linux'&&process.env.CI)args.unshift('--no-sandbox');
    const child=spawn(require('electron'),args,{stdio:'inherit',env});
    child.on('error',reject);child.on('exit',code=>resolve(code));
  });
  if(code!==0)throw new Error(`Desktop smoke test exited with ${code}`);
}finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
