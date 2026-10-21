import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(repoRoot, 'rules');
const destDir = join(repoRoot, 'cli/Sources/StoreReadyCore/Resources');

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const files = readdirSync(sourceDir).filter((file) => file.endsWith('.json'));

  if (!existsSync(destDir)) {
    if (checkOnly) {
      console.error(`${destDir} does not exist. Run: npm run rules:sync`);
      process.exit(1);
    }
    mkdirSync(destDir, { recursive: true });
  }

  let stale = false;
  for (const file of files) {
    const srcPath = join(sourceDir, file);
    const destPath = join(destDir, file);
    const srcContent = readFileSync(srcPath, 'utf8');
    const destContent = existsSync(destPath) ? readFileSync(destPath, 'utf8') : undefined;
    if (srcContent !== destContent) {
      stale = true;
      if (checkOnly) {
        console.error(`${destPath} is stale relative to ${srcPath}`);
      } else {
        writeFileSync(destPath, srcContent);
      }
    }
  }

  if (checkOnly) {
    if (stale) process.exit(1);
    console.log('cli/Sources/StoreReadyCore/Resources is in sync with rules/.');
    return;
  }

  console.log(`Synced ${String(files.length)} rules file(s) into ${destDir}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

export {};
