import Testing

@testable import StoreReadyCore

@Test func parsesTheRealRequiredReasonSeed() throws {
  let json = loadRulesJSON("apple-required-reason-apis.json")
  guard case .success(let seed) = parseRequiredReasonSeed(json) else {
    Issue.record("expected the real seed file to parse")
    return
  }
  #expect(seed.categories.contains { $0.type == "NSPrivacyAccessedAPICategoryUserDefaults" })
}

@Test func detectRequiredReasonUsageMatchesSymbolsAndSelectors() throws {
  let json = loadRulesJSON("apple-required-reason-apis.json")
  guard case .success(let seed) = parseRequiredReasonSeed(json) else {
    Issue.record("expected the real seed file to parse")
    return
  }
  let usage = detectRequiredReasonUsage(
    symbols: ["_OBJC_CLASS_$_NSUserDefaults"],
    selectors: [],
    seed: seed
  )
  #expect(usage.contains { $0.category == "NSPrivacyAccessedAPICategoryUserDefaults" })
}

@Test func detectRequiredReasonUsageFindsNothingForUnrelatedSymbols() throws {
  let json = loadRulesJSON("apple-required-reason-apis.json")
  guard case .success(let seed) = parseRequiredReasonSeed(json) else {
    Issue.record("expected the real seed file to parse")
    return
  }
  let usage = detectRequiredReasonUsage(symbols: ["_printf"], selectors: [], seed: seed)
  #expect(usage.isEmpty)
}

@Test func parseRequiredReasonSeedDropsNonStringElementsSilently() throws {
  let json = JSONValue.object([
    "categories": .array([
      .object([
        "type": .string("X"),
        "reasonCodes": .array([.string("A"), .number(1)]),
        "evidence": .object([
          "symbols": .array([.string("_foo")]),
          "selectors": .array([]),
        ]),
      ])
    ])
  ])
  guard case .success(let seed) = parseRequiredReasonSeed(json) else {
    Issue.record("expected a success")
    return
  }
  #expect(seed.categories[0].reasonCodes == ["A"])
}
