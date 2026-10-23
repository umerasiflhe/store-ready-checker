import Testing

@testable import StoreReadyCore

@Test func extractPrivacyManifestFactsIsMalformedForNonDict() {
  let facts = extractPrivacyManifestFacts(.array([]))
  #expect(facts.malformed)
}

@Test func extractPrivacyManifestFactsAllowsAMissingAccessedApiTypesKey() {
  let facts = extractPrivacyManifestFacts(.dict(["NSPrivacyTracking": .bool(false)]))
  #expect(!facts.malformed)
  #expect(facts.tracking == false)
  #expect(facts.accessedApiTypes.isEmpty)
}

@Test func extractPrivacyManifestFactsIsMalformedWhenAccessedApiTypesIsNotAnArray() {
  let facts = extractPrivacyManifestFacts(.dict(["NSPrivacyAccessedAPITypes": .string("nope")]))
  #expect(facts.malformed)
}

@Test func extractPrivacyManifestFactsParsesAWellFormedEntry() {
  let plist = PlistValue.dict([
    "NSPrivacyAccessedAPITypes": .array([
      .dict([
        "NSPrivacyAccessedAPIType": .string("NSPrivacyAccessedAPICategoryUserDefaults"),
        "NSPrivacyAccessedAPITypeReasons": .array([.string("CA92.1")]),
      ])
    ])
  ])
  let facts = extractPrivacyManifestFacts(plist)
  #expect(!facts.malformed)
  #expect(facts.accessedApiTypes.count == 1)
  #expect(facts.accessedApiTypes[0].category == "NSPrivacyAccessedAPICategoryUserDefaults")
  #expect(declaredCategories(facts) == ["NSPrivacyAccessedAPICategoryUserDefaults"])
}

@Test func extractPrivacyManifestFactsKeepsAnEntryWithFilteredReasonsButMarksMalformed() {
  let plist = PlistValue.dict([
    "NSPrivacyAccessedAPITypes": .array([
      .dict([
        "NSPrivacyAccessedAPIType": .string("X"),
        "NSPrivacyAccessedAPITypeReasons": .array([.string("A"), .number(1)]),
      ])
    ])
  ])
  let facts = extractPrivacyManifestFacts(plist)
  #expect(facts.malformed)
  #expect(facts.accessedApiTypes.count == 1)
  #expect(facts.accessedApiTypes[0].reasons == ["A"])
}

@Test func hasUnknownCategoryOrReasonDetectsAnUnknownCategory() {
  let seed = RequiredReasonSeed(categories: [
    RequiredReasonCategory(
      type: "Known",
      reasonCodes: ["A"],
      evidence: RequiredReasonEvidence(symbols: [], selectors: [])
    )
  ])
  let facts = PrivacyManifestFacts(
    malformed: false,
    tracking: nil,
    accessedApiTypes: [AccessedApiTypeEntry(category: "Unknown", reasons: ["A"])]
  )
  #expect(hasUnknownCategoryOrReason(facts, seed))
}

@Test func hasUnknownCategoryOrReasonDetectsAnUnknownReason() {
  let seed = RequiredReasonSeed(categories: [
    RequiredReasonCategory(
      type: "Known",
      reasonCodes: ["A"],
      evidence: RequiredReasonEvidence(symbols: [], selectors: [])
    )
  ])
  let facts = PrivacyManifestFacts(
    malformed: false,
    tracking: nil,
    accessedApiTypes: [AccessedApiTypeEntry(category: "Known", reasons: ["Z"])]
  )
  #expect(hasUnknownCategoryOrReason(facts, seed))
}

@Test func hasUnknownCategoryOrReasonIsFalseWhenEverythingIsKnown() {
  let seed = RequiredReasonSeed(categories: [
    RequiredReasonCategory(
      type: "Known",
      reasonCodes: ["A"],
      evidence: RequiredReasonEvidence(symbols: [], selectors: [])
    )
  ])
  let facts = PrivacyManifestFacts(
    malformed: false,
    tracking: nil,
    accessedApiTypes: [AccessedApiTypeEntry(category: "Known", reasons: ["A"])]
  )
  #expect(!hasUnknownCategoryOrReason(facts, seed))
}
