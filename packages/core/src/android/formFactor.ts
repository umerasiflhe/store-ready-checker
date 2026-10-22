export type FormFactor = 'phone_tablet' | 'wear' | 'tv' | 'automotive' | 'xr';

const FEATURE_TO_FORM_FACTOR: ReadonlyMap<string, FormFactor> = new Map([
  ['android.hardware.type.watch', 'wear'],
  ['android.software.leanback', 'tv'],
  ['android.hardware.type.automotive', 'automotive'],
  ['android.software.xr.api.openxr', 'xr'],
  ['android.software.xr.api.spatial', 'xr'],
]);

/** Infers the Play form factor from `<uses-feature>` names, per the android-bundle-analysis
 * skill's table. Defaults to `phone_tablet` when nothing more specific is declared. */
export function inferFormFactor(usesFeatures: readonly string[]): FormFactor {
  for (const feature of usesFeatures) {
    const formFactor = FEATURE_TO_FORM_FACTOR.get(feature);
    if (formFactor) {
      return formFactor;
    }
  }
  return 'phone_tablet';
}
