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

  // Once the Swift CLI ships a `check` command (Milestone 4), this runs both the TS core and the
  // CLI on each fixture in fixtures/files/, normalizes the JSON output (dropping tool.version),
  // and diffs it against the matching golden file. Until then — M1-M3 land TS-only fixtures —
  // this just confirms the golden files exist, rather than blocking verify.sh.
  console.log(
    `fixtures/expected/ has ${String(goldenFiles.length)} golden file(s); conformance will start ` +
      'diffing against the Swift CLI once it ships a check command (Milestone 4).',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}

export {};
