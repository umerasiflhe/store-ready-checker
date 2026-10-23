import Testing

@testable import StoreReadyCore

@Test func readsLittleAndBigEndianIntegers() throws {
  let reader = ByteReader([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
  #expect(try reader.readUInt16LE() == 0x0201)
  reader.seek(0)
  #expect(try reader.readUInt16BE() == 0x0102)
  reader.seek(0)
  #expect(try reader.readUInt32LE() == 0x0403_0201)
  reader.seek(0)
  #expect(try reader.readUInt32BE() == 0x0102_0304)
  reader.seek(0)
  #expect(try reader.readUInt64LE() == 0x0807_0605_0403_0201)
  reader.seek(0)
  #expect(try reader.readUInt64BE() == 0x0102_0304_0506_0708)
}

@Test func throwsOutOfBoundsOnTruncatedReads() {
  let reader = ByteReader([0x01, 0x02])
  #expect(throws: OutOfBoundsError.self) {
    try reader.readUInt32LE()
  }
}

@Test func seekHasNoBoundsCheckButSubsequentReadDoes() {
  let reader = ByteReader([0x01])
  reader.seek(100)
  #expect(throws: OutOfBoundsError.self) {
    try reader.readUInt8()
  }
}

@Test func readBytesReturnsASliceAndAdvancesOffset() throws {
  let reader = ByteReader([0x01, 0x02, 0x03, 0x04])
  let slice = try reader.readBytes(2)
  #expect(Array(slice) == [0x01, 0x02])
  #expect(reader.offset == 2)
}

@Test func readCStringThrowsWhenUnterminated() {
  let reader = ByteReader([0x41, 0x42])
  #expect(throws: OutOfBoundsError.self) {
    try reader.readCString()
  }
}

@Test func readCStringStopsAtNulAndAdvancesPastIt() throws {
  let reader = ByteReader([0x41, 0x42, 0x00, 0x43])
  #expect(try reader.readCString() == "AB")
  #expect(reader.offset == 3)
}

@Test func cStringAtNeverThrowsOnUnterminatedInput() {
  #expect(cStringAt([0x41, 0x42], 0) == "AB")
}

@Test func cStringAtMapsHighBytesAsLatin1NotUtf8() {
  // 0x80 as UTF-8 would be invalid on its own; this must map to Unicode scalar 128, not throw
  // or substitute a replacement character.
  let text = cStringAt([0x80, 0x00], 0)
  #expect(text.unicodeScalars.first?.value == 0x80)
}

@Test func cStringAtReturnsEmptyStringForOutOfRangeOffset() {
  #expect(cStringAt([0x41], 5) == "")
}
