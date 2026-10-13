import {readFile} from 'node:fs/promises';

export async function aurRecipe(version,checksum){
  if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('AUR packaging requires a stable x.y.z version.');
  if(!/^[0-9a-f]{64}$/.test(checksum))throw new Error('AUR packaging requires an SHA256 checksum.');
  const template=await readFile(new URL('./PKGBUILD.in',import.meta.url),'utf8');
  return template.replaceAll('\r\n','\n').replace('@VERSION@',version).replace('@SHA256@',checksum);
}
