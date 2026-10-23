import Foundation

/// Mirrors `packages/core/src/util/version.ts`. Returns `-1`/`0`/`1` like a normal comparator, or
/// `Double.nan` when either version string has a non-numeric segment — callers check
/// `.isNaN` and skip the rule entirely, exactly like the TS callers check `Number.isNaN`.
///
/// Replicates JS `Number(string)` coercion quirks deliberately: an empty (or whitespace-only)
/// segment is `0`, not an error — Swift's `Double("")` is `nil`, so that has to be special-cased
/// rather than just falling through to `Double.init`.
public func compareVersions(_ a: String, _ b: String) -> Double {
  let partsA = a.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
  let partsB = b.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
  let length = max(partsA.count, partsB.count)
  for i in 0..<length {
    let x = i < partsA.count ? jsNumber(partsA[i]) : 0
    let y = i < partsB.count ? jsNumber(partsB[i]) : 0
    if !x.isFinite || !y.isFinite {
      return .nan
    }
    if x != y {
      return x < y ? -1 : 1
    }
  }
  return 0
}

private func jsNumber(_ text: String) -> Double {
  let trimmed = text.trimmingCharacters(in: .whitespaces)
  if trimmed.isEmpty { return 0 }
  return Double(trimmed) ?? .nan
}
