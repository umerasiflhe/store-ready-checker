import { describe, expect, it } from 'vitest';
import { changelogSection } from './changelog-section.ts';

const changelog = `# Changelog

## [Unreleased]

## [0.9.0] - 2026-10-23

### Added

- Pages deploy.

## [0.1.0] - 2026-10-01

- Old.

[0.9.0]: https://example.com/v0.9.0
`;

describe('changelogSection', () => {
  it('returns the body of the requested version up to the next heading', () => {
    expect(changelogSection(changelog, '0.9.0')).toBe('### Added\n\n- Pages deploy.');
  });

  it('stops at the link-reference block for the last section', () => {
    expect(changelogSection(changelog, '0.1.0')).toBe('- Old.');
  });

  it('returns undefined for a missing or empty section', () => {
    expect(changelogSection(changelog, '1.0.0')).toBeUndefined();
    expect(changelogSection(changelog, 'Unreleased')).toBeUndefined();
  });

  it('does not treat dots as wildcards', () => {
    expect(changelogSection(changelog, '0x9x0')).toBeUndefined();
  });
});
