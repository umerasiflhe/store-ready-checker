import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedDir = join(repoRoot, 'fixtures/expected');

function main(): void {
  if (!existsSync(expectedDir)) {
    console.log('No fixtures/expected/ yet — conformance has nothing to check.');
    return;
  }

  const goldenFiles = readdirSync(expectedDir).filter((file) => file.endsWith('.json'));
  if (goldenFiles.length === 0) {
    console.log('fixtures/expected/ is empty — conformance has nothing to check.');
    return;
  }

  // Once packages/core and cli/ ship a `check` command (Milestones 1-4), this
  // runs both on each fixture in fixtures/files/, normalizes the JSON output
  // (dropping tool.version), and diffs it against the matching golden file.
  throw new Error(
    `fixtures/expected/ has ${String(goldenFiles.length)} golden file(s) but conformance.ts ` +
      'does not yet run the TS core or Swift CLI against them — implement this in Milestone 4.',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

export {};
