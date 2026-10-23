import Testing

@testable import StoreReadyCore

@Test func loadsTheBundledRulesFile() {
  guard case .success(let rulesFile) = BundledResources.rulesFile() else {
    Issue.record("expected the bundled rules.json to load")
    return
  }
  #expect(rulesFile.rules.contains { $0.id == "IOS-SDK-001" })
  #expect(rulesFile.rules.contains { $0.id == "AND-TSDK-001" })
}

@Test func loadsTheBundledListedSdksSeed() {
  guard case .success(let seed) = BundledResources.listedSdksSeed() else {
    Issue.record("expected the bundled listed-sdks seed to load")
    return
  }
  #expect(seed.frameworks.contains("Alamofire"))
}

@Test func loadsTheBundledRequiredReasonSeed() {
  guard case .success(let seed) = BundledResources.requiredReasonSeed() else {
    Issue.record("expected the bundled required-reason seed to load")
    return
  }
  #expect(seed.categories.contains { $0.type == "NSPrivacyAccessedAPICategoryUserDefaults" })
}
