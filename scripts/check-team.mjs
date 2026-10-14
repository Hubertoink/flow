import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const directory of ['server','scripts'])for(const file of await readdir(directory))if(file.endsWith('.mjs')){const result=spawnSync(process.execPath,['--check',directory+'/'+file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
for(const file of ['dist/team-client.js','dist/team-entry.js','team.test.mjs','team.browser.mjs']){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('PASS: Syntax der Team-Anwendung und Betriebswerkzeuge.');
