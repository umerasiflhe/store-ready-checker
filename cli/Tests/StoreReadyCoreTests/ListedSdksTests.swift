import Testing

@testable import StoreReadyCore

@Test func frameworkNameOfExtractsNameFromFrameworkPath() {
  #expect(
    frameworkNameOf("Payload/MyApp.app/Frameworks/Alamofire.framework") == "Alamofire"
  )
}

@Test func frameworkNameOfReturnsNilForNonFrameworkPaths() {
  #expect(frameworkNameOf("Payload/MyApp.app") == nil)
}

@Test func parsesTheRealListedSdksSeed() throws {
  let json = loadRulesJSON("apple-listed-sdks.json")
  guard case .success(let seed) = parseListedSdksSeed(json) else {
    Issue.record("expected the real seed file to parse")
    return
  }
  #expect(seed.frameworks.contains("Alamofire"))
  #expect(isListedSdk("Alamofire", seed))
  #expect(!isListedSdk("NotAThing", seed))
}

@Test func parseListedSdksSeedFailsOnNonStringElements() {
  let json = JSONValue.object(["frameworks": .array([.string("A"), .number(1)])])
  guard case .failure(let error) = parseListedSdksSeed(json) else {
    Issue.record("expected a failure")
    return
  }
  #expect(error.code == "LISTED_SDKS_SEED_INVALID")
}
