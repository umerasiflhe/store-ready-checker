/// Mirrors `packages/core/src/android/nativeLibs.ts`: walks every module's `lib/<abi>/*.so`
/// (AAB) or the single APK's `lib/<abi>/*.so`, resolving each entry's zip-alignment data offset
/// for the APK-only `AND-16K-003` check.

public struct NativeLibFacts: Sendable {
  public let path: String
  public let abi: String
  public let elf: ElfFacts?
  /// `nil` when the source wasn't inspected (AAB) — `AND-16K-003` is APK-only.
  public let stored: Bool?
  public let zipDataOffset: Int?
}

public struct NativeLibsFacts: Sendable {
  public let libraries: [NativeLibFacts]
}

/// Matches anywhere in the path (not anchored to the start): for AAB this matches
/// `<module>/lib/<abi>/foo.so`, capturing `<abi>` regardless of module prefix; for APK it matches
/// the root-level `lib/<abi>/foo.so`.
private nonisolated(unsafe) let nativeLibPathRegex = /lib\/([^\/]+)\/[^\/]+\.so$/

private let zipCompressionStored: UInt16 = 0

public func collectNativeLibs(_ archive: ZipArchive, inspectZipAlignment: Bool) -> NativeLibsFacts {
  let entries = archive.list().filter { $0.filename.contains(nativeLibPathRegex) }
  var libraries: [NativeLibFacts] = []

  for entry in entries {
    let abi = entry.filename.firstMatch(of: nativeLibPathRegex).map { String($0.1) } ?? "unknown"

    var elf: ElfFacts?
    if case .success(let bytes) = archive.readEntry(entry.filename) {
      if case .success(let parsed) = parseElf(bytes) {
        elf = parsed
      }
    }

    var stored: Bool?
    var zipDataOffset: Int?
    if inspectZipAlignment {
      if let compression = try? archive.localHeaderCompressionMethod(for: entry) {
        let isStored = compression == zipCompressionStored
        stored = isStored
        if isStored {
          zipDataOffset = (try? archive.localHeaderDataOffset(for: entry)).map(Int.init)
        }
      }
    }

    libraries.append(
      NativeLibFacts(
        path: entry.filename,
        abi: abi,
        elf: elf,
        stored: stored,
        zipDataOffset: zipDataOffset
      )
    )
  }

  return NativeLibsFacts(libraries: libraries)
}
