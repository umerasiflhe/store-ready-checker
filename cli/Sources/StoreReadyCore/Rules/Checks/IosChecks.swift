import Foundation

/// Mirrors `packages/core/src/rules/checks/ios.ts`. All checks are synchronous, pure, never
/// throw, and return a (possibly empty) array of `Finding`.

public struct IosCheckSeeds: Sendable {
  public let listedSdks: ListedSdksSeed
  public let requiredReasonApis: RequiredReasonSeed

  public init(listedSdks: ListedSdksSeed, requiredReasonApis: RequiredReasonSeed) {
    self.listedSdks = listedSdks
    self.requiredReasonApis = requiredReasonApis
  }
}

typealias IosRuleCheck = @Sendable (IosFacts, Rule, String, IosCheckSeeds) -> [Finding]

private func parseDtXcode(_ value: String?) -> Int? {
  guard let value, value.allSatisfy(\.isNumber), !value.isEmpty else { return nil }
  return Int(value)
}

private nonisolated(unsafe) let trailingNumberRegex = /(\d+(?:\.\d+)?)$/

private func parseSdkVersion(platformVersion: String?, sdkName: String?) -> Double? {
  if let platformVersion {
    let value = Double(platformVersion)
    if let value, value.isFinite { return value }
  }
  guard let sdkName, let match = sdkName.firstMatch(of: trailingNumberRegex) else { return nil }
  return Double(match.1)
}

private func checkIosSdk001(_ facts: IosFacts, _ rule: Rule, _ asOf: String, _ seeds: IosCheckSeeds)
  -> [Finding]
{
  var findings: [Finding] = []
  for bundle in facts.bundles where bundle.kind == .app || bundle.kind == .appex {
    guard let dtXcode = parseDtXcode(bundle.info.dtXcode) else { continue }
    guard
      let sdkVersion = parseSdkVersion(
        platformVersion: bundle.info.dtPlatformVersion,
        sdkName: bundle.info.dtSdkName
      )
    else { continue }
    if dtXcode >= 2600 && sdkVersion >= 26 { continue }

    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title: "Built with an SDK older than iOS 26 — \(bundle.path)",
          message:
            "App Store Connect requires every app and embedded app extension to be built with Xcode 26 or later, using the iOS 26 SDK or later.",
          evidence: [
            "bundle": .string(bundle.path),
            "DTXcode": bundle.info.dtXcode.map(JSONValue.string) ?? .null,
            "DTSDKName": bundle.info.dtSdkName.map(JSONValue.string) ?? .null,
            "DTPlatformVersion": bundle.info.dtPlatformVersion.map(JSONValue.string) ?? .null,
          ]
        )
      )
    )
  }
  return findings
}

private func checkIosMinos001(
  _ facts: IosFacts,
  _ rule: Rule,
  _ asOf: String,
  _ seeds: IosCheckSeeds
) -> [Finding] {
  guard let app = facts.bundles.first(where: { $0.kind == .app }) else { return [] }
  guard let minimumOSVersion = app.info.minimumOSVersion else { return [] }
  guard case .string(let required)? = rule.parameters?["minimumOSVersion"] else { return [] }

  let comparison = compareVersions(minimumOSVersion, required)
  if comparison.isNaN || comparison >= 0 { return [] }

  let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
  return [
    buildFinding(
      rule,
      resolved,
      FindingParts(
        title: "MinimumOSVersion \(minimumOSVersion) is below the required \(required)",
        message: "App Store Connect requires MinimumOSVersion to be at least \(required).",
        evidence: ["bundle": .string(app.path), "MinimumOSVersion": .string(minimumOSVersion)]
      )
    )
  ]
}

private func bundlesWithExecutables(_ facts: IosFacts) -> [BundleFacts] {
  facts.bundles.filter { $0.machO != nil }
}

private func checkIosPriv001(
  _ facts: IosFacts,
  _ rule: Rule,
  _ asOf: String,
  _ seeds: IosCheckSeeds
) -> [Finding] {
  var findings: [Finding] = []
  for bundle in bundlesWithExecutables(facts) {
    if bundle.requiredReasonUsage.isEmpty || bundle.privacyManifest != nil { continue }
    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title: "Required-reason API used without a privacy manifest — \(bundle.path)",
          message:
            "A required-reason API was detected, but this bundle has no PrivacyInfo.xcprivacy privacy manifest.",
          evidence: [
            "bundle": .string(bundle.path),
            "categories": .array(bundle.requiredReasonUsage.map { .string($0.category) }),
          ]
        )
      )
    )
  }
  return findings
}

private func checkIosPriv002(
  _ facts: IosFacts,
  _ rule: Rule,
  _ asOf: String,
  _ seeds: IosCheckSeeds
) -> [Finding] {
  var findings: [Finding] = []
  for bundle in bundlesWithExecutables(facts) {
    guard let manifest = bundle.privacyManifest, !manifest.malformed else { continue }
    let declared = declaredCategories(manifest)
    let undeclared = bundle.requiredReasonUsage.filter { !declared.contains($0.category) }
    if undeclared.isEmpty { continue }
    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title: "Required-reason API category not declared — \(bundle.path)",
          message:
            "A required-reason API category was detected that is not declared in NSPrivacyAccessedAPITypes.",
          evidence: [
            "bundle": .string(bundle.path),
            "categories": .array(undeclared.map { .string($0.category) }),
          ]
        )
      )
    )
  }
  return findings
}

private func checkIosPriv003(
  _ facts: IosFacts,
  _ rule: Rule,
  _ asOf: String,
  _ seeds: IosCheckSeeds
) -> [Finding] {
  var findings: [Finding] = []
  for bundle in facts.bundles {
    guard let manifest = bundle.privacyManifest else { continue }
    let unknown =
      !manifest.malformed && hasUnknownCategoryOrReason(manifest, seeds.requiredReasonApis)
    if !manifest.malformed && !unknown { continue }

    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    let message =
      manifest.malformed
      ? "PrivacyInfo.xcprivacy is structurally malformed."
      : "PrivacyInfo.xcprivacy declares a category or reason code that is not documented."
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title:
            "Privacy manifest is malformed or declares an unknown category/reason code — \(bundle.path)",
          message: message,
          evidence: ["bundle": .string(bundle.path)]
        )
      )
    )
  }
  return findings
}

private func checkIosPriv004(
  _ facts: IosFacts,
  _ rule: Rule,
  _ asOf: String,
  _ seeds: IosCheckSeeds
) -> [Finding] {
  var findings: [Finding] = []
  for bundle in facts.bundles {
    guard bundle.kind == .framework, bundle.privacyManifest == nil else { continue }
    guard let frameworkName = frameworkNameOf(bundle.path) else { continue }
    guard isListedSdk(frameworkName, seeds.listedSdks) else { continue }

    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title:
            "Listed third-party SDK bundled without its own privacy manifest — \(frameworkName)",
          message:
            "\(frameworkName) is on Apple's list of third-party SDKs that require a privacy manifest, but this copy has none.",
          evidence: ["bundle": .string(bundle.path), "framework": .string(frameworkName)]
        )
      )
    )
  }
  return findings
}

private func checkIosInfo001(
  _ facts: IosFacts,
  _ rule: Rule,
  _ asOf: String,
  _ seeds: IosCheckSeeds
) -> [Finding] {
  var findings: [Finding] = []
  for bundle in facts.bundles {
    guard bundle.machO?.encrypted == true else { continue }
    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title: "Executable is encrypted — \(bundle.path)",
          message:
            "This executable is FairPlay-encrypted, so required-reason API detection is limited to symbols.",
          evidence: ["bundle": .string(bundle.path)]
        )
      )
    )
  }
  return findings
}

let iosRuleChecks: [String: IosRuleCheck] = [
  "IOS-SDK-001": checkIosSdk001,
  "IOS-MINOS-001": checkIosMinos001,
  "IOS-PRIV-001": checkIosPriv001,
  "IOS-PRIV-002": checkIosPriv002,
  "IOS-PRIV-003": checkIosPriv003,
  "IOS-PRIV-004": checkIosPriv004,
  "IOS-INFO-001": checkIosInfo001,
]
