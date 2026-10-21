import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatMarkdown,
  loadRules,
  renderDoc,
  renderTable,
  replaceReadmeBlock,
} from './gen-rules-doc.ts';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const EXPECTED_YEAR = '2026';
const EXPECTED_HOLDER = 'Muhammad Umer Asif';

const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const REQUIRED_TOP_LEVEL_FILES = [
  'README.md',
  'LICENSE',
  '.gitignore',
  '.gitattributes',
  '.env.example',
];
const FIXTURE_FILE_LIMIT_BYTES = 200 * 1024;
const REPO_FILE_LIMIT_BYTES = 5 * 1024 * 1024;
const BINARY_FILE_EXT = /\.(ipa|aab|apk)$/;
const BINARY_DIR_SEGMENT = /\.(xcarchive|dSYM)(\/|$)/;

const problems: string[] = [];

function readRepoFile(relativePath: string): string | undefined {
  try {
    return readFileSync(join(repoRoot, relativePath), 'utf8');
  } catch {
    return undefined;
  }
}

function gitLsFiles(...args: string[]): string[] {
  return execFileSync('git', ['ls-files', ...args], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function checkRequiredFiles(): void {
  for (const file of REQUIRED_TOP_LEVEL_FILES) {
    if (readRepoFile(file) === undefined) {
      problems.push(`Missing required file: ${file}`);
    }
  }
}

function checkLicense(): void {
  const license = readRepoFile('LICENSE');
  if (license === undefined) return;

  if (!license.startsWith('MIT License')) {
    problems.push('LICENSE does not start with "MIT License"');
  }

  const copyrightMatch = /Copyright \(c\) (\d{4}) (.+)/.exec(license);
  if (!copyrightMatch) {
    problems.push('LICENSE is missing a recognizable "Copyright (c) YYYY Holder" line');
  } else {
    const [, year, holderRaw] = copyrightMatch;
    const holder = (holderRaw ?? '').trim();
    if (year !== EXPECTED_YEAR) {
      problems.push(`LICENSE year is "${year ?? ''}", expected "${EXPECTED_YEAR}"`);
    }
    if (holder !== EXPECTED_HOLDER) {
      problems.push(`LICENSE holder is "${holder}", expected "${EXPECTED_HOLDER}"`);
    }
  }

  if (!normalizeWhitespace(license).includes(normalizeWhitespace(MIT_BODY))) {
    problems.push(
      'LICENSE body text does not match the canonical MIT License text (ignoring whitespace)',
    );
  }
}

function checkPackageJsonLicenses(): void {
  const packageJsonFiles = gitLsFiles().filter((file) => file.endsWith('package.json'));
  for (const file of packageJsonFiles) {
    const content = readRepoFile(file);
    if (content === undefined) continue;
    const parsed = JSON.parse(content) as { license?: unknown };
    if (parsed.license !== 'MIT') {
      problems.push(`${file} is missing "license": "MIT"`);
    }
  }
}

function checkNoStrayBinaries(): void {
  for (const file of gitLsFiles()) {
    const isBinary = BINARY_FILE_EXT.test(file) || BINARY_DIR_SEGMENT.test(file);
    if (isBinary && !file.startsWith('fixtures/files/')) {
      problems.push(`Tracked app binary outside fixtures/files/: ${file}`);
    }
  }
}

function checkFileSizes(): void {
  for (const file of gitLsFiles()) {
    const absolutePath = join(repoRoot, file);
    if (!existsSync(absolutePath)) continue;
    const size = statSync(absolutePath).size;
    if (file.startsWith('fixtures/files/') && size > FIXTURE_FILE_LIMIT_BYTES) {
      problems.push(
        `${file} is ${String(size)} bytes, over the ${String(FIXTURE_FILE_LIMIT_BYTES)} byte fixture limit`,
      );
    }
    if (size > REPO_FILE_LIMIT_BYTES) {
      problems.push(
        `${file} is ${String(size)} bytes, over the ${String(REPO_FILE_LIMIT_BYTES)} byte repo-wide limit`,
      );
    }
  }
}

function checkNoIgnoredTrackedFiles(): void {
  const ignoredTracked = gitLsFiles('--cached', '--ignored', '--exclude-standard');
  for (const file of ignoredTracked) {
    problems.push(`Tracked file matches .gitignore: ${file}`);
  }
}

function checkReadmeLinks(): void {
  const readme = readRepoFile('README.md');
  if (readme === undefined) return;

  const linkRegex = /]\(([^)]+)\)/g;
  for (const match of readme.matchAll(linkRegex)) {
    const target = match[1] ?? '';
    if (/^https?:\/\//.test(target) || target.startsWith('#') || target === '') continue;
    const [pathPart] = target.split('#');
    if (!pathPart) continue;
    if (!existsSync(join(repoRoot, pathPart))) {
      problems.push(`README.md links to a path that doesn't resolve: ${pathPart}`);
    }
  }
}

async function checkRulesBlockFreshness(): Promise<void> {
  if (!existsSync(join(repoRoot, 'rules/rules.json'))) return;

  const data = loadRules();
  const newRulesDoc = await formatMarkdown(renderDoc(data));
  const currentRulesDoc = readRepoFile('docs/RULES.md');
  if (currentRulesDoc !== newRulesDoc) {
    problems.push('docs/RULES.md is stale — run: npm run rules:doc');
  }

  const currentReadme = readRepoFile('README.md') ?? '';
  const newReadme = await formatMarkdown(
    replaceReadmeBlock(currentReadme, renderTable(data.rules)),
  );
  if (currentReadme !== newReadme) {
    problems.push('README.md rules block is stale — run: npm run rules:doc');
  }
}

checkRequiredFiles();
checkLicense();
checkPackageJsonLicenses();
checkNoStrayBinaries();
checkFileSizes();
checkNoIgnoredTrackedFiles();
checkReadmeLinks();
await checkRulesBlockFreshness();

if (problems.length > 0) {
  console.error('Repo check failed:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log('Repo check passed.');
