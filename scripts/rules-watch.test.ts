import { describe, expect, it } from 'vitest';
import {
  extractDocCText,
  extractHtmlText,
  extractText,
  findDrift,
  normalizeText,
  sha256,
} from './rules-watch.ts';

describe('extractHtmlText', () => {
  it('uses the devsite article body and ignores the surrounding page chrome', () => {
    const html = `<html><body><nav>Docs Home</nav>
      <div class="devsite-article-body clearfix"><h1>Target API level</h1>
        <div class="note"><p>Apps must target   API 35.</p></div></div>
      <footer>Last updated 2026-10-01 UTC.</footer></body></html>`;
    expect(extractHtmlText(html)).toBe('Target API level Apps must target API 35.');
  });

  it('uses the Google Help article content, ignoring the rest of the body', () => {
    const html = `<body><script nonce="abc123">gtag();</script><header>Play Console Help</header>
      <div class="article-content-container"><div class="cc"><p>TV: Required as of 1 Aug, 2026.</p>
      </div></div><div class="article-survey-container">Was this helpful?</div></body>`;
    expect(extractHtmlText(html)).toBe('TV: Required as of 1 Aug, 2026.');
  });

  it('falls back to <main>, dropping scripts, styles, comments and nav', () => {
    const html = `<body><header>Apple Developer</header><main id="m">
      <script>window.analytics = 1;</script><style>p{}</style><!-- build 123 -->
      <nav>Breadcrumb</nav><p>Xcode&nbsp;26 &amp; the iOS&#x20;26 SDK &#8212; required.</p>
      </main></body>`;
    expect(extractHtmlText(html)).toBe('Xcode 26 & the iOS 26 SDK — required.');
  });

  it('falls back to <body> when there is no article or main element', () => {
    expect(extractHtmlText('<html><body><p>Hello</p></body></html>')).toBe('Hello');
  });

  it('is stable across whitespace-only changes', () => {
    const a = extractHtmlText('<main><p>One\n  two</p></main>');
    const b = extractHtmlText('<main>\n<p>One two</p>\n</main>');
    expect(sha256(a)).toBe(sha256(b));
  });
});

describe('extractDocCText', () => {
  const doc = {
    metadata: { title: 'Describing use of required reason API', build: 'abc123' },
    abstract: [{ type: 'text', text: 'Ensure your use of covered API is consistent.' }],
    primaryContentSections: [
      {
        kind: 'content',
        content: [
          { type: 'paragraph', inlineContent: [{ type: 'text', text: 'Use reason 35F9.1.' }] },
          { type: 'codeListing', code: ['<key>NSPrivacyAccessedAPIType</key>'] },
        ],
      },
    ],
    references: { sidebar: { title: 'Unrelated page that changes often' } },
  };

  it('keeps the abstract and content and skips metadata and references', () => {
    expect(extractDocCText(JSON.stringify(doc))).toBe(
      'Ensure your use of covered API is consistent. Use reason 35F9.1. <key>NSPrivacyAccessedAPIType</key>',
    );
  });

  it('never throws on malformed JSON', () => {
    expect(extractDocCText('{not json')).toBe('{not json');
    expect(extractDocCText('null')).toBe('');
  });

  it('is picked by extractText for JSON content types', () => {
    expect(extractText(JSON.stringify(doc), 'application/json')).toContain('35F9.1');
    expect(extractText('<main>x</main>', 'text/html; charset=utf-8')).toBe('x');
  });
});

describe('findDrift', () => {
  it('reports sources whose hash changed or was never recorded', () => {
    const sources = [
      { url: 'https://a', sha256: 'same', checkedAt: '2026-10-22' },
      { url: 'https://b', sha256: 'old', checkedAt: '2026-10-22' },
      { url: 'https://c', sha256: null, checkedAt: null },
    ];
    const current = new Map([
      ['https://a', 'same'],
      ['https://b', 'new'],
      ['https://c', 'first'],
    ]);
    expect(findDrift(sources, current)).toEqual([
      { url: 'https://b', previous: 'old', current: 'new' },
      { url: 'https://c', previous: null, current: 'first' },
    ]);
  });
});

describe('normalizeText', () => {
  it('collapses all whitespace runs', () => {
    expect(normalizeText('  a\n\t b  ')).toBe('a b');
  });
});
