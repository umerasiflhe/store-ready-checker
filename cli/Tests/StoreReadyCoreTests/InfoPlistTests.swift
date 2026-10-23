import Testing

@testable import StoreReadyCore

@Test func extractInfoPlistFactsReturnsEmptyForNonDict() {
  let facts = extractInfoPlistFacts(.array([]))
  #expect(facts.bundleIdentifier == nil)
}

@Test func extractInfoPlistFactsReturnsEmptyForNil() {
  let facts = extractInfoPlistFacts(nil)
  #expect(facts.bundleIdentifier == nil)
}

@Test func extractInfoPlistFactsReadsKnownKeys() {
  let plist = PlistValue.dict([
    "CFBundleIdentifier": .string("com.example.app"),
    "DTXcode": .number(2600),
    "MinimumOSVersion": .string("15.0"),
  ])
  let facts = extractInfoPlistFacts(plist)
  #expect(facts.bundleIdentifier == "com.example.app")
  #expect(facts.dtXcode == "2600")
  #expect(facts.minimumOSVersion == "15.0")
  #expect(facts.dtSdkName == nil)
}

@Test func extractInfoPlistFactsFromARealXmlIpa() throws {
  guard case .success(let archive) = ZipArchive.open(url: fixtureURL("ios-old-xcode.ipa")) else {
    Issue.record("expected the fixture to open")
    return
  }
  guard case .success(let bytes) = archive.readEntry("Payload/MyApp.app/Info.plist") else {
    Issue.record("expected Info.plist")
    return
  }
  guard case .success(let plist) = parsePlist(bytes) else {
    Issue.record("expected a decodable plist")
    return
  }
  let facts = extractInfoPlistFacts(plist)
  #expect(facts.dtXcode == "1640")
  #expect(facts.dtSdkName == "iphoneos18.5")
}
