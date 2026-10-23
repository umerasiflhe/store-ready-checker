import Testing

@testable import StoreReadyCore

private func entries(for fixture: String) -> [ZipEntry] {
  guard case .success(let archive) = ZipArchive.open(url: fixtureURL(fixture)) else {
    fatalError("expected \(fixture) to open")
  }
  return archive.list()
}

@Test func discoverBundlesFindsTheMainAppAndAFramework() throws {
  let result = discoverBundles(entries(for: "ios-priv-004-listed-sdk-with-manifest.ipa"))
  guard case .success(let bundles) = result else {
    Issue.record("expected bundles to be discovered")
    return
  }
  #expect(bundles.contains { $0.path == "Payload/MyApp.app" && $0.kind == .app })
  #expect(
    bundles.contains {
      $0.path == "Payload/MyApp.app/Frameworks/Alamofire.framework" && $0.kind == .framework
    }
  )
}

@Test func discoverBundlesFindsAnAppExtension() throws {
  let result = discoverBundles(entries(for: "ios-appex-old-sdk.ipa"))
  guard case .success(let bundles) = result else {
    Issue.record("expected bundles to be discovered")
    return
  }
  #expect(
    bundles.contains {
      $0.path == "Payload/MyApp.app/PlugIns/Share.appex" && $0.kind == .appex
    }
  )
}

@Test func discoverBundlesFailsWithNoPayloadForANonIpaZip() throws {
  let result = discoverBundles(entries(for: "ios-no-payload.ipa"))
  guard case .failure(let error) = result else {
    Issue.record("expected a failure")
    return
  }
  #expect(error.code == "NO_PAYLOAD")
}

@Test func discoverBundlesSortsByPath() throws {
  let result = discoverBundles(entries(for: "ios-priv-004-listed-sdk-with-manifest.ipa"))
  guard case .success(let bundles) = result else {
    Issue.record("expected bundles to be discovered")
    return
  }
  #expect(bundles.map(\.path) == bundles.map(\.path).sorted())
}
