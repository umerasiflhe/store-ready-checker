import Foundation

/// Mirrors `packages/core/src/plist/types.ts`'s `PlistValue` union. Unlike TS, decoding is done
/// by Foundation's `PropertyListSerialization` (brief §6.6 names this explicitly) rather than a
/// hand-rolled bplist/XML decoder — this type is just the common shape both the binary and XML
/// plist formats decode into.
public indirect enum PlistValue: Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case data([UInt8])
  case date(Date)
  case array([PlistValue])
  case dict([String: PlistValue])

  public var dictValue: [String: PlistValue]? {
    if case .dict(let value) = self { return value }
    return nil
  }

  public var arrayValue: [PlistValue]? {
    if case .array(let value) = self { return value }
    return nil
  }

  public var stringValue: String? {
    if case .string(let value) = self { return value }
    return nil
  }

  public var boolValue: Bool? {
    if case .bool(let value) = self { return value }
    return nil
  }

  public var numberValue: Double? {
    if case .number(let value) = self { return value }
    return nil
  }
}

public func isPlistDict(_ value: PlistValue?) -> Bool {
  value?.dictValue != nil
}

public func isPlistArray(_ value: PlistValue?) -> Bool {
  value?.arrayValue != nil
}
