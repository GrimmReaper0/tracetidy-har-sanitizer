import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createDemoHar } from '../examples/demo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const core = (await read('src/core.js')).replace(/^export /gm, '');
const worker = `${core}\n${(await read('web/worker.js')).replace(/^import .*;\s*$/gm, '')}`;
const literal = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
const js = `(() => {\n'use strict';\nconst WORKER_SOURCE = ${literal(worker)};\nconst DEMO_TEXT = ${literal(JSON.stringify(createDemoHar()))};\n${await read('web/app.js')}\n})();\n`;
if (/<\/script/i.test(js)) throw new Error('Unsafe script closing tag in generated JavaScript.');
const hash = createHash('sha256').update(js).digest('base64');
const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; worker-src blob:; connect-src 'none'; img-src data: blob:; base-uri 'none'; form-action 'none'; object-src 'none'`;
const css = await read('web/style.css');
const html = (await read('web/index.html'))
  .replace('<!-- CSP -->', () => `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
  .replace('/* INLINE_CSS */', () => css)
  .replace('// INLINE_JS', () => js);
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/index.html'), html);
await writeFile(resolve(root, 'examples/demo.har'), JSON.stringify(createDemoHar(), null, 2) + '\n');
console.log(`Built dist/index.html (${Buffer.byteLength(html).toLocaleString('en-US')} bytes). No external assets.`);
