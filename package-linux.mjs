import {readFile,copyFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';

if(process.platform!=='linux')throw new Error('Linux distribution must be packaged on Linux.');
const {version}=JSON.parse(await readFile('package.json','utf8'));
const archive=path.join('release',`Flow-${version}-x86_64-linux.tar.gz`);
await copyFile(path.join('assets','Flow!_Logo.png'),path.join('release','linux-unpacked','flow.png'));
await promisify(execFile)('tar',['-czf',archive,'-C',path.join('release','linux-unpacked'),'.']);
const appImage=path.join('release',`Flow-${version}-x86_64-linux.AppImage`);
const checksums=await Promise.all([archive,appImage].map(async file=>{
  const hash=createHash('sha256').update(await readFile(file)).digest('hex');
  return `${hash}  ${path.basename(file)}`;
}));
await writeFile(path.join('release','SHA256SUMS'),checksums.join('\n')+'\n');
console.log(`Packaged ${archive} and SHA256SUMS for Linux/OmaStore.`);
