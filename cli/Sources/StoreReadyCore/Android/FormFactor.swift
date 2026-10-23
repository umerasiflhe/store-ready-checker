/// Mirrors `packages/core/src/android/formFactor.ts`.

public enum FormFactor: String, Sendable, Equatable, CaseIterable {
  case phoneTablet = "phone_tablet"
  case wear
  case tv
  case automotive
  case xr
}

private let featureToFormFactor: [String: FormFactor] = [
  "android.hardware.type.watch": .wear,
  "android.software.leanback": .tv,
  "android.hardware.type.automotive": .automotive,
  "android.software.xr.api.openxr": .xr,
  "android.software.xr.api.spatial": .xr,
]

/// Iterates `usesFeatures` in manifest order, returning the form factor for the *first* feature
/// name found in the map — not a fixed priority order over the map. Defaults to `.phoneTablet`.
public func inferFormFactor(_ usesFeatures: [String]) -> FormFactor {
  for feature in usesFeatures {
    if let formFactor = featureToFormFactor[feature] {
      return formFactor
    }
  }
  return .phoneTablet
}
