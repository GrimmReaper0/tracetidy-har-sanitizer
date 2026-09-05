import { readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootFiles = ['package.json', 'package-lock.json', 'requirements-dev.txt', 'README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', '.gitignore', '.gitattributes', '.editorconfig'];
const files = [...rootFiles];
for (const dir of ['src', 'bin', 'scripts', 'web', 'tests', 'examples', 'docs', 'dist', '.github']) {
  for (const item of await readdir(resolve(root, dir), { recursive: true })) {
    const path = `${dir}/${item.replaceAll('\\', '/')}`;
    if (path.includes('/__pycache__/') || path.endsWith('.pyc')) continue;
    const stat = await lstat(resolve(root, path));
    if (stat.isSymbolicLink()) throw new Error('Release directories must not contain symlinks.');
    if (stat.isFile()) {
      if (/\.har$/i.test(path) && path !== 'examples/demo.har') throw new Error('Refusing a non-demo HAR in the release.');
      files.push(path);
    }
  }
}
const manifest = { version: 1, algorithm: 'sha256', files: {} };
for (const path of files.sort()) manifest.files[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
await writeFile(resolve(root, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Recorded ${files.length} release file hashes. Inspect this manifest before publishing.`);
