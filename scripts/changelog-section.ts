// Prints one version's section of CHANGELOG.md (Keep a Changelog format) for GitHub Release
// notes: `npx tsx scripts/changelog-section.ts 0.9.0`. Exits 1 if the section is missing or empty.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** The body under `## [version]`, up to the next `## ` heading or link-reference block. */
export function changelogSection(changelog: string, version: string): string | undefined {
  const lines = changelog.split('\n');
  const escaped = version.replace(/\./g, '\\.');
  const start = lines.findIndex((line) => new RegExp(`^## \\[${escaped}\\]`).test(line));
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## ') || /^\[[^\]]+\]:\s/.test(line));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return body === '' ? undefined : body;
}

function main(): void {
  const version = (process.argv[2] ?? '').replace(/^v/, '');
  const section = changelogSection(readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8'), version);
  if (section === undefined) {
    console.error(`CHANGELOG.md has no non-empty "## [${version}]" section.`);
    process.exit(1);
  }
  console.log(section);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
