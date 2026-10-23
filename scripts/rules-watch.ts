// Hashes the relevant text of every official page in rules/sources.lock.json so a rules-change
// issue can be opened when Apple or Google edit a page our rules depend on (brief §8).
//
// This is maintainer/CI tooling run by Node — it is never bundled into apps/web or packages/core,
// so it doesn't touch hard constraint 1.
//
//   npx tsx scripts/rules-watch.ts --check [--drift-out drift.json]   exit 1 on any drift
//   npx tsx scripts/rules-watch.ts --update                           accept current hashes
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const lockPath = join(repoRoot, 'rules/sources.lock.json');

export interface SourceEntry {
  url: string;
  /**
   * What to fetch instead of `url`: Apple's DocC JSON for a JS-rendered page, or a devsite page
   * pinned to English with `?hl=en` (devsite otherwise localises by visitor).
   */
  fetchUrl?: string;
  sha256: string | null;
  checkedAt: string | null;
}

export interface SourcesLock {
  note: string;
  sources: SourceEntry[];
}

export interface Drift {
  url: string;
  previous: string | null;
  current: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The slice of `html` from the first `startMarker` to the matching close of its element. */
function sliceElement(html: string, startMarker: RegExp, tag: string): string | undefined {
  const start = html.search(startMarker);
  if (start < 0) return undefined;
  const open = new RegExp(`<${tag}\\b`, 'gi');
  const close = new RegExp(`</${tag}\\s*>`, 'gi');
  let depth = 0;
  let cursor = start;
  for (;;) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(html);
    const nextClose = close.exec(html);
    if (!nextClose) return html.slice(start);
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + 1;
    } else {
      depth -= 1;
      cursor = nextClose.index + nextClose[0].length;
      if (depth === 0) return html.slice(start, cursor);
    }
  }
}

/**
 * The page's article text: devsite's article body on developer.android.com, `<main>` elsewhere,
 * else `<body>` — with scripts, styles and page chrome removed, so a redesign of navigation or a
 * rotated analytics snippet doesn't count as a rules change.
 */
export function extractHtmlText(html: string): string {
  const region =
    sliceElement(html, /<div[^>]*class="[^"]*devsite-article-body/i, 'div') ??
    sliceElement(html, /<main\b/i, 'main') ??
    sliceElement(html, /<body\b/i, 'body') ??
    html;
  const withoutNoise = region
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|nav|header|footer)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  return normalizeText(decodeEntities(withoutNoise.replace(/<[^>]+>/g, ' ')));
}

function collectDocCText(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectDocCText(child, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'text' || key === 'code') && typeof value === 'string') out.push(value);
    else if (key === 'code' && Array.isArray(value)) {
      out.push(...value.filter((line): line is string => typeof line === 'string'));
    } else collectDocCText(value, out);
  }
}

/**
 * The prose of an Apple DocC JSON document: its abstract and content sections. `references` and
 * `metadata` are skipped — they hold sidebar links and build identifiers that change with
 * unrelated pages.
 */
export function extractDocCText(json: string): string {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return normalizeText(json);
  }
  if (doc === null || typeof doc !== 'object') return '';
  const record = doc as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ['abstract', 'primaryContentSections', 'sections']) {
    collectDocCText(record[key], out);
  }
  return normalizeText(out.join(' '));
}

export function extractText(body: string, contentType: string): string {
  return contentType.includes('json') ? extractDocCText(body) : extractHtmlText(body);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function findDrift(
  sources: readonly SourceEntry[],
  currentHashes: ReadonlyMap<string, string>,
): Drift[] {
  const drift: Drift[] = [];
  for (const source of sources) {
    const current = currentHashes.get(source.url);
    if (current !== undefined && current !== source.sha256) {
      drift.push({ url: source.url, previous: source.sha256, current });
    }
  }
  return drift;
}

async function hashSource(source: SourceEntry): Promise<string> {
  const response = await fetch(source.fetchUrl ?? source.url, {
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'store-ready-rules-watch (+https://github.com/umerasiflhe/store-ready-checker)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${source.url}: HTTP ${String(response.status)}`);
  }
  const text = extractText(await response.text(), response.headers.get('content-type') ?? '');
  if (text.length < 200) {
    // Far too little text means the extraction broke (a redesign or a JS-only page), not that
    // the rules changed — fail loudly instead of hashing an empty string.
    throw new Error(`${source.url}: only ${String(text.length)} characters of text extracted`);
  }
  return sha256(text);
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const update = process.argv.includes('--update');
  const driftOut = argValue('--drift-out');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as SourcesLock;

  const hashes = new Map<string, string>();
  for (const source of lock.sources) {
    hashes.set(source.url, await hashSource(source));
  }

  if (update) {
    const today = new Date().toISOString().slice(0, 10);
    for (const source of lock.sources) {
      const current = hashes.get(source.url);
      if (current !== undefined && current !== source.sha256) {
        source.sha256 = current;
        source.checkedAt = today;
      }
    }
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    console.log(`Updated ${lockPath}.`);
    return;
  }

  const drift = findDrift(lock.sources, hashes);
  if (driftOut !== undefined) writeFileSync(driftOut, `${JSON.stringify(drift, null, 2)}\n`);
  if (drift.length === 0) {
    console.log(`No drift: all ${String(lock.sources.length)} watched sources match.`);
    return;
  }
  for (const entry of drift) {
    console.error(
      `DRIFT ${entry.url}\n  was ${entry.previous ?? '(never hashed)'}\n  now ${entry.current}`,
    );
  }
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
