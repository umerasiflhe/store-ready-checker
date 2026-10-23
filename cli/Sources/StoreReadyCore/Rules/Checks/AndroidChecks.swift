/// Mirrors `packages/core/src/rules/checks/android.ts`. All checks are synchronous, pure, never
/// throw, and return a (possibly empty) array of `Finding`.

public struct AndroidRuleCheckOptions: Sendable {
  /// Overrides the manifest-inferred form factor (brief §3.3: user- or `--form-factor`-selected).
  public let formFactorOverride: FormFactor?

  public init(formFactorOverride: FormFactor?) {
    self.formFactorOverride = formFactorOverride
  }
}

typealias AndroidRuleCheck =
  @Sendable (AndroidFacts, Rule, String, AndroidRuleCheckOptions?) ->
  [Finding]

private let sixteenKAbis: Set<String> = ["arm64-v8a", "x86_64"]
private let thirtyTwoToSixtyFourBitAbi: [String: String] = [
  "armeabi-v7a": "arm64-v8a",
  "x86": "x86_64",
]

private func targetSdkOf(_ facts: AndroidFacts) -> TargetSdkVersion? {
  primaryModule(facts)?.manifest.targetSdkVersion
}

/// A preview codename is treated as "≥ latest" (never a parse error), so it always meets a
/// numeric threshold.
private func meetsOrExceeds(_ target: TargetSdkVersion, _ threshold: Int) -> Bool {
  switch target {
  case .preview: return true
  case .released(let value): return value >= threshold
  }
}

private func numberParam(_ record: [String: JSONValue]?, _ key: String) -> Double? {
  guard case .number(let value)? = record?[key] else { return nil }
  return value
}

private func stringArrayParam(_ record: [String: JSONValue]?, _ key: String) -> [String] {
  guard case .array(let items)? = record?[key] else { return [] }
  return items.compactMap(\.stringValue)
}

private func relevantNativeLibs(_ facts: AndroidFacts, _ abis: Set<String>) -> [NativeLibFacts] {
  facts.nativeLibs.libraries.filter { abis.contains($0.abi) }
}

/// The form factor (an explicit override wins over the manifest-inferred one) and the rule's
/// `targetSdkByFormFactor` threshold for it, or nil when the rule has none for it.
private func targetSdkRequirement(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ options: AndroidRuleCheckOptions?
) -> (formFactor: FormFactor, required: Double)? {
  let formFactor =
    options?.formFactorOverride
    ?? inferFormFactor(primaryModule(facts)?.manifest.usesFeatures ?? [])
  guard case .object(let byFormFactor)? = rule.parameters?["targetSdkByFormFactor"],
    case .number(let required)? = byFormFactor[formFactor.rawValue]
  else { return nil }
  return (formFactor, required)
}

private func checkAndTsdk001(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions?
) -> [Finding] {
  guard let target = targetSdkOf(facts), case .released(let targetValue) = target,
    let (formFactor, required) = targetSdkRequirement(facts, rule, options)
  else { return [] }
  if Double(targetValue) >= required { return [] }

  let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
  return [
    buildFinding(
      rule,
      resolved,
      FindingParts(
        title:
          "targetSdkVersion \(targetValue) is below the required \(Int(required)) for \(formFactor.rawValue)",
        message: "Google Play requires targetSdkVersion to meet the minimum for this form factor.",
        evidence: [
          "targetSdkVersion": .number(Double(targetValue)),
          "targetSdkAssumed": .bool(primaryModule(facts)?.manifest.targetSdkAssumed ?? false),
          "formFactor": .string(formFactor.rawValue),
          "required": .number(required),
        ]
      )
    )
  ]
}

private func checkAndTsdk002(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions?
) -> [Finding] {
  guard let target = targetSdkOf(facts), case .released(let targetValue) = target,
    let (formFactor, required) = targetSdkRequirement(facts, rule, options)
  else { return [] }
  if Double(targetValue) >= required { return [] }

  let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
  return [
    buildFinding(
      rule,
      resolved,
      FindingParts(
        title:
          "targetSdkVersion \(targetValue) is below \(Int(required)) for \(formFactor.rawValue): new users on newer Android can't install it",
        message:
          "Google Play shows an existing \(formFactor.rawValue) app targeting below \(Int(required)) only to users whose device runs Android at or below its target API level.",
        evidence: [
          "targetSdkVersion": .number(Double(targetValue)),
          "targetSdkAssumed": .bool(primaryModule(facts)?.manifest.targetSdkAssumed ?? false),
          "formFactor": .string(formFactor.rawValue),
          "required": .number(required),
        ]
      )
    )
  ]
}

private func sixteenKApplies(_ facts: AndroidFacts, _ rule: Rule) -> Bool {
  guard let target = targetSdkOf(facts),
    let threshold = numberParam(rule.appliesWhen, "targetSdkAtLeast")
  else { return false }
  return meetsOrExceeds(target, Int(threshold))
}

private func abisFor(_ rule: Rule) -> Set<String> {
  let abis = stringArrayParam(rule.appliesWhen, "abis")
  return abis.isEmpty ? sixteenKAbis : Set(abis)
}

private func checkAnd16k001(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions?
) -> [Finding] {
  guard sixteenKApplies(facts, rule),
    let minAlignment = numberParam(rule.parameters, "minAlignment")
  else { return [] }

  var findings: [Finding] = []
  for lib in relevantNativeLibs(facts, abisFor(rule)) {
    let misaligned =
      lib.elf?.programHeaders.filter { $0.pType == ptLoad && $0.pAlign < UInt64(minAlignment) }
      ?? []
    if misaligned.isEmpty { continue }
    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title: "PT_LOAD segment below \(Int(minAlignment))-byte alignment — \(lib.path)",
          message:
            "Every PT_LOAD segment must be at least 16 KB aligned to support 16 KB page sizes.",
          evidence: [
            "path": .string(lib.path),
            "abi": .string(lib.abi),
            "alignments": .array(misaligned.map { .number(Double($0.pAlign)) }),
          ]
        )
      )
    )
  }
  return findings
}

/// `true` when `relro`'s extent exactly matches a `PT_LOAD` segment's extent — the Android
/// guide's documented exception, since then no writable data shares the segment with the RELRO
/// range.
private func relroInOwnLoadSegment(_ relro: ProgramHeader, _ programHeaders: [ProgramHeader])
  -> Bool
{
  programHeaders.contains {
    $0.pType == ptLoad && $0.pVAddr == relro.pVAddr && $0.pMemSz == relro.pMemSz
  }
}

private func checkAnd16k002(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions?
) -> [Finding] {
  guard sixteenKApplies(facts, rule),
    let relroAlignment = numberParam(rule.parameters, "relroAlignment")
  else { return [] }

  var findings: [Finding] = []
  for lib in relevantNativeLibs(facts, abisFor(rule)) {
    let programHeaders = lib.elf?.programHeaders ?? []
    for relro in programHeaders.filter({ $0.pType == ptGnuRelro }) {
      if relroInOwnLoadSegment(relro, programHeaders) { continue }
      let end = relro.pVAddr + relro.pMemSz
      if end % UInt64(relroAlignment) == 0 { continue }
      let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
      findings.append(
        buildFinding(
          rule,
          resolved,
          FindingParts(
            title: "GNU_RELRO segment ends unaligned — \(lib.path)",
            message:
              "The GNU_RELRO segment must end 16 KB aligned, unless it occupies its own PT_LOAD segment.",
            evidence: [
              "path": .string(lib.path), "abi": .string(lib.abi), "end": .number(Double(end)),
            ]
          )
        )
      )
    }
  }
  return findings
}

private func checkAnd16k003(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions?
) -> [Finding] {
  guard facts.kind == .apk, sixteenKApplies(facts, rule),
    let zipAlignment = numberParam(rule.parameters, "zipAlignment")
  else { return [] }

  var findings: [Finding] = []
  for lib in relevantNativeLibs(facts, abisFor(rule)) {
    guard lib.stored == true, let zipDataOffset = lib.zipDataOffset else { continue }
    if Double(zipDataOffset).truncatingRemainder(dividingBy: zipAlignment) == 0 { continue }
    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title:
            "Stored native library is not zip-aligned to \(Int(zipAlignment)) bytes — \(lib.path)",
          message: "Re-run zipalign with 16 KB alignment before signing the APK.",
          evidence: [
            "path": .string(lib.path),
            "abi": .string(lib.abi),
            "zipDataOffset": .number(Double(zipDataOffset)),
          ]
        )
      )
    )
  }
  return findings
}

private func checkAnd16k004(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions?
) -> [Finding] {
  guard facts.kind == .aab, let bundleConfig = facts.bundleConfig else { return [] }
  if !bundleConfig.nativeLibrariesUncompressed || bundleConfig.nativeLibraryPageAlignment16K {
    return []
  }
  let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
  return [
    buildFinding(
      rule,
      resolved,
      FindingParts(
        title: "BundleConfig.pb does not request 16 KB native library alignment",
        message:
          "Native libraries are packaged uncompressed, but BundleConfig.pb does not request PAGE_ALIGNMENT_16K.",
        evidence: ["nativeLibrariesUncompressed": .bool(bundleConfig.nativeLibrariesUncompressed)]
      )
    )
  ]
}

private func abisPresent(_ facts: AndroidFacts) -> Set<String> {
  Set(facts.nativeLibs.libraries.map(\.abi))
}

private func checkAnd64bit001(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions?
) -> [Finding] {
  let abis = abisPresent(facts)
  var findings: [Finding] = []
  for (thirtyTwoBit, sixtyFourBit) in thirtyTwoToSixtyFourBitAbi {
    if !abis.contains(thirtyTwoBit) || abis.contains(sixtyFourBit) { continue }
    let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
    findings.append(
      buildFinding(
        rule,
        resolved,
        FindingParts(
          title: "\(thirtyTwoBit) native code ships without a matching \(sixtyFourBit) library",
          message:
            "Google Play requires a matching 64-bit native library alongside any 32-bit one.",
          evidence: ["abi": .string(thirtyTwoBit), "missingAbi": .string(sixtyFourBit)]
        )
      )
    )
  }
  return findings.sorted {
    $0.evidence["abi"]?.stringValue ?? "" < $1.evidence["abi"]?.stringValue ?? ""
  }
}

private func checkAndInfo001(
  _ facts: AndroidFacts,
  _ rule: Rule,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions?
) -> [Finding] {
  let abis = abisPresent(facts)
  if abis.contains("arm64-v8a") || abis.contains("x86_64") { return [] }
  let resolved = resolveTimelineSeverity(rule.timeline, asOf: asOf)
  return [
    buildFinding(
      rule,
      resolved,
      FindingParts(
        title: "No 64-bit-relevant native code detected",
        message:
          "The 16 KB page-size checks do not apply: no arm64-v8a or x86_64 native library was found.",
        evidence: ["abis": .array(abis.sorted().map { .string($0) })]
      )
    )
  ]
}

let androidRuleChecks: [String: AndroidRuleCheck] = [
  "AND-TSDK-001": checkAndTsdk001,
  "AND-TSDK-002": checkAndTsdk002,
  "AND-16K-001": checkAnd16k001,
  "AND-16K-002": checkAnd16k002,
  "AND-16K-003": checkAnd16k003,
  "AND-16K-004": checkAnd16k004,
  "AND-64BIT-001": checkAnd64bit001,
  "AND-INFO-001": checkAndInfo001,
]
