import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const genDir = join(repoRoot, 'packages/core/src/gen');

function buf(args: readonly string[]): void {
  execFileSync('npx', ['buf', ...args], { cwd: repoRoot, stdio: 'inherit' });
}

function trackedFilesUnder(root: string): string[] {
  return execFileSync('git', ['ls-files', '--', root], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function filesUnder(root: string): string[] {
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else {
        results.push(relative(root, absolute));
      }
    }
  };
  walk(root);
  return results;
}

function check(): void {
  const tmpOut = mkdtempSync(join(tmpdir(), 'storeready-proto-gen-'));
  try {
    buf(['generate', '-o', tmpOut]);
    const regeneratedGenDir = join(tmpOut, 'packages/core/src/gen');
    const committed = new Set(
      trackedFilesUnder('packages/core/src/gen').map((path) =>
        relative('packages/core/src/gen', path),
      ),
    );
    const regenerated = new Set(filesUnder(regeneratedGenDir));
    let stale = false;
    for (const path of new Set([...committed, ...regenerated])) {
      if (!committed.has(path)) {
        stale = true;
        console.error(`${join('packages/core/src/gen', path)} is generated but not committed`);
        continue;
      }
      if (!regenerated.has(path)) {
        stale = true;
        console.error(
          `${join('packages/core/src/gen', path)} no longer exists after regenerating from proto/`,
        );
        continue;
      }
      const committedContent = readFileSync(join(genDir, path), 'utf8');
      const regeneratedContent = readFileSync(join(regeneratedGenDir, path), 'utf8');
      if (committedContent !== regeneratedContent) {
        stale = true;
        console.error(`${join('packages/core/src/gen', path)} is stale relative to proto/`);
      }
    }
    if (stale) {
      console.error('Run: npm run proto:gen');
      process.exit(1);
    }
    console.log(`${genDir} is in sync with proto/.`);
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }
}

function main(): void {
  if (process.argv.includes('--check')) {
    check();
    return;
  }
  buf(['generate']);
  console.log(`Generated ${genDir} from proto/.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

export {};
