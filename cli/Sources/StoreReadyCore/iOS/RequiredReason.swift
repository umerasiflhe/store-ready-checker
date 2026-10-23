/// Mirrors `packages/core/src/ios/requiredReason.ts`.

public struct RequiredReasonEvidence: Sendable {
  public let symbols: [String]
  public let selectors: [String]
}

public struct RequiredReasonCategory: Sendable {
  public let type: String
  public let reasonCodes: [String]
  public let evidence: RequiredReasonEvidence
}

public struct RequiredReasonSeed: Sendable {
  public let categories: [RequiredReasonCategory]

  public init(categories: [RequiredReasonCategory]) {
    self.categories = categories
  }
}

public struct DetectedRequiredReasonUsage: Sendable {
  public let category: String
  public let matchedSymbols: [String]
  public let matchedSelectors: [String]
}

private func stringArray(_ value: JSONValue?) -> [String]? {
  guard case .array(let items)? = value else { return nil }
  var result: [String] = []
  for item in items {
    if case .string(let s) = item { result.append(s) }
  }
  return result
}

/// Lenient, unlike `parseListedSdksSeed`: non-string elements inside `reasonCodes`/`symbols`/
/// `selectors` are silently dropped, not a parse error — only the containing shape (an object
/// with a "categories" array, each category an object with the right nested shapes) is strict.
public func parseRequiredReasonSeed(_ json: JSONValue) -> Result<RequiredReasonSeed, ParseError> {
  tryParse("REQUIRED_REASON_SEED_INVALID") {
    guard case .object(let root) = json, case .array(let rawCategories)? = root["categories"]
    else {
      throw ParseError(
        code: "REQUIRED_REASON_SEED_INVALID",
        message: "expected a \"categories\" array"
      )
    }
    var categories: [RequiredReasonCategory] = []
    for rawCategory in rawCategories {
      guard
        case .object(let categoryObject) = rawCategory,
        case .string(let type)? = categoryObject["type"],
        let reasonCodes = stringArray(categoryObject["reasonCodes"]),
        case .object(let evidenceObject)? = categoryObject["evidence"],
        let symbols = stringArray(evidenceObject["symbols"]),
        let selectors = stringArray(evidenceObject["selectors"])
      else {
        throw ParseError(
          code: "REQUIRED_REASON_SEED_INVALID",
          message: "malformed required-reason category entry"
        )
      }
      categories.append(
        RequiredReasonCategory(
          type: type,
          reasonCodes: reasonCodes,
          evidence: RequiredReasonEvidence(symbols: symbols, selectors: selectors)
        )
      )
    }
    return RequiredReasonSeed(categories: categories)
  }
}

public func detectRequiredReasonUsage(
  symbols: [String],
  selectors: [String],
  seed: RequiredReasonSeed
) -> [DetectedRequiredReasonUsage] {
  let symbolSet = Set(symbols)
  let selectorSet = Set(selectors)
  var results: [DetectedRequiredReasonUsage] = []
  for category in seed.categories {
    let matchedSymbols = category.evidence.symbols.filter { symbolSet.contains($0) }
    let matchedSelectors = category.evidence.selectors.filter { selectorSet.contains($0) }
    if !matchedSymbols.isEmpty || !matchedSelectors.isEmpty {
      results.append(
        DetectedRequiredReasonUsage(
          category: category.type,
          matchedSymbols: matchedSymbols,
          matchedSelectors: matchedSelectors
        )
      )
    }
  }
  return results
}
