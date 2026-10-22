// Node-side helpers for fixture generators and tests. Lives outside `packages/core/src`
// because that package may not use Node builtins (it runs inside a browser Web Worker).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format as prettierFormat, resolveConfig as resolvePrettierConfig } from 'prettier';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const filesDir = join(repoRoot, 'fixtures', 'files');
const expectedDir = join(repoRoot, 'fixtures', 'expected');
const rulesDir = join(repoRoot, 'rules');

export function fixtureFilePath(name: string): string {
  return join(filesDir, name);
}

export function readFixtureBytes(name: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(readFileSync(fixtureFilePath(name)));
}

export function readFixtureBlob(name: string): Blob {
  return new Blob([readFixtureBytes(name)]);
}

export function writeFixtureFile(name: string, bytes: Uint8Array): void {
  mkdirSync(filesDir, { recursive: true });
  writeFileSync(fixtureFilePath(name), bytes);
}

export function readExpected(name: string): unknown {
  const text = readFileSync(join(expectedDir, `${name}.json`), 'utf8');
  return JSON.parse(text);
}

export async function writeExpected(name: string, value: unknown): Promise<void> {
  mkdirSync(expectedDir, { recursive: true });
  const filePath = join(expectedDir, `${name}.json`);
  const config = await resolvePrettierConfig(filePath);
  const formatted = await prettierFormat(JSON.stringify(value), { ...config, filepath: filePath });
  writeFileSync(filePath, formatted);
}

export interface RulesData {
  rulesVersion: string;
  rules: unknown[];
}

export function loadRulesData(): RulesData {
  return JSON.parse(readFileSync(join(rulesDir, 'rules.json'), 'utf8')) as RulesData;
}

export function loadRequiredReasonApis(): unknown {
  return JSON.parse(readFileSync(join(rulesDir, 'apple-required-reason-apis.json'), 'utf8'));
}

export function loadListedSdks(): unknown {
  return JSON.parse(readFileSync(join(rulesDir, 'apple-listed-sdks.json'), 'utf8'));
}
