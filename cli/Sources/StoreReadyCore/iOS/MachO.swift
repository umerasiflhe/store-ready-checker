/// Mirrors `packages/core/src/ios/machO.ts`. Only 64-bit Mach-O is supported (every iOS app
/// slice in 2026 is arm64). Byte order: fat headers and `cputype`/`archCount` are big-endian;
/// everything inside a thin Mach-O (load commands, segments/sections, symtab, dyld info, chained
/// fixups) is little-endian. See `ipa-analysis/reference.md` for the header/load-command layout.

public struct MachOFacts: Sendable {
  public let encrypted: Bool
  /// Sorted, deduplicated union of LC_SYMTAB undefined-external symbols, the legacy bind-opcode
  /// stream, and the chained-fixups imports table.
  public let symbols: [String]
  /// `__TEXT,__objc_methname` strings, in file order — not deduplicated or sorted.
  public let selectors: [String]
}

private let fatMagic: UInt32 = 0xcafe_babe
private let fatMagic64: UInt32 = 0xcafe_babf
private let machMagic64: UInt32 = 0xfeed_facf
private let cpuTypeArm64: UInt32 = 0x0100_000c

private let lcSegment64: UInt32 = 0x19
private let lcSymtab: UInt32 = 0x2
private let lcDyldInfo: UInt32 = 0x22
private let lcDyldInfoOnly: UInt32 = 0x8000_0022
private let lcEncryptionInfo64: UInt32 = 0x2c
private let lcDyldChainedFixups: UInt32 = 0x8000_0034

private let nTypeMask: UInt8 = 0x0e
private let nExt: UInt8 = 0x01
private let nUndf: UInt8 = 0x00

public func parseMachO(_ bytes: [UInt8]) -> Result<MachOFacts, ParseError> {
  tryParse("MACH_O_PARSE_FAILED") {
    let reader = ByteReader(bytes)
    let magicBE = try reader.readUInt32BE()
    if magicBE == fatMagic || magicBE == fatMagic64 {
      return try decodeFat(bytes, is64: magicBE == fatMagic64)
    }
    reader.seek(0)
    let magicLE = try reader.readUInt32LE()
    if magicLE == machMagic64 {
      return try decodeThin(bytes)
    }
    throw ParseError(
      code: "MACH_O_PARSE_FAILED",
      message: "unrecognized Mach-O magic 0x\(String(magicBE, radix: 16))"
    )
  }
}

private struct FatSlice {
  let offset: Int
  let size: Int
}

private func decodeFat(_ bytes: [UInt8], is64: Bool) throws -> MachOFacts {
  let reader = ByteReader(bytes)
  reader.seek(4)
  let archCount = try reader.readUInt32BE()
  let archEntrySize = is64 ? 32 : 20

  var fallback: FatSlice?
  for i in 0..<archCount {
    let archOffset = 8 + Int(i) * archEntrySize
    reader.seek(archOffset)
    let cputype = try reader.readUInt32BE()
    let offset: Int
    let size: Int
    if is64 {
      reader.seek(archOffset + 8)
      offset = Int(try reader.readUInt64BE())
      size = Int(try reader.readUInt64BE())
    } else {
      reader.seek(archOffset + 8)
      offset = Int(try reader.readUInt32BE())
      size = Int(try reader.readUInt32BE())
    }
    if fallback == nil {
      fallback = FatSlice(offset: offset, size: size)
    }
    if cputype == cpuTypeArm64 {
      return try decodeThin(sliceBytes(bytes, offset, size))
    }
  }
  guard let fallback else {
    throw ParseError(code: "MACH_O_PARSE_FAILED", message: "fat Mach-O has no architecture slices")
  }
  return try decodeThin(sliceBytes(bytes, fallback.offset, fallback.size))
}

/// Clamps rather than trapping — `Uint8Array.slice` in TS silently clamps out-of-range bounds
/// too, which a later bounds-checked read (or the outer `tryParse`) catches.
private func sliceBytes(_ bytes: [UInt8], _ offset: Int, _ size: Int) -> [UInt8] {
  let start = max(0, min(offset, bytes.count))
  let end = max(start, min(offset + size, bytes.count))
  return Array(bytes[start..<end])
}

private func decodeThin(_ thin: [UInt8]) throws -> MachOFacts {
  let reader = ByteReader(thin)
  reader.seek(16)
  let ncmds = try reader.readUInt32LE()
  let sizeofcmds = try reader.readUInt32LE()

  var pos = 32
  let commandsEnd = 32 + Int(sizeofcmds)
  var symbols = Set<String>()
  var encrypted = false
  var objcMethName: (offset: Int, size: Int)?

  var i: UInt32 = 0
  while i < ncmds, pos + 8 <= commandsEnd {
    reader.seek(pos)
    let cmd = try reader.readUInt32LE()
    let cmdsize = try reader.readUInt32LE()
    let next = pos + Int(cmdsize)

    switch cmd {
    case lcSymtab:
      try collectSymtabSymbols(thin, cmdPos: pos, into: &symbols)
    case lcDyldInfo, lcDyldInfoOnly:
      try collectDyldInfoSymbols(thin, cmdPos: pos, into: &symbols)
    case lcDyldChainedFixups:
      try collectChainedFixupSymbols(thin, cmdPos: pos, into: &symbols)
    case lcEncryptionInfo64:
      reader.seek(pos + 16)
      if try reader.readUInt32LE() != 0 {
        encrypted = true
      }
    case lcSegment64:
      if let found = try findObjcMethNameSection(thin, cmdPos: pos) {
        objcMethName = found
      }
    default:
      break
    }

    pos = next
    i += 1
  }

  let selectors =
    (encrypted || objcMethName == nil) ? [] : collectSelectors(thin, section: objcMethName!)
  return MachOFacts(encrypted: encrypted, symbols: symbols.sorted(), selectors: selectors)
}

private func collectSymtabSymbols(
  _ thin: [UInt8],
  cmdPos: Int,
  into symbols: inout Set<String>
) throws {
  let reader = ByteReader(thin)
  reader.seek(cmdPos + 8)
  let symoff = Int(try reader.readUInt32LE())
  let nsyms = try reader.readUInt32LE()
  let stroff = Int(try reader.readUInt32LE())

  for i in 0..<nsyms {
    let entry = symoff + Int(i) * 16
    if entry + 16 > thin.count { break }
    reader.seek(entry)
    let strx = Int(try reader.readUInt32LE())
    let type = thin[entry + 4]
    let isUndefined = (type & nTypeMask) == nUndf
    let isExternal = (type & nExt) != 0
    if isUndefined, isExternal, strx != 0 {
      let name = cStringAt(thin, stroff + strx)
      if !name.isEmpty { symbols.insert(name) }
    }
  }
}

private func collectDyldInfoSymbols(
  _ thin: [UInt8],
  cmdPos: Int,
  into symbols: inout Set<String>
) throws {
  let reader = ByteReader(thin)
  // Offsets relative to cmdPos within dyld_info_command: rebase(8), bind(16), weak_bind(24),
  // lazy_bind(32). The rebase table is included here too (the TS source's own comment says it
  // isn't, but the code reads all four) — replicated exactly, not "fixed", for parity.
  for fieldOffset in [8, 16, 24, 32] {
    reader.seek(cmdPos + fieldOffset)
    let off = Int(try reader.readUInt32LE())
    let size = Int(try reader.readUInt32LE())
    collectBindSymbols(thin, offset: off, size: size, into: &symbols)
  }
}

private func collectBindSymbols(
  _ thin: [UInt8],
  offset: Int,
  size: Int,
  into symbols: inout Set<String>
) {
  if offset == 0 || size == 0 { return }
  let end = min(offset + size, thin.count)
  var pos = offset
  while pos < end {
    let byte = thin[pos]
    pos += 1
    let opcode = byte & 0xf0
    switch opcode {
    case 0x00, 0x10, 0x30, 0x50, 0x90, 0xb0:
      continue
    case 0x40:
      let start = pos
      while pos < end, thin[pos] != 0 { pos += 1 }
      let name = cStringAt(thin, start)
      if !name.isEmpty { symbols.insert(name) }
      pos += 1
    case 0x20, 0x60, 0x70, 0x80, 0xa0:
      pos = skipVarint(thin, pos, end)
    case 0xc0:
      pos = skipVarint(thin, pos, end)
      pos = skipVarint(thin, pos, end)
    default:
      return
    }
  }
}

private func skipVarint(_ thin: [UInt8], _ start: Int, _ end: Int) -> Int {
  var pos = start
  while pos < end {
    let byte = thin[pos]
    pos += 1
    if byte & 0x80 == 0 { return pos }
  }
  return end
}

private func collectChainedFixupSymbols(
  _ thin: [UInt8],
  cmdPos: Int,
  into symbols: inout Set<String>
) throws {
  let reader = ByteReader(thin)
  reader.seek(cmdPos + 8)
  let dataoff = Int(try reader.readUInt32LE())
  if dataoff == 0 || dataoff + 28 > thin.count { return }

  reader.seek(dataoff + 8)
  let importsOffset = Int(try reader.readUInt32LE())
  let symbolsOffset = Int(try reader.readUInt32LE())
  let importsCount = try reader.readUInt32LE()
  let importsFormat = try reader.readUInt32LE()
  let symbolsFormat = try reader.readUInt32LE()
  if symbolsFormat != 0 { return }

  let importsBase = dataoff + importsOffset
  let symbolsBase = dataoff + symbolsOffset
  let entrySize = importsFormat == 3 ? 16 : (importsFormat == 2 ? 8 : 4)

  for i in 0..<importsCount {
    let entry = importsBase + Int(i) * entrySize
    if entry + entrySize > thin.count { break }
    let nameOffset: Int
    if importsFormat == 3 {
      reader.seek(entry)
      let word = try reader.readUInt64LE()
      nameOffset = Int(word >> 32)
    } else {
      reader.seek(entry)
      let word = try reader.readUInt32LE()
      nameOffset = Int(word >> 9)
    }
    let name = cStringAt(thin, symbolsBase + nameOffset)
    if !name.isEmpty { symbols.insert(name) }
  }
}

/// Reads up to `length` bytes starting at `offset`, stopping at the first NUL — a bounded
/// C-string read, Latin-1-style like `cStringAt`, used for fixed-width segment/section names.
private func asciiFixed(_ bytes: [UInt8], _ offset: Int, _ length: Int) -> String {
  guard offset >= 0, offset < bytes.count else { return "" }
  let end = min(offset + length, bytes.count)
  var scalars = String.UnicodeScalarView()
  var i = offset
  while i < end, bytes[i] != 0 {
    scalars.append(Unicode.Scalar(bytes[i]))
    i += 1
  }
  return String(scalars)
}

private func findObjcMethNameSection(
  _ thin: [UInt8],
  cmdPos: Int
) throws -> (offset: Int, size: Int)? {
  let segname = asciiFixed(thin, cmdPos + 8, 16)
  if segname != "__TEXT" { return nil }

  let reader = ByteReader(thin)
  reader.seek(cmdPos + 64)
  let nsects = try reader.readUInt32LE()
  let sectionsStart = cmdPos + 72

  for i in 0..<nsects {
    let sectionStart = sectionsStart + Int(i) * 80
    if sectionStart + 80 > thin.count { break }
    let sectname = asciiFixed(thin, sectionStart, 16)
    if sectname == "__objc_methname" {
      reader.seek(sectionStart + 40)
      let size = Int(try reader.readUInt64LE())
      let offset = Int(try reader.readUInt32LE())
      return (offset, size)
    }
  }
  return nil
}

private func collectSelectors(_ thin: [UInt8], section: (offset: Int, size: Int)) -> [String] {
  let end = min(section.offset + section.size, thin.count)
  var start = max(0, section.offset)
  var pos = start
  var selectors: [String] = []
  while pos < end {
    if thin[pos] == 0 {
      if pos > start {
        selectors.append(cStringAt(thin, start))
      }
      start = pos + 1
    }
    pos += 1
  }
  return selectors
}
