import Foundation
import ZIPFoundation

/// Mirrors `packages/core/src/zip/centralDirectory.ts`'s `ZipEntry`. `localHeaderOffset` is the
/// offset of this entry's *local* file header in the archive — needed by the Android
/// zip-alignment rule (AND-16K-003), which must re-read the local header's own
/// `fileNameLength`/`extraFieldLength` rather than trust the central directory's copy (those two
/// can differ) — see `android-bundle-analysis/reference.md`.
public struct ZipEntry: Sendable {
  public let filename: String
  public let isDirectory: Bool
  public let compressedSize: Int
  public let uncompressedSize: Int
  public let localHeaderOffset: UInt64
}

private let endOfCentralDirectorySignature: UInt32 = 0x0605_4b50
private let centralDirectoryFileHeaderSignature: UInt32 = 0x0201_4b50

/// Opens a zip archive for listing and per-entry extraction.
///
/// ZIPFoundation handles decompression, but its `Entry` doesn't expose the local file header
/// offset as public API, so the central directory is read directly here (mirroring the TS
/// implementation's own approach of never fully trusting a zip library's abstraction for that
/// one value). Does not support ZIP64 central directories (not needed by any real-world mobile
/// APK/AAB this tool analyzes, and not exercised by any fixture).
public final class ZipArchive {
  private let source: FileByteSource
  private let foundationArchive: Archive
  public let entries: [ZipEntry]

  public var size: Int { source.size }

  private init(source: FileByteSource, foundationArchive: Archive, entries: [ZipEntry]) {
    self.source = source
    self.foundationArchive = foundationArchive
    self.entries = entries
  }

  public static func open(url: URL) -> Result<ZipArchive, ParseError> {
    tryParse("NOT_A_ZIP") {
      let source = try FileByteSource(url: url)
      if source.size == 0 {
        throw ParseError(code: "EMPTY_FILE", message: "the file is empty")
      }
      let entries = try readCentralDirectory(source)
      let foundationArchive = try Archive(url: url, accessMode: .read)
      return ZipArchive(source: source, foundationArchive: foundationArchive, entries: entries)
    }
  }

  public func list() -> [ZipEntry] {
    entries.filter { !$0.isDirectory }
  }

  public func readEntry(_ filename: String) -> Result<[UInt8], ParseError> {
    let notFound = ParseError(code: "ENTRY_NOT_FOUND", message: "entry not found: \(filename)")
    guard entries.contains(where: { $0.filename == filename && !$0.isDirectory }) else {
      return .failure(notFound)
    }
    guard let foundationEntry = foundationArchive[filename] else {
      return .failure(notFound)
    }
    return tryParse("EXTRACT_FAILED") {
      var data = Data()
      _ = try foundationArchive.extract(foundationEntry) { chunk in
        data.append(chunk)
      }
      return [UInt8](data)
    }
  }

  /// Reads the raw local file header for `entry` directly from the mmap'd archive — no
  /// decompression, used only by the zip-alignment check. Layout per
  /// `android-bundle-analysis/reference.md`.
  public func localHeaderDataOffset(for entry: ZipEntry) throws -> UInt64 {
    let header = source.slice(Int(entry.localHeaderOffset), Int(entry.localHeaderOffset) + 30)
    let reader = ByteReader(header)
    reader.seek(26)
    let fileNameLength = try reader.readUInt16LE()
    let extraFieldLength = try reader.readUInt16LE()
    return entry.localHeaderOffset + 30 + UInt64(fileNameLength) + UInt64(extraFieldLength)
  }

  /// The local file header's compression method field (0 = stored, 8 = deflate) — read
  /// separately from `localHeaderDataOffset` so callers can decide `stored` without assuming
  /// field order.
  public func localHeaderCompressionMethod(for entry: ZipEntry) throws -> UInt16 {
    let header = source.slice(Int(entry.localHeaderOffset), Int(entry.localHeaderOffset) + 10)
    let reader = ByteReader(header)
    reader.seek(8)
    return try reader.readUInt16LE()
  }
}

private func readCentralDirectory(_ source: FileByteSource) throws -> [ZipEntry] {
  let bytes = source.readAll()
  guard let eocdStart = findEndOfCentralDirectory(bytes) else {
    throw ParseError(code: "NOT_A_ZIP", message: "no end-of-central-directory record found")
  }
  let eocdReader = ByteReader(bytes, offset: eocdStart + 10)
  let totalEntries = try eocdReader.readUInt16LE()
  try eocdReader.skip(4)
  let centralDirectoryOffset = try eocdReader.readUInt32LE()

  var entries: [ZipEntry] = []
  let reader = ByteReader(bytes, offset: Int(centralDirectoryOffset))
  for _ in 0..<totalEntries {
    let signature = try reader.readUInt32LE()
    guard signature == centralDirectoryFileHeaderSignature else {
      throw ParseError(code: "NOT_A_ZIP", message: "malformed central directory record")
    }
    try reader.skip(16)  // version made by/needed, flags, compression method, mod time/date, crc32
    let compressedSize = try reader.readUInt32LE()
    let uncompressedSize = try reader.readUInt32LE()
    let fileNameLength = try reader.readUInt16LE()
    let extraFieldLength = try reader.readUInt16LE()
    let fileCommentLength = try reader.readUInt16LE()
    try reader.skip(8)
    let localHeaderOffset = try reader.readUInt32LE()
    let fileNameBytes = try reader.readBytes(Int(fileNameLength))
    try reader.skip(Int(extraFieldLength))
    try reader.skip(Int(fileCommentLength))

    let filename = String(decoding: Data(fileNameBytes), as: UTF8.self)
    entries.append(
      ZipEntry(
        filename: filename,
        isDirectory: filename.hasSuffix("/"),
        compressedSize: Int(compressedSize),
        uncompressedSize: Int(uncompressedSize),
        localHeaderOffset: UInt64(localHeaderOffset)
      )
    )
  }
  return entries
}

/// Scans backward from the end of the file for the EOCD signature (comments can be up to 65535
/// bytes, so the record can't simply be assumed to start at a fixed offset from the end).
private func findEndOfCentralDirectory(_ bytes: [UInt8]) -> Int? {
  let minRecordSize = 22
  guard bytes.count >= minRecordSize else { return nil }
  let signatureBytes = withUnsafeBytes(of: endOfCentralDirectorySignature.littleEndian) {
    Array($0)
  }
  let searchStart = max(0, bytes.count - minRecordSize - 65535)
  var offset = bytes.count - minRecordSize
  while offset >= searchStart {
    if Array(bytes[offset..<(offset + 4)]) == signatureBytes {
      return offset
    }
    offset -= 1
  }
  return nil
}
