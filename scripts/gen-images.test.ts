import { describe, expect, it } from 'vitest';
import { iconPaths, ogImageHtml, squareIconSvg } from './gen-images.ts';

const ICON = `<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="12" />
  <path d="M1 1" /><path
    d="M2 2"
  /></svg>`;

describe('iconPaths', () => {
  it('keeps the drawing and drops the rounded background', () => {
    const paths = iconPaths(ICON);
    expect(paths).toContain('d="M1 1"');
    expect(paths).toContain('d="M2 2"');
    expect(paths).not.toContain('<rect');
  });

  it('throws when the icon has nothing to draw', () => {
    expect(() => iconPaths('<svg></svg>')).toThrow('no <path>');
  });
});

describe('squareIconSvg', () => {
  it('centres the drawing at the given scale on a full-bleed background', () => {
    const svg = squareIconSvg('<path d="M1 1" />', 0.8);
    expect(svg).toContain('<rect width="64" height="64" fill="#0b0d10" />');
    expect(svg).not.toContain('rx=');
    expect(svg).toContain('translate(6.4 6.4) scale(0.8)');
  });
});

describe('ogImageHtml', () => {
  it('carries the disclaimer and loads nothing external', () => {
    const html = ogImageHtml(ICON);
    expect(html).toContain('Not affiliated with Apple or Google');
    expect(html).not.toMatch(/(src|href)=["']?https?:/);
  });
});
