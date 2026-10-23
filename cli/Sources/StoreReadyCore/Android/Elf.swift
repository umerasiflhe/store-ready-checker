/// Mirrors `packages/core/src/android/elf.ts`. Only 64-bit little-endian ELF is supported —
/// irrelevant ABIs (32-bit, big-endian) are simply rejected, not treated as malformed. See
/// `android-bundle-analysis/reference.md` for the header/program-header layout.

public let ptLoad: UInt32 = 1
public let ptGnuRelro: UInt32 = 0x6474_e552

private let elfClass64: UInt8 = 2
private let elfData2Lsb: UInt8 = 1

public struct ProgramHeader: Sendable {
  public let pType: UInt32
  public let pVAddr: UInt64
  public let pMemSz: UInt64
  public let pAlign: UInt64

  public init(pType: UInt32, pVAddr: UInt64, pMemSz: UInt64, pAlign: UInt64) {
    self.pType = pType
    self.pVAddr = pVAddr
    self.pMemSz = pMemSz
    self.pAlign = pAlign
  }
}

public struct ElfFacts: Sendable {
  public let programHeaders: [ProgramHeader]
}

public func isElf64Le(_ bytes: [UInt8]) -> Bool {
  guard bytes.count >= 20 else { return false }
  return bytes[0] == 0x7f && bytes[1] == 0x45 && bytes[2] == 0x4c && bytes[3] == 0x46
    && bytes[4] == elfClass64 && bytes[5] == elfData2Lsb
}

public func parseElf(_ bytes: [UInt8]) -> Result<ElfFacts, ParseError> {
  tryParse("ELF_PARSE_FAILED") {
    guard isElf64Le(bytes) else {
      throw ParseError(
        code: "ELF_PARSE_FAILED",
        message: "not a 64-bit little-endian ELF file"
      )
    }
    let reader = ByteReader(bytes)
    reader.seek(32)
    let phOffset = try reader.readUInt64LE()
    reader.seek(54)
    let phEntSize = try reader.readUInt16LE()
    let phNum = try reader.readUInt16LE()

    var programHeaders: [ProgramHeader] = []
    for i in 0..<phNum {
      reader.seek(Int(phOffset) + Int(i) * Int(phEntSize))
      let pType = try reader.readUInt32LE()
      try reader.skip(4)
      try reader.skip(8)
      let pVAddr = try reader.readUInt64LE()
      try reader.skip(8)
      try reader.skip(8)
      let pMemSz = try reader.readUInt64LE()
      let pAlign = try reader.readUInt64LE()
      programHeaders.append(
        ProgramHeader(pType: pType, pVAddr: pVAddr, pMemSz: pMemSz, pAlign: pAlign)
      )
    }
    return ElfFacts(programHeaders: programHeaders)
  }
}
