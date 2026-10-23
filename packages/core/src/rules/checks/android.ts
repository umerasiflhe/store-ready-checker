import type { AndroidFacts } from '../../android/analyze.ts';
import { primaryModule } from '../../android/analyze.ts';
import { PT_GNU_RELRO, PT_LOAD, type ProgramHeader } from '../../android/elf.ts';
import { inferFormFactor, type FormFactor } from '../../android/formFactor.ts';
import type { TargetSdkVersion } from '../../android/manifest.ts';
import type { NativeLibFacts } from '../../android/nativeLibs.ts';
import { buildFinding, resolveTimelineSeverity } from '../engine.ts';
import type { Finding, Rule } from '../types.ts';

export interface AndroidRuleCheckOptions {
  /** Overrides the manifest-inferred form factor (brief §3.3: user- or `--form-factor`-selected). */
  readonly formFactorOverride?: FormFactor;
}

export type AndroidRuleCheck = (
  facts: AndroidFacts,
  rule: Rule,
  asOf: string,
  options?: AndroidRuleCheckOptions,
) => readonly Finding[];

const SIXTEEN_K_ABIS = new Set(['arm64-v8a', 'x86_64']);
const THIRTY_TWO_TO_SIXTY_FOUR_BIT_ABI: Readonly<Record<string, string>> = {
  'armeabi-v7a': 'arm64-v8a',
  x86: 'x86_64',
};

function targetSdkOf(facts: AndroidFacts): TargetSdkVersion | undefined {
  return primaryModule(facts)?.manifest.targetSdkVersion;
}

/** A preview codename is treated as "≥ latest" (never a parse error, per the
 * android-bundle-analysis skill), so it always meets a numeric threshold. */
function meetsOrExceeds(target: TargetSdkVersion, threshold: number): boolean {
  return target.kind === 'preview' || target.value >= threshold;
}

function numberParam(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
}

function stringArrayParam(
  record: Record<string, unknown> | undefined,
  key: string,
): readonly string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function relevantNativeLibs(
  facts: AndroidFacts,
  abis: ReadonlySet<string>,
): readonly NativeLibFacts[] {
  return facts.nativeLibs.libraries.filter((lib) => abis.has(lib.abi));
}

/** An explicit override wins over the form factor inferred from the manifest's features. */
function formFactorOf(facts: AndroidFacts, options?: AndroidRuleCheckOptions): FormFactor {
  return (
    options?.formFactorOverride ??
    inferFormFactor(primaryModule(facts)?.manifest.usesFeatures ?? [])
  );
}

/**
 * The form factor (an explicit override wins over the manifest-inferred one) and the rule's
 * `targetSdkByFormFactor` threshold for it, or undefined when the rule has none for it.
 */
function targetSdkRequirement(
  facts: AndroidFacts,
  rule: Rule,
  options?: AndroidRuleCheckOptions,
): { formFactor: string; required: number } | undefined {
  const formFactor = formFactorOf(facts, options);
  const byFormFactor = rule.parameters?.targetSdkByFormFactor;
  const required =
    byFormFactor && typeof byFormFactor === 'object' && !Array.isArray(byFormFactor)
      ? (byFormFactor as Record<string, unknown>)[formFactor]
      : undefined;
  return typeof required === 'number' ? { formFactor, required } : undefined;
}

function checkAndTsdk001(
  facts: AndroidFacts,
  rule: Rule,
  asOf: string,
  options?: AndroidRuleCheckOptions,
): Finding[] {
  const target = targetSdkOf(facts);
  if (!target || target.kind === 'preview') return [];
  const requirement = targetSdkRequirement(facts, rule, options);
  if (!requirement || target.value >= requirement.required) return [];
  const { formFactor, required } = requirement;

  const resolved = resolveTimelineSeverity(rule.timeline, asOf);
  return [
    buildFinding(rule, resolved, {
      title: `targetSdkVersion ${String(target.value)} is below the required ${String(required)} for ${formFactor}`,
      message: 'Google Play requires targetSdkVersion to meet the minimum for this form factor.',
      evidence: {
        targetSdkVersion: target.value,
        targetSdkAssumed: primaryModule(facts)?.manifest.targetSdkAssumed ?? false,
        formFactor,
        required,
      },
    }),
  ];
}

function checkAndTsdk002(
  facts: AndroidFacts,
  rule: Rule,
  asOf: string,
  options?: AndroidRuleCheckOptions,
): Finding[] {
  const target = targetSdkOf(facts);
  if (!target || target.kind === 'preview') return [];
  const requirement = targetSdkRequirement(facts, rule, options);
  if (!requirement || target.value >= requirement.required) return [];
  const { formFactor, required } = requirement;

  const resolved = resolveTimelineSeverity(rule.timeline, asOf);
  return [
    buildFinding(rule, resolved, {
      title: `targetSdkVersion ${String(target.value)} is below ${String(required)} for ${formFactor}: new users on newer Android can't install it`,
      message: `Google Play shows an existing ${formFactor} app targeting below ${String(required)} only to users whose device runs Android at or below its target API level.`,
      evidence: {
        targetSdkVersion: target.value,
        targetSdkAssumed: primaryModule(facts)?.manifest.targetSdkAssumed ?? false,
        formFactor,
        required,
      },
    }),
  ];
}

function sixteenKApplies(facts: AndroidFacts, rule: Rule): boolean {
  const target = targetSdkOf(facts);
  const threshold = numberParam(rule.appliesWhen, 'targetSdkAtLeast');
  return target !== undefined && threshold !== undefined && meetsOrExceeds(target, threshold);
}

function abisFor(rule: Rule): ReadonlySet<string> {
  const abis = stringArrayParam(rule.appliesWhen, 'abis');
  return abis.length > 0 ? new Set(abis) : SIXTEEN_K_ABIS;
}

function checkAnd16k001(
  facts: AndroidFacts,
  rule: Rule,
  asOf: string,
  options?: AndroidRuleCheckOptions,
): Finding[] {
  if (!sixteenKApplies(facts, rule)) return [];
  const minAlignment = numberParam(rule.parameters, 'minAlignment');
  if (minAlignment === undefined) return [];

  const formFactor = formFactorOf(facts, options);
  const findings: Finding[] = [];
  for (const lib of relevantNativeLibs(facts, abisFor(rule))) {
    const misaligned = lib.elf?.programHeaders.filter(
      (ph) => ph.pType === PT_LOAD && ph.pAlign < BigInt(minAlignment),
    );
    if (!misaligned || misaligned.length === 0) continue;
    const resolved = resolveTimelineSeverity(rule.timeline, asOf, formFactor);
    findings.push(
      buildFinding(rule, resolved, {
        title: `PT_LOAD segment below ${String(minAlignment)}-byte alignment — ${lib.path}`,
        message:
          'Every PT_LOAD segment must be at least 16 KB aligned to support 16 KB page sizes.',
        evidence: {
          path: lib.path,
          abi: lib.abi,
          alignments: misaligned.map((ph) => Number(ph.pAlign)),
          formFactor,
        },
      }),
    );
  }
  return findings;
}

/** `true` when `relro`'s extent exactly matches a `PT_LOAD` segment's extent — the Android guide's
 * documented exception, since then no writable data shares the segment with the RELRO range. */
function relroInOwnLoadSegment(
  relro: ProgramHeader,
  programHeaders: readonly ProgramHeader[],
): boolean {
  return programHeaders.some(
    (ph) => ph.pType === PT_LOAD && ph.pVAddr === relro.pVAddr && ph.pMemSz === relro.pMemSz,
  );
}

function checkAnd16k002(
  facts: AndroidFacts,
  rule: Rule,
  asOf: string,
  options?: AndroidRuleCheckOptions,
): Finding[] {
  if (!sixteenKApplies(facts, rule)) return [];
  const relroAlignment = numberParam(rule.parameters, 'relroAlignment');
  if (relroAlignment === undefined) return [];

  const formFactor = formFactorOf(facts, options);
  const findings: Finding[] = [];
  for (const lib of relevantNativeLibs(facts, abisFor(rule))) {
    const programHeaders = lib.elf?.programHeaders ?? [];
    for (const relro of programHeaders.filter((ph) => ph.pType === PT_GNU_RELRO)) {
      if (relroInOwnLoadSegment(relro, programHeaders)) continue;
      const end = relro.pVAddr + relro.pMemSz;
      if (end % BigInt(relroAlignment) === 0n) continue;
      const resolved = resolveTimelineSeverity(rule.timeline, asOf, formFactor);
      findings.push(
        buildFinding(rule, resolved, {
          title: `GNU_RELRO segment ends unaligned — ${lib.path}`,
          message:
            'The GNU_RELRO segment must end 16 KB aligned, unless it occupies its own PT_LOAD segment.',
          evidence: { path: lib.path, abi: lib.abi, end: Number(end), formFactor },
        }),
      );
    }
  }
  return findings;
}

function checkAnd16k003(
  facts: AndroidFacts,
  rule: Rule,
  asOf: string,
  options?: AndroidRuleCheckOptions,
): Finding[] {
  if (facts.kind !== 'apk' || !sixteenKApplies(facts, rule)) return [];
  const zipAlignment = numberParam(rule.parameters, 'zipAlignment');
  if (zipAlignment === undefined) return [];

  const formFactor = formFactorOf(facts, options);
  const findings: Finding[] = [];
  for (const lib of relevantNativeLibs(facts, abisFor(rule))) {
    if (lib.stored !== true || lib.zipDataOffset === undefined) continue;
    if (lib.zipDataOffset % zipAlignment === 0) continue;
    const resolved = resolveTimelineSeverity(rule.timeline, asOf, formFactor);
    findings.push(
      buildFinding(rule, resolved, {
        title: `Stored native library is not zip-aligned to ${String(zipAlignment)} bytes — ${lib.path}`,
        message: 'Re-run zipalign with 16 KB alignment before signing the APK.',
        evidence: { path: lib.path, abi: lib.abi, zipDataOffset: lib.zipDataOffset, formFactor },
      }),
    );
  }
  return findings;
}

function checkAnd16k004(facts: AndroidFacts, rule: Rule, asOf: string): Finding[] {
  if (facts.kind !== 'aab') return [];
  const bundleConfig = facts.bundleConfig;
  if (!bundleConfig?.nativeLibrariesUncompressed || bundleConfig.nativeLibraryPageAlignment16K) {
    return [];
  }
  const resolved = resolveTimelineSeverity(rule.timeline, asOf);
  return [
    buildFinding(rule, resolved, {
      title: 'BundleConfig.pb does not request 16 KB native library alignment',
      message:
        'Native libraries are packaged uncompressed, but BundleConfig.pb does not request PAGE_ALIGNMENT_16K.',
      evidence: { nativeLibrariesUncompressed: bundleConfig.nativeLibrariesUncompressed },
    }),
  ];
}

function abisPresent(facts: AndroidFacts): ReadonlySet<string> {
  return new Set(facts.nativeLibs.libraries.map((lib) => lib.abi));
}

function checkAnd64bit001(facts: AndroidFacts, rule: Rule, asOf: string): Finding[] {
  const abis = abisPresent(facts);
  const findings: Finding[] = [];
  for (const [thirtyTwoBit, sixtyFourBit] of Object.entries(THIRTY_TWO_TO_SIXTY_FOUR_BIT_ABI)) {
    if (!abis.has(thirtyTwoBit) || abis.has(sixtyFourBit)) continue;
    const resolved = resolveTimelineSeverity(rule.timeline, asOf);
    findings.push(
      buildFinding(rule, resolved, {
        title: `${thirtyTwoBit} native code ships without a matching ${sixtyFourBit} library`,
        message: 'Google Play requires a matching 64-bit native library alongside any 32-bit one.',
        evidence: { abi: thirtyTwoBit, missingAbi: sixtyFourBit },
      }),
    );
  }
  return findings;
}

function checkAndInfo001(facts: AndroidFacts, rule: Rule, asOf: string): Finding[] {
  const abis = abisPresent(facts);
  if (abis.has('arm64-v8a') || abis.has('x86_64')) return [];
  const resolved = resolveTimelineSeverity(rule.timeline, asOf);
  return [
    buildFinding(rule, resolved, {
      title: 'No 64-bit-relevant native code detected',
      message:
        'The 16 KB page-size checks do not apply: no arm64-v8a or x86_64 native library was found.',
      evidence: { abis: [...abis] },
    }),
  ];
}

export const ANDROID_RULE_CHECKS: Record<string, AndroidRuleCheck> = {
  'AND-TSDK-001': checkAndTsdk001,
  'AND-TSDK-002': checkAndTsdk002,
  'AND-16K-001': checkAnd16k001,
  'AND-16K-002': checkAnd16k002,
  'AND-16K-003': checkAnd16k003,
  'AND-16K-004': checkAnd16k004,
  'AND-64BIT-001': checkAnd64bit001,
  'AND-INFO-001': checkAndInfo001,
};
