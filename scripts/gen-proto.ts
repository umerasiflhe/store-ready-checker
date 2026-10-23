import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const genDirs = ['packages/core/src/gen', 'cli/Sources/StoreReadyCore/Generated'];

function buf(args: readonly string[]): void {
  execFileSync('npx', ['buf', ...args], { cwd: repoRoot, stdio: 'inherit' });
}

/** `buf.gen.yaml`'s Swift plugin entry points at this built binary, mirroring how its TS plugin
 * entry (`protoc-gen-es`) resolves to an npm-installed one — built once per invocation rather
 * than committed, since it's toolchain output, not source. */
function buildProtocGenSwift(): void {
  execFileSync(
    'swift',
    ['build', '--package-path', 'cli', '--product', 'protoc-gen-swift', '-c', 'release'],
    { cwd: repoRoot, stdio: 'inherit' },
  );
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
  if (existsSync(root)) {
    walk(root);
  }
  return results;
}

function checkGenDir(genDir: string, tmpOut: string): boolean {
  const regeneratedGenDir = join(tmpOut, genDir);
  const committed = new Set(trackedFilesUnder(genDir).map((path) => relative(genDir, path)));
  const regenerated = new Set(existsSync(regeneratedGenDir) ? filesUnder(regeneratedGenDir) : []);
  let stale = false;
  for (const path of new Set([...committed, ...regenerated])) {
    if (!committed.has(path)) {
      stale = true;
      console.error(`${join(genDir, path)} is generated but not committed`);
      continue;
    }
    if (!regenerated.has(path)) {
      stale = true;
      console.error(`${join(genDir, path)} no longer exists after regenerating from proto/`);
      continue;
    }
    const committedContent = readFileSync(join(repoRoot, genDir, path), 'utf8');
    const regeneratedContent = readFileSync(join(regeneratedGenDir, path), 'utf8');
    if (committedContent !== regeneratedContent) {
      stale = true;
      console.error(`${join(genDir, path)} is stale relative to proto/`);
    }
  }
  return stale;
}

function check(): void {
  buildProtocGenSwift();
  const tmpOut = mkdtempSync(join(tmpdir(), 'storeready-proto-gen-'));
  try {
    buf(['generate', '-o', tmpOut]);
    let stale = false;
    for (const genDir of genDirs) {
      if (checkGenDir(genDir, tmpOut)) {
        stale = true;
      }
    }
    if (stale) {
      console.error('Run: npm run proto:gen');
      process.exit(1);
    }
    console.log(`${genDirs.join(' and ')} are in sync with proto/.`);
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }
}

function main(): void {
  if (process.argv.includes('--check')) {
    check();
    return;
  }
  buildProtocGenSwift();
  buf(['generate']);
  console.log(`Generated ${genDirs.join(' and ')} from proto/.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

export {};
