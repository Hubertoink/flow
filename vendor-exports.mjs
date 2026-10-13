import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

await mkdir(path.join('dist','vendor'), {recursive: true});
for (const [source, target] of [
  ['exceljs\\dist\\exceljs.min.js', 'exceljs.min.js'],
  ['exceljs\\LICENSE', 'exceljs-LICENSE'],
  ['html-to-image\\dist\\html-to-image.js', 'html-to-image.js'],
  ['html-to-image\\LICENSE', 'html-to-image-LICENSE'],
  ['@fontsource-variable\\dm-sans\\files\\dm-sans-latin-wght-normal.woff2', 'dm-sans-latin.woff2'],
  ['@fontsource-variable\\dm-sans\\LICENSE', 'dm-sans-LICENSE'],
]) {
  const from=path.join('node_modules',...source.split('\\')),to=path.join('dist','vendor',target);
  if(target.endsWith('-LICENSE'))await writeFile(to,(await readFile(from,'utf8')).trimEnd()+'\n');
  else await copyFile(from,to);
}
await mkdir(path.join('dist','assets'), {recursive: true});
for (const file of ['Flow!_Logo.png', 'Flow__Logo.ico']) {
  await copyFile(path.join('assets',file), path.join('dist','assets',file));
}
