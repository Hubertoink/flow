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
for (const file of ['Flow!_Logo.png', 'Flow__Logo.ico','a_car_with_trees_on_it.png','a_city_skyline_with_a_plane_in_the_sky.png','a_foggy_forest_with_trees_and_bushes.png','a_group_of_trees_in_a_snowy_field.jpg']) {
  await copyFile(path.join('assets',file), path.join('dist','assets',file));
}
