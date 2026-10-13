import {readFile,copyFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {aurRecipe} from './packaging/aur/generate.mjs';

if(process.platform!=='linux')throw new Error('Linux distribution must be packaged on Linux.');
const {version}=JSON.parse(await readFile('package.json','utf8'));
const archive=path.join('release',`Flow-${version}-x86_64-linux.tar.gz`);
await copyFile(path.join('assets','Flow!_Logo.png'),path.join('release','linux-unpacked','flow.png'));
for(const file of ['flow-launcher','flow.desktop'])await copyFile(path.join('packaging','aur',file),path.join('release','linux-unpacked',file));
await copyFile('LICENSE',path.join('release','linux-unpacked','LICENSE'));
await promisify(execFile)('tar',['-czf',archive,'-C',path.join('release','linux-unpacked'),'.']);
const appImage=path.join('release',`Flow-${version}-x86_64-linux.AppImage`);
const checksums=await Promise.all([archive,appImage].map(async file=>{
  const hash=createHash('sha256').update(await readFile(file)).digest('hex');
  return `${hash}  ${path.basename(file)}`;
}));
await writeFile(path.join('release','SHA256SUMS'),checksums.join('\n')+'\n');
await mkdir(path.join('release','aur'),{recursive:true});
await writeFile(path.join('release','aur','PKGBUILD'),await aurRecipe(version,checksums[0].slice(0,64)));
console.log(`Packaged ${archive}, SHA256SUMS and AUR recipe.`);
