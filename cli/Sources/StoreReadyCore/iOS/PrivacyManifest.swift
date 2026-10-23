/// Mirrors `packages/core/src/ios/privacyManifest.ts`. Only validates `NSPrivacyTracking` and
/// `NSPrivacyAccessedAPITypes` — the TS source doesn't read `NSPrivacyTrackingDomains` or
/// `NSPrivacyCollectedDataTypes` either, so this intentionally doesn't either.

public struct AccessedApiTypeEntry: Sendable {
  public let category: String
  public let reasons: [String]
}

public struct PrivacyManifestFacts: Sendable {
  public let malformed: Bool
  public let tracking: Bool?
  public let accessedApiTypes: [AccessedApiTypeEntry]
}

/// Pure and total — never throws. `plist` being non-decodable at all is the *caller's*
/// responsibility to treat as "no manifest" (see `Plist.swift`'s doc comment); this function only
/// ever sees an already-successfully-decoded `PlistValue`.
public func extractPrivacyManifestFacts(_ plist: PlistValue) -> PrivacyManifestFacts {
  guard let dict = plist.dictValue else {
    return PrivacyManifestFacts(malformed: true, tracking: nil, accessedApiTypes: [])
  }

  let tracking = dict["NSPrivacyTracking"]?.boolValue

  guard let typesValue = dict["NSPrivacyAccessedAPITypes"] else {
    return PrivacyManifestFacts(malformed: false, tracking: tracking, accessedApiTypes: [])
  }
  guard let rawEntries = typesValue.arrayValue else {
    return PrivacyManifestFacts(malformed: true, tracking: tracking, accessedApiTypes: [])
  }

  var malformed = false
  var accessedApiTypes: [AccessedApiTypeEntry] = []
  for entry in rawEntries {
    guard let entryDict = entry.dictValue else {
      malformed = true
      continue
    }
    guard
      let category = entryDict["NSPrivacyAccessedAPIType"]?.stringValue,
      let reasonsValue = entryDict["NSPrivacyAccessedAPITypeReasons"]?.arrayValue
    else {
      malformed = true
      continue
    }
    let reasons = reasonsValue.compactMap(\.stringValue)
    if reasons.count != reasonsValue.count {
      malformed = true
    }
    accessedApiTypes.append(AccessedApiTypeEntry(category: category, reasons: reasons))
  }

  return PrivacyManifestFacts(
    malformed: malformed,
    tracking: tracking,
    accessedApiTypes: accessedApiTypes
  )
}

public func hasUnknownCategoryOrReason(
  _ facts: PrivacyManifestFacts,
  _ seed: RequiredReasonSeed
) -> Bool {
  var known: [String: Set<String>] = [:]
  for category in seed.categories {
    known[category.type] = Set(category.reasonCodes)
  }
  for entry in facts.accessedApiTypes {
    guard let knownReasons = known[entry.category] else { return true }
    for reason in entry.reasons where !knownReasons.contains(reason) {
      return true
    }
  }
  return false
}

public func declaredCategories(_ facts: PrivacyManifestFacts) -> Set<String> {
  Set(facts.accessedApiTypes.map(\.category))
}
