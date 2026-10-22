import { describe, expect, it } from 'vitest';
import { inferFormFactor } from './formFactor.ts';

describe('inferFormFactor', () => {
  it('defaults to phone_tablet when nothing distinctive is declared', () => {
    expect(inferFormFactor([])).toBe('phone_tablet');
    expect(inferFormFactor(['android.hardware.camera'])).toBe('phone_tablet');
  });

  it('infers wear from android.hardware.type.watch', () => {
    expect(inferFormFactor(['android.hardware.type.watch'])).toBe('wear');
  });

  it('infers tv from android.software.leanback', () => {
    expect(inferFormFactor(['android.software.leanback'])).toBe('tv');
  });

  it('infers automotive from android.hardware.type.automotive', () => {
    expect(inferFormFactor(['android.hardware.type.automotive'])).toBe('automotive');
  });

  it('infers xr from an XR feature', () => {
    expect(inferFormFactor(['android.software.xr.api.openxr'])).toBe('xr');
    expect(inferFormFactor(['android.software.xr.api.spatial'])).toBe('xr');
  });

  it('picks the first matching feature when multiple are declared', () => {
    expect(inferFormFactor(['android.hardware.camera', 'android.hardware.type.watch'])).toBe(
      'wear',
    );
  });
});
