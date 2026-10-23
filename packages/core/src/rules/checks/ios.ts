import type { BundleFacts, IosFacts } from '../../ios/analyze.ts';
import { frameworkNameOf, isListedSdk, type ListedSdksSeed } from '../../ios/listedSdks.ts';
import { declaredCategories, hasUnknownCategoryOrReason } from '../../ios/privacyManifest.ts';
import { undeclaredUsage, type RequiredReasonSeed } from '../../ios/requiredReason.ts';
import { compareVersions } from '../../util/version.ts';
import { buildFinding, resolveTimelineSeverity } from '../engine.ts';
import type { Finding, Rule } from '../types.ts';

export interface IosCheckSeeds {
  readonly listedSdks: ListedSdksSeed;
  readonly requiredReasonApis: RequiredReasonSeed;
}

export type IosRuleCheck = (
  facts: IosFacts,
  rule: Rule,
  asOf: string,
  seeds: IosCheckSeeds,
) => readonly Finding[];

function checkIosSdk001(facts: IosFacts, rule: Rule, asOf: string): Finding[] {
  const findings: Finding[] = [];
  for (const bundle of facts.bundles) {
    if (bundle.kind !== 'app' && bundle.kind !== 'appex') {
      continue;
    }
    const dtXcode = parseDtXcode(bundle.info.dtXcode);
    const sdkVersion = parseSdkVersion(bundle.info.dtPlatformVersion, bundle.info.dtSdkName);
    if (dtXcode === undefined || sdkVersion === undefined) {
      continue;
    }
    if (dtXcode >= 2600 && sdkVersion >= 26) {
      continue;
    }
    const resolved = resolveTimelineSeverity(rule.timeline, asOf);
    findings.push(
      buildFinding(rule, resolved, {
        title: `Built with an SDK older than iOS 26 — ${bundle.path}`,
        message:
          'App Store Connect requires every app and embedded app extension to be built with Xcode 26 or later, using the iOS 26 SDK or later.',
        evidence: {
          bundle: bundle.path,
          DTXcode: bundle.info.dtXcode,
          DTSDKName: bundle.info.dtSdkName,
          DTPlatformVersion: bundle.info.dtPlatformVersion,
        },
      }),
    );
  }
  return findings;
}

function parseDtXcode(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

function parseSdkVersion(
  platformVersion: string | undefined,
  sdkName: string | undefined,
): number | undefined {
  if (platformVersion !== undefined) {
    const value = Number(platformVersion);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  const match = sdkName !== undefined ? /(\d+(?:\.\d+)?)$/.exec(sdkName) : null;
  return match ? Number(match[1]) : undefined;
}

function checkIosMinos001(facts: IosFacts, rule: Rule, asOf: string): Finding[] {
  const app = facts.bundles.find((bundle) => bundle.kind === 'app');
  const minimumOSVersion = app?.info.minimumOSVersion;
  const required = rule.parameters?.minimumOSVersion;
  if (!app || minimumOSVersion === undefined || typeof required !== 'string') {
    return [];
  }
  const comparison = compareVersions(minimumOSVersion, required);
  if (Number.isNaN(comparison) || comparison >= 0) {
    return [];
  }
  const resolved = resolveTimelineSeverity(rule.timeline, asOf);
  return [
    buildFinding(rule, resolved, {
      title: `MinimumOSVersion ${minimumOSVersion} is below the required ${required}`,
      message: `App Store Connect requires MinimumOSVersion to be at least ${required}.`,
      evidence: { bundle: app.path, MinimumOSVersion: minimumOSVersion },
    }),
  ];
}

function bundlesWithExecutables(facts: IosFacts): readonly BundleFacts[] {
  return facts.bundles.filter((bundle) => bundle.machO !== undefined);
}

function checkIosPriv001(facts: IosFacts, rule: Rule, asOf: string): Finding[] {
  const findings: Finding[] = [];
  for (const bundle of bundlesWithExecutables(facts)) {
    if (bundle.requiredReasonUsage.length === 0 || bundle.privacyManifest !== undefined) {
      continue;
    }
    const resolved = resolveTimelineSeverity(rule.timeline, asOf);
    findings.push(
      buildFinding(rule, resolved, {
        title: `Required-reason API used without a privacy manifest — ${bundle.path}`,
        message:
          'A required-reason API was detected, but this bundle has no PrivacyInfo.xcprivacy privacy manifest.',
        evidence: {
          bundle: bundle.path,
          categories: bundle.requiredReasonUsage.map((usage) => usage.category),
        },
      }),
    );
  }
  return findings;
}

function checkIosPriv002(
  facts: IosFacts,
  rule: Rule,
  asOf: string,
  seeds: IosCheckSeeds,
): Finding[] {
  const findings: Finding[] = [];
  for (const bundle of bundlesWithExecutables(facts)) {
    if (!bundle.privacyManifest || bundle.privacyManifest.malformed) {
      continue;
    }
    const declared = declaredCategories(bundle.privacyManifest);
    const undeclared = undeclaredUsage(
      bundle.requiredReasonUsage,
      declared,
      seeds.requiredReasonApis,
    );
    if (undeclared.length === 0) {
      continue;
    }
    const resolved = resolveTimelineSeverity(rule.timeline, asOf);
    findings.push(
      buildFinding(rule, resolved, {
        title: `Required-reason API category not declared — ${bundle.path}`,
        message:
          'A required-reason API category was detected that is not declared in NSPrivacyAccessedAPITypes.',
        evidence: { bundle: bundle.path, categories: undeclared.map((usage) => usage.category) },
      }),
    );
  }
  return findings;
}

function checkIosPriv003(
  facts: IosFacts,
  rule: Rule,
  asOf: string,
  seeds: IosCheckSeeds,
): Finding[] {
  const findings: Finding[] = [];
  for (const bundle of facts.bundles) {
    const manifest = bundle.privacyManifest;
    if (!manifest) {
      continue;
    }
    const unknown =
      !manifest.malformed && hasUnknownCategoryOrReason(manifest, seeds.requiredReasonApis);
    if (!manifest.malformed && !unknown) {
      continue;
    }
    const resolved = resolveTimelineSeverity(rule.timeline, asOf);
    findings.push(
      buildFinding(rule, resolved, {
        title: `Privacy manifest is malformed or declares an unknown category/reason code — ${bundle.path}`,
        message: manifest.malformed
          ? 'PrivacyInfo.xcprivacy is structurally malformed.'
          : 'PrivacyInfo.xcprivacy declares a category or reason code that is not documented.',
        evidence: { bundle: bundle.path },
      }),
    );
  }
  return findings;
}

function checkIosPriv004(
  facts: IosFacts,
  rule: Rule,
  asOf: string,
  seeds: IosCheckSeeds,
): Finding[] {
  const findings: Finding[] = [];
  for (const bundle of facts.bundles) {
    if (bundle.kind !== 'framework' || bundle.privacyManifest !== undefined) {
      continue;
    }
    const frameworkName = frameworkNameOf(bundle.path);
    if (frameworkName === undefined || !isListedSdk(frameworkName, seeds.listedSdks)) {
      continue;
    }
    const resolved = resolveTimelineSeverity(rule.timeline, asOf);
    findings.push(
      buildFinding(rule, resolved, {
        title: `Listed third-party SDK bundled without its own privacy manifest — ${frameworkName}`,
        message: `${frameworkName} is on Apple's list of third-party SDKs that require a privacy manifest, but this copy has none.`,
        evidence: { bundle: bundle.path, framework: frameworkName },
      }),
    );
  }
  return findings;
}

function checkIosInfo001(facts: IosFacts, rule: Rule, asOf: string): Finding[] {
  const findings: Finding[] = [];
  for (const bundle of facts.bundles) {
    if (bundle.machO?.encrypted !== true) {
      continue;
    }
    const resolved = resolveTimelineSeverity(rule.timeline, asOf);
    findings.push(
      buildFinding(rule, resolved, {
        title: `Executable is encrypted — ${bundle.path}`,
        message:
          'This executable is FairPlay-encrypted, so required-reason API detection is limited to symbols.',
        evidence: { bundle: bundle.path },
      }),
    );
  }
  return findings;
}

export const IOS_RULE_CHECKS: Record<string, IosRuleCheck> = {
  'IOS-SDK-001': checkIosSdk001,
  'IOS-MINOS-001': checkIosMinos001,
  'IOS-PRIV-001': checkIosPriv001,
  'IOS-PRIV-002': checkIosPriv002,
  'IOS-PRIV-003': checkIosPriv003,
  'IOS-PRIV-004': checkIosPriv004,
  'IOS-INFO-001': checkIosInfo001,
};
