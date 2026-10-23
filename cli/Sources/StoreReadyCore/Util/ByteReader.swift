/// Mirrors `packages/core/src/util/bytes.ts`: a bounds-checked cursor over a byte buffer.
/// Every multi-byte read calls `ensure`, which throws `OutOfBoundsError` on any
/// bounds-violating read — the single choke point `tryParse` catches to turn "read past the
/// end" into a typed `ParseError`, in both languages.
public struct OutOfBoundsError: Error, Sendable {
  public let message: String
}

public final class ByteReader {
  public let bytes: [UInt8]
  public var offset: Int

  public init(_ bytes: [UInt8], offset: Int = 0) {
    self.bytes = bytes
    self.offset = offset
  }

  public var length: Int { bytes.count }
  public var remaining: Int { bytes.count - offset }

  /// No bounds check at seek time — bounds are enforced lazily on the next read, same as TS.
  public func seek(_ offset: Int) {
    self.offset = offset
  }

  private func ensure(_ length: Int) throws {
    if length < 0 || offset < 0 || offset + length > bytes.count {
      throw OutOfBoundsError(
        message: "attempted to read \(length) bytes at offset \(offset) of \(bytes.count)"
      )
    }
  }

  public func readUInt8() throws -> UInt8 {
    try ensure(1)
    let value = bytes[offset]
    offset += 1
    return value
  }

  public func readUInt16LE() throws -> UInt16 { try readUInt(2, littleEndian: true) }
  public func readUInt16BE() throws -> UInt16 { try readUInt(2, littleEndian: false) }
  public func readUInt32LE() throws -> UInt32 { try readUInt(4, littleEndian: true) }
  public func readUInt32BE() throws -> UInt32 { try readUInt(4, littleEndian: false) }
  public func readUInt64LE() throws -> UInt64 { try readUInt(8, littleEndian: true) }
  public func readUInt64BE() throws -> UInt64 { try readUInt(8, littleEndian: false) }

  private func readUInt<T: UnsignedInteger & FixedWidthInteger>(
    _ byteCount: Int,
    littleEndian: Bool
  ) throws -> T {
    try ensure(byteCount)
    var value: T = 0
    if littleEndian {
      for i in stride(from: byteCount - 1, through: 0, by: -1) {
        value = (value << 8) | T(bytes[offset + i])
      }
    } else {
      for i in 0..<byteCount {
        value = (value << 8) | T(bytes[offset + i])
      }
    }
    offset += byteCount
    return value
  }

  /// A view (not a copy) of `length` bytes at the current offset — mirrors TS's
  /// `Uint8Array.subarray`.
  public func readBytes(_ length: Int) throws -> ArraySlice<UInt8> {
    try ensure(length)
    let slice = bytes[offset..<(offset + length)]
    offset += length
    return slice
  }

  public func skip(_ length: Int) throws {
    try ensure(length)
    offset += length
  }

  /// Throws if no NUL terminator is found before the end of the buffer — unlike the free
  /// `cStringAt` function below, which never throws.
  public func readCString() throws -> String {
    var end = offset
    while end < bytes.count && bytes[end] != 0 {
      end += 1
    }
    if end >= bytes.count {
      throw OutOfBoundsError(message: "unterminated C string starting at offset \(offset)")
    }
    let start = offset
    offset = end + 1
    return cStringAt(bytes, start)
  }
}

/// Reads a NUL-terminated (or buffer-end-terminated) string at `offset` without a cursor, never
/// throwing. Matches TS's exact semantics: each byte maps to one Unicode scalar, Latin-1-style
/// (`String.fromCharCode`), not UTF-8 decoding — byte 0x80-0xFF become scalars 128-255, not
/// multi-byte UTF-8 sequences.
public func cStringAt(_ bytes: [UInt8], _ offset: Int) -> String {
  guard offset >= 0, offset < bytes.count else { return "" }
  var end = offset
  while end < bytes.count && bytes[end] != 0 {
    end += 1
  }
  var scalars = String.UnicodeScalarView()
  for i in offset..<end {
    scalars.append(Unicode.Scalar(bytes[i]))
  }
  return String(scalars)
}
