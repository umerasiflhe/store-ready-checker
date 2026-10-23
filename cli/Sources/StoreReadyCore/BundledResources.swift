import Foundation

/// Loads `rules.json` and the two Apple seed JSON files from the package's own bundled
/// resources (`Resources/`, kept in sync with `rules/` by `scripts/sync-rules.ts`). The CLI
/// never reads these from an arbitrary filesystem path — they're compiled into the binary's
/// resource bundle, same spirit as the web app importing `rules/rules.json` at build time.
public enum BundledResources {
  private static func loadJSON(_ name: String) -> Result<JSONValue, ParseError> {
    tryParse("BUNDLED_RESOURCE_MISSING") {
      guard
        let url = Bundle.module.url(
          forResource: name,
          withExtension: "json",
          subdirectory: "Resources"
        )
      else {
        throw ParseError(code: "BUNDLED_RESOURCE_MISSING", message: "missing resource \(name).json")
      }
      let data = try Data(contentsOf: url)
      return try JSONDecoder().decode(JSONValue.self, from: data)
    }
  }

  public static func rulesFile() -> Result<RulesFile, ParseError> {
    tryParse("RULES_FILE_INVALID") {
      switch loadJSON("rules") {
      case .failure(let error): throw error
      case .success(let json):
        let data = try JSONEncoder().encode(json)
        return try JSONDecoder().decode(RulesFile.self, from: data)
      }
    }
  }

  public static func listedSdksSeed() -> Result<ListedSdksSeed, ParseError> {
    switch loadJSON("apple-listed-sdks") {
    case .failure(let error): return .failure(error)
    case .success(let json): return parseListedSdksSeed(json)
    }
  }

  public static func requiredReasonSeed() -> Result<RequiredReasonSeed, ParseError> {
    switch loadJSON("apple-required-reason-apis") {
    case .failure(let error): return .failure(error)
    case .success(let json): return parseRequiredReasonSeed(json)
    }
  }
}
