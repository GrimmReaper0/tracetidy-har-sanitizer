/** Explicit, user-run publication helper. Never asks for a token in chat. */
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { readFile, lstat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESCRIPTION = 'Offline HAR sanitizer + waterfall viewer + debugging briefs. Remove headers, cookies, bodies, and URL data locally. No uploads. Zero runtime dependencies.';
const TOPICS = ['har', 'har-sanitizer', 'har-viewer', 'privacy', 'offline', 'devtools', 'network-debugging', 'redaction', 'bug-report', 'javascript'];

function run(command, args, { optional = false, input, inherit = false } = {}) {
  const result = spawnSync(command, args, { cwd: root, input, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  if (result.error?.code === 'ENOENT') {
    if (optional) return null;
    throw new Error(`${command} is not installed. See docs/PUBLISH.md.`);
  }
  if (result.status !== 0) {
    if (optional) return null;
    // Do not echo arbitrary command output, paths, or credentials on failure.
    throw new Error(`${command} ${args[0] ?? ''} failed. Check local authentication/permissions and docs/PUBLISH.md.`);
  }
  return result.stdout?.trim() ?? '';
}

async function verifyManifest() {
  const manifest = JSON.parse(await readFile(resolve(root, 'release-manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.algorithm !== 'sha256' || !manifest.files || typeof manifest.files !== 'object') throw new Error('Invalid release manifest.');
  const files = Object.keys(manifest.files);
  if (!files.length) throw new Error('Empty release manifest.');
  for (const file of files) {
    if (posix.normalize(file) !== file || file.startsWith('../') || file.startsWith('/') || file.includes('\\') || file.includes('\0') || file === 'release-manifest.json' || file.startsWith('.git/')) throw new Error('Unsafe release manifest path.');
    const stat = await lstat(resolve(root, file));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('A release file is missing or is a symlink.');
    const actual = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
    if (actual !== manifest.files[file]) throw new Error('Release files differ from their manifest. Review your edits and regenerate it with node scripts/manifest.mjs.');
  }
  return files;
}

async function main() {
  const { values } = parseArgs({ options: {
    owner: { type: 'string', default: 'GrimmReaper0' },
    name: { type: 'string', default: 'tracetidy-har-sanitizer' },
    pages: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  }, strict: true });
  if (values.help) {
    console.log('Usage: node scripts/publish.mjs [--dry-run] [--pages] [--owner LOGIN] [--name NAME]\nCreates a NEW public repository. Requires local gh auth login. Does not overwrite existing repos.');
    return;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(values.owner) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(values.name)) throw new Error('Invalid owner or repository name.');
  const full = `${values.owner}/${values.name}`;
  if (values['dry-run']) {
    console.log(`DRY RUN: no account access or local/remote writes.\nTarget: ${full} (PUBLIC)\n1. Verify release manifest and run build, syntax checks, and Node tests.\n2. Require gh's authenticated login to match ${values.owner}.\n3. Refuse existing repository, origin remote, or staged unrelated files.\n4. Stage only manifest-listed files; create the initial commit as needed.\n5. gh repo create ${full} --public --source=. --remote=origin --push\n6. Set description and ${TOPICS.length} relevant topics.\n${values.pages ? '7. Request GitHub Pages setup and dispatch its deployment workflow.' : 'Pages setup is optional; add --pages to request it.'}`);
    return;
  }
  console.log(`Preparing NEW PUBLIC repository ${full}.`);
  await verifyManifest();
  run(process.execPath, ['scripts/build.mjs'], { inherit: true });
  run(process.execPath, ['scripts/check.mjs'], { inherit: true });
  const tests = (await readdir(resolve(root, 'tests'))).filter((name) => name.endsWith('.test.js')).map((name) => `tests/${name}`);
  run(process.execPath, ['--test', ...tests], { inherit: true });
  const files = await verifyManifest();
  run('git', ['--version']);
  run('gh', ['--version']);
  const profile = JSON.parse(run('gh', ['api', 'user']));
  if (profile.login?.toLowerCase() !== values.owner.toLowerCase() || !Number.isSafeInteger(profile.id)) throw new Error('Authenticated account does not match --owner. Switch accounts locally with gh auth switch.');
  if (run('gh', ['repo', 'view', full, '--json', 'nameWithOwner'], { optional: true }) !== null) throw new Error('The target repository already exists. No remote changes were made.');
  const gitStat = await lstat(resolve(root, '.git')).catch(() => null);
  if (gitStat && (!gitStat.isDirectory() || gitStat.isSymbolicLink())) throw new Error('Use a standalone checkout with a normal .git directory, not a linked worktree.');
  if (gitStat) {
    if (run('git', ['remote', 'get-url', 'origin'], { optional: true }) !== null) throw new Error('This checkout already has an origin remote. Refusing to replace it.');
    if (run('git', ['diff', '--cached', '--name-only'])) throw new Error('The index already contains staged changes. Unstage and review them before publishing.');
    if (run('git', ['branch', '--show-current']) !== 'main') throw new Error('Expected branch main. Switch branches deliberately before publishing.');
  } else run('git', ['init', '-b', 'main']);
  run('git', ['config', '--local', 'user.name', profile.login]);
  run('git', ['config', '--local', 'user.email', `${profile.id}+${profile.login}@users.noreply.github.com`]);
  // Never use git add -A: user captures outside the manifest must not be uploaded.
  run('git', ['add', '--', ...files, 'release-manifest.json']);
  if (run('git', ['diff', '--cached', '--name-only'])) run('git', ['commit', '-m', 'Release TraceTidy: offline HAR sanitizer and debugging workspace'], { inherit: true });
  run('gh', ['repo', 'create', full, '--public', '--description', DESCRIPTION, '--source=.', '--remote=origin', '--push'], { inherit: true });
  const edited = run('gh', ['repo', 'edit', full, ...TOPICS.flatMap((topic) => ['--add-topic', topic])], { optional: true });
  if (edited === null) console.warn('Repository created and pushed; topic configuration needs a retry. See docs/PUBLISH.md.');
  const url = run('gh', ['repo', 'view', full, '--json', 'url', '--jq', '.url']);
  console.log(`Published: ${url}`);
  console.log('CI has been triggered, not yet verified. Check the Actions tab before announcing the release.');
  if (values.pages) {
    let configured = run('gh', ['api', '--method', 'POST', `repos/${full}/pages`, '--input', '-'], { input: '{"build_type":"workflow"}', optional: true });
    if (configured === null) configured = run('gh', ['api', `repos/${full}/pages`], { optional: true });
    if (configured !== null && run('gh', ['workflow', 'run', 'pages.yml', '--repo', full, '--ref', 'main'], { optional: true }) !== null) {
      console.log('Pages deployment requested. It is not live until the Pages workflow succeeds.');
    } else console.warn('Repository is published. Enable Pages > GitHub Actions and run the Pages workflow manually; see docs/PUBLISH.md.');
  }
}

main().catch((error) => { console.error(`Publish stopped: ${error.message}`); process.exitCode = 1; });
