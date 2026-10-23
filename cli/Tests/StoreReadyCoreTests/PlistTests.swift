import Testing

@testable import StoreReadyCore

private func infoPlistBytes(fromFixture name: String) throws -> [UInt8] {
  guard case .success(let archive) = ZipArchive.open(url: fixtureURL(name)) else {
    fatalError("expected \(name) to open")
  }
  guard case .success(let bytes) = archive.readEntry("Payload/MyApp.app/Info.plist") else {
    fatalError("expected Info.plist inside \(name)")
  }
  return bytes
}

@Test func decodesAnXmlPlistFromARealIpa() throws {
  let bytes = try infoPlistBytes(fromFixture: "ios-passing-app.ipa")
  let result = parsePlist(bytes)
  guard case .success(let value) = result, let dict = value.dictValue else {
    Issue.record("expected a dict")
    return
  }
  #expect(dict["CFBundleIdentifier"]?.stringValue == "com.example.myapp")
}

@Test func decodesABinaryPlistFromARealIpa() throws {
  let bytes = try infoPlistBytes(fromFixture: "ios-binary-plist.ipa")
  let result = parsePlist(bytes)
  guard case .success(let value) = result, let dict = value.dictValue else {
    Issue.record("expected a dict")
    return
  }
  #expect(dict["CFBundleIdentifier"]?.stringValue == "com.example.myapp")
  #expect(dict["CFBundleShortVersionString"]?.stringValue == "1.0.0")
}

@Test func parsePlistFailsOnGarbageBytes() {
  let result = parsePlist([0x01, 0x02, 0x03])
  guard case .failure(let error) = result else {
    Issue.record("expected a failure")
    return
  }
  #expect(error.code == "PLIST_PARSE_FAILED")
}

@Test func isPlistDictAndIsPlistArrayDiscriminateCorrectly() {
  #expect(isPlistDict(.dict([:])))
  #expect(!isPlistDict(.array([])))
  #expect(isPlistArray(.array([])))
  #expect(!isPlistArray(.dict([:])))
  #expect(!isPlistDict(nil))
}
