// One-time: data.js の window.MD_META を data.json として書き出す
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const src = fs.readFileSync(path.join(root, 'data.js'), 'utf8');
// window.MD_META = { ... }; の中身を eval 的に取り出す
const match = src.match(/window\.MD_META\s*=\s*(\{[\s\S]*\});?\s*$/m);
if (!match) throw new Error('MD_META object not found');
const body = match[1];
// JSONではないので Function で評価
const data = Function(`"use strict"; return (${body});`)();
fs.writeFileSync(path.join(root, 'data.json'), JSON.stringify(data, null, 2), 'utf8');
console.log('Wrote data.json with', data.decks.length, 'decks');
