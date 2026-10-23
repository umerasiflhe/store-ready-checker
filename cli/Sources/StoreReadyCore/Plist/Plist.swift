import Foundation

/// Decodes a binary (`bplist00`) or XML plist into a `PlistValue` tree using Foundation's
/// `PropertyListSerialization` — brief §6.6 names this explicitly, so unlike the TS side (which
/// hand-rolls both decoders because browser workers have no native plist API), there's no format
/// dispatch to write: `PropertyListSerialization` detects binary vs. XML itself.
///
/// **Caller contract** (mirrors `ios/analyze.ts#readPlistAt`): when this returns `.failure`, the
/// caller must treat the plist as *absent*, exactly like a missing file — not as "present but
/// malformed." `PrivacyManifestFacts.malformed = true` only fires when decoding *succeeds* but
/// yields the wrong shape (handled downstream in `PrivacyManifest.swift`), never on an outright
/// decode failure.
public func parsePlist(_ bytes: [UInt8]) -> Result<PlistValue, ParseError> {
  tryParse("PLIST_PARSE_FAILED") {
    let data = Data(bytes)
    let object = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
    return convertToPlistValue(object)
  }
}

private func convertToPlistValue(_ object: Any) -> PlistValue {
  if let dict = object as? [String: Any] {
    var result: [String: PlistValue] = [:]
    for (key, value) in dict {
      result[key] = convertToPlistValue(value)
    }
    return .dict(result)
  }
  if let array = object as? [Any] {
    return .array(array.map(convertToPlistValue))
  }
  if let date = object as? Date {
    return .date(date)
  }
  if let data = object as? Data {
    return .data([UInt8](data))
  }
  if let string = object as? String {
    return .string(string)
  }
  if let number = object as? NSNumber {
    // A plist <true/>/<false/> decodes as an NSNumber wrapping a CFBoolean — distinguish that
    // from a numeric NSNumber, since PlistValue (like TS's PlistValue) keeps bool and number
    // as separate cases.
    if CFGetTypeID(number) == CFBooleanGetTypeID() {
      return .bool(number.boolValue)
    }
    return .number(number.doubleValue)
  }
  return .null
}
