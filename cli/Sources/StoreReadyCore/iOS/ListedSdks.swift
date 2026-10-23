/// Mirrors `packages/core/src/ios/listedSdks.ts`.

public struct ListedSdksSeed: Sendable {
  public let frameworks: [String]

  public init(frameworks: [String]) {
    self.frameworks = frameworks
  }
}

/// Strict, unlike the required-reason seed: every element of `frameworks` must be a string, or
/// the whole parse fails — no silent filtering.
public func parseListedSdksSeed(_ json: JSONValue) -> Result<ListedSdksSeed, ParseError> {
  tryParse("LISTED_SDKS_SEED_INVALID") {
    guard case .object(let root) = json, case .array(let rawFrameworks)? = root["frameworks"]
    else {
      throw ParseError(
        code: "LISTED_SDKS_SEED_INVALID",
        message: "expected a \"frameworks\" array"
      )
    }
    var frameworks: [String] = []
    for item in rawFrameworks {
      guard case .string(let name) = item else {
        throw ParseError(
          code: "LISTED_SDKS_SEED_INVALID",
          message: "expected a \"frameworks\" array of strings"
        )
      }
      frameworks.append(name)
    }
    return ListedSdksSeed(frameworks: frameworks)
  }
}

/// `Payload/MyApp.app/Frameworks/Alamofire.framework` → `"Alamofire"`.
public func frameworkNameOf(_ bundlePath: String) -> String? {
  guard let lastSegment = bundlePath.split(separator: "/").last else { return nil }
  let suffix = ".framework"
  guard lastSegment.hasSuffix(suffix) else { return nil }
  return String(lastSegment.dropLast(suffix.count))
}

public func isListedSdk(_ frameworkName: String, _ seed: ListedSdksSeed) -> Bool {
  seed.frameworks.contains(frameworkName)
}
