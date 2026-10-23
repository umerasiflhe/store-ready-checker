import Foundation

/// Locates the repo root from a test file's own source path, so tests can read the same
/// `fixtures/files/*` the TypeScript side uses — one set of fixtures, both implementations.
func repoRoot(from filePath: String = #filePath) -> URL {
  var url = URL(fileURLWithPath: filePath)
  while url.path != "/" {
    url.deleteLastPathComponent()
    if FileManager.default.fileExists(atPath: url.appendingPathComponent("fixtures/files").path) {
      return url
    }
  }
  fatalError("could not locate repo root from \(filePath)")
}

func fixtureURL(_ name: String) -> URL {
  repoRoot().appendingPathComponent("fixtures/files/\(name)")
}

func goldenURL(_ name: String) -> URL {
  repoRoot().appendingPathComponent("fixtures/expected/\(name).json")
}

/// `storereadyTests` depends on the `storeready` executable target, so `swift test` always
/// builds it before running — this just finds where the build placed the binary, debug or
/// release, without assuming which configuration the caller used.
func storeReadyExecutableURL() -> URL {
  let cliRoot = repoRoot().appendingPathComponent("cli")
  for configuration in ["debug", "release"] {
    let candidate = cliRoot.appendingPathComponent(".build/\(configuration)/storeready")
    if FileManager.default.fileExists(atPath: candidate.path) {
      return candidate
    }
  }
  fatalError("could not find a built storeready executable under cli/.build")
}
