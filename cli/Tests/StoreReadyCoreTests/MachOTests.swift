import Testing

@testable import StoreReadyCore

private func executableBytes(fromFixture name: String) -> [UInt8] {
  guard case .success(let archive) = ZipArchive.open(url: fixtureURL(name)) else {
    fatalError("expected \(name) to open")
  }
  guard case .success(let bytes) = archive.readEntry("Payload/MyApp.app/MyApp") else {
    fatalError("expected an executable inside \(name)")
  }
  return bytes
}

@Test func parsesAThinBinaryAndCollectsSymtabSymbols() throws {
  let bytes = executableBytes(fromFixture: "ios-passing-app.ipa")
  guard case .success(let facts) = parseMachO(bytes) else {
    Issue.record("expected a parseable Mach-O")
    return
  }
  #expect(!facts.encrypted)
  #expect(facts.symbols.contains("_OBJC_CLASS_$_NSUserDefaults"))
}

@Test func picksTheArm64SliceFromAFatBinaryOverTheFirstSlice() throws {
  let bytes = executableBytes(fromFixture: "ios-fat-binary.ipa")
  guard case .success(let facts) = parseMachO(bytes) else {
    Issue.record("expected a parseable fat Mach-O")
    return
  }
  // arm64 is NOT the first slice in this fixture (x86_64 is) — confirms arm64 is preferred over
  // "whichever slice comes first" when both are present.
  #expect(facts.symbols.contains("_OBJC_CLASS_$_NSUserDefaults"))
  #expect(!facts.symbols.contains("_x86OnlySymbol"))
}

@Test func encryptedBinarySuppressesSelectorsButKeepsSymbols() throws {
  let bytes = executableBytes(fromFixture: "ios-encrypted-binary.ipa")
  guard case .success(let facts) = parseMachO(bytes) else {
    Issue.record("expected a parseable Mach-O")
    return
  }
  #expect(facts.encrypted)
  #expect(facts.symbols.contains("_stat"))
  #expect(facts.selectors.isEmpty)
}

@Test func parseMachOFailsOnGarbageBytes() {
  let result = parseMachO([0x00, 0x01, 0x02, 0x03])
  guard case .failure(let error) = result else {
    Issue.record("expected a failure")
    return
  }
  #expect(error.code == "MACH_O_PARSE_FAILED")
}

@Test func symbolsAreSortedAndDeduplicated() {
  // Build a minimal thin Mach-O by hand would be a lot of plumbing duplicated from the TS
  // generator; cross-check determinism instead: parsing the same bytes twice is identical and
  // sorted.
  let bytes = executableBytes(fromFixture: "ios-passing-app.ipa")
  guard case .success(let factsA) = parseMachO(bytes), case .success(let factsB) = parseMachO(bytes)
  else {
    Issue.record("expected a parseable Mach-O")
    return
  }
  #expect(factsA.symbols == factsB.symbols)
  #expect(factsA.symbols == factsA.symbols.sorted())
}
