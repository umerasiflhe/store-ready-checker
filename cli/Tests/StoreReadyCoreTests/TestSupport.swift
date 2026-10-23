import Foundation
import StoreReadyCore

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

func loadRulesJSON(_ name: String) -> JSONValue {
  let url = repoRoot().appendingPathComponent("rules/\(name)")
  let data = try! Data(contentsOf: url)
  return try! JSONDecoder().decode(JSONValue.self, from: data)
}
