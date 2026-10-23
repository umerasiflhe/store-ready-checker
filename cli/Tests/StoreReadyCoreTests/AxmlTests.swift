import Testing

@testable import StoreReadyCore

private func manifestBytes(fromFixture name: String) -> [UInt8] {
  guard case .success(let archive) = ZipArchive.open(url: fixtureURL(name)) else {
    fatalError("expected \(name) to open")
  }
  guard case .success(let bytes) = archive.readEntry("AndroidManifest.xml") else {
    fatalError("expected AndroidManifest.xml inside \(name)")
  }
  return bytes
}

@Test func decodesARealApkManifestRoot() throws {
  let bytes = manifestBytes(fromFixture: "android-apk-passing.apk")
  guard case .success(let root) = decodeApkManifest(bytes) else {
    Issue.record("expected a decodable manifest")
    return
  }
  #expect(root.name == "manifest")
  #expect(root.children.contains { $0.name == "uses-sdk" })
}

@Test func decodeApkManifestFailsOnGarbageBytes() {
  let result = decodeApkManifest([0x00, 0x01, 0x02])
  guard case .failure(let error) = result else {
    Issue.record("expected a failure")
    return
  }
  #expect(error.code == "AXML_PARSE_FAILED")
}

@Test func decodesTargetSdkVersionByResourceId() throws {
  let bytes = manifestBytes(fromFixture: "android-apk-passing.apk")
  guard case .success(let root) = decodeApkManifest(bytes) else {
    Issue.record("expected a decodable manifest")
    return
  }
  guard let usesSdk = root.children.first(where: { $0.name == "uses-sdk" }) else {
    Issue.record("expected a uses-sdk element")
    return
  }
  let targetSdkAttr = usesSdk.attributes.first { $0.resourceId == 0x0101_0270 }
  guard case .int(let value)? = targetSdkAttr?.value else {
    Issue.record("expected an int targetSdkVersion attribute")
    return
  }
  #expect(value == 36)
}
