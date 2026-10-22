// Data files: every golden report with `ok: true` must validate against
// schema/report.schema.json (docs/BUILD_BRIEF.md §7.7, "Data files" row).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Ajv2020Module from 'ajv/dist/2020.js';
import ajvFormatsDefault from 'ajv-formats';
import type { FormatsPlugin } from 'ajv-formats';
import { describe, expect, it } from 'vitest';

const Ajv2020 = Ajv2020Module.Ajv2020;
const addFormats = ajvFormatsDefault as unknown as FormatsPlugin;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const expectedDir = join(repoRoot, 'fixtures', 'expected');
const schemaPath = join(repoRoot, 'schema', 'report.schema.json');

const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const goldenFiles = readdirSync(expectedDir).filter((name) => name.endsWith('.json'));

describe('golden reports match schema/report.schema.json', () => {
  for (const fileName of goldenFiles) {
    it(`golden report: ${fileName}`, () => {
      const golden = JSON.parse(readFileSync(join(expectedDir, fileName), 'utf8')) as {
        ok: boolean;
        value?: unknown;
      };
      if (!golden.ok) {
        return;
      }
      const valid = validate(golden.value);
      if (!valid) {
        const messages = (validate.errors ?? []).map(
          (error) => `${error.instancePath} ${error.message ?? ''}`,
        );
        throw new Error(messages.join('\n'));
      }
      expect(valid).toBe(true);
    });
  }
});
