import Foundation
import Testing

@testable import StoreReadyCore

@Test func opensARealIpaAndListsItsEntries() throws {
  let result = ZipArchive.open(url: fixtureURL("ios-passing-app.ipa"))
  guard case .success(let archive) = result else {
    Issue.record("expected the fixture to open")
    return
  }
  let names = archive.list().map(\.filename)
  #expect(names.contains("Payload/MyApp.app/Info.plist"))
  #expect(names.contains("Payload/MyApp.app/MyApp"))
  #expect(!names.contains { $0.hasSuffix("/") })  // directories are filtered out of list()
}

@Test func readEntryReturnsDecompressedContent() throws {
  let result = ZipArchive.open(url: fixtureURL("ios-passing-app.ipa"))
  guard case .success(let archive) = result else {
    Issue.record("expected the fixture to open")
    return
  }
  let entryResult = archive.readEntry("Payload/MyApp.app/Info.plist")
  guard case .success(let bytes) = entryResult else {
    Issue.record("expected to read Info.plist")
    return
  }
  let text = String(decoding: Data(bytes), as: UTF8.self)
  #expect(text.contains("CFBundleIdentifier"))
}

@Test func readEntryFailsForAMissingEntry() throws {
  let result = ZipArchive.open(url: fixtureURL("ios-passing-app.ipa"))
  guard case .success(let archive) = result else {
    Issue.record("expected the fixture to open")
    return
  }
  let entryResult = archive.readEntry("nope")
  guard case .failure(let error) = entryResult else {
    Issue.record("expected a failure")
    return
  }
  #expect(error.code == "ENTRY_NOT_FOUND")
}

@Test func openFailsOnANonZipFile() {
  let result = ZipArchive.open(url: fixtureURL("ios-not-a-zip.ipa"))
  guard case .failure(let error) = result else {
    Issue.record("expected a failure")
    return
  }
  #expect(error.code == "NOT_A_ZIP")
}

/// `android-apk-zip-misaligned.apk`'s golden report (`fixtures/expected/`) asserts
/// `zipDataOffset: 556` for `lib/arm64-v8a/libnative.so` — this is the same oracle the Android
/// zip-alignment rule check will assert against once it's ported, confirming the local-header
/// read lines up with the TS implementation exactly.
@Test func localHeaderDataOffsetMatchesTheKnownGoldenValue() throws {
  let result = ZipArchive.open(url: fixtureURL("android-apk-zip-misaligned.apk"))
  guard case .success(let archive) = result else {
    Issue.record("expected the fixture to open")
    return
  }
  guard let entry = archive.list().first(where: { $0.filename == "lib/arm64-v8a/libnative.so" })
  else {
    Issue.record("expected to find the native library entry")
    return
  }
  let compression = try archive.localHeaderCompressionMethod(for: entry)
  #expect(compression == 0)  // stored
  let dataOffset = try archive.localHeaderDataOffset(for: entry)
  #expect(dataOffset == 556)
}
