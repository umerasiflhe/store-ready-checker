import Foundation

/// Random-access byte source over a local file, memory-mapped so the whole archive is never
/// loaded into memory at once (brief §6.6) — the CLI equivalent of the web worker's
/// `BlobByteSource`/`Blob.slice`.
public final class FileByteSource {
  private let data: Data

  public init(url: URL) throws {
    data = try Data(contentsOf: url, options: .mappedIfSafe)
  }

  public var size: Int { data.count }

  public func slice(_ start: Int, _ end: Int) -> [UInt8] {
    let clampedStart = max(0, min(start, data.count))
    let clampedEnd = max(clampedStart, min(end, data.count))
    return [UInt8](data[clampedStart..<clampedEnd])
  }

  public func readAll() -> [UInt8] {
    [UInt8](data)
  }
}
