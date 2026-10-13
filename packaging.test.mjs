import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {aurRecipe} from './packaging/aur/generate.mjs';

const checksum='a'.repeat(64),recipe=await aurRecipe('1.2.3',checksum);
assert.match(recipe,/pkgver=1\.2\.3/);
assert.ok(recipe.includes(`sha256sums=('${checksum}')`));
assert.ok(!recipe.includes('@VERSION@')&&!recipe.includes('@SHA256@'));
assert.ok(!recipe.includes('--no-sandbox'));
assert.match(recipe,/chmod 4755/);
await assert.rejects(aurRecipe('1.2.3-beta',checksum));
await assert.rejects(aurRecipe('1.2.3','SKIP'));
const desktop=await readFile('packaging/aur/flow.desktop','utf8');
assert.match(desktop,/Exec=flow-jugendplan\r?\n/);
assert.match(desktop,/Icon=flow-jugendplan\r?\n/);
const launcher=await readFile('packaging/aur/flow-launcher','utf8');
assert.match(launcher,/exec \/opt\/flow-jugendplan\/flow-jugendplan "\$@"/);
console.log('PASS: versioned AUR recipe, checksum, sandbox and desktop launcher.');
