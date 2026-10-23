/// Mirrors `packages/core/src/android/axml.ts`: a binary XML (AXML) decoder for APK manifests.
/// Cites AOSP `libs/androidfw/include/androidfw/ResourceTypes.h`
/// (`ResChunk_header`/`ResStringPool_header`/`ResXMLTree_node`/`_namespaceExt`/`_attrExt`/
/// `_attribute`, `Res_value`). See `android-bundle-analysis/reference.md` for the chunk header
/// layout.

private let resStringPoolType: UInt16 = 0x0001
private let resXmlStartNamespaceType: UInt16 = 0x0100
private let resXmlEndNamespaceType: UInt16 = 0x0101
private let resXmlStartElementType: UInt16 = 0x0102
private let resXmlEndElementType: UInt16 = 0x0103
private let resXmlResourceMapType: UInt16 = 0x0180

private let utf8Flag: UInt32 = 1 << 8
private let noString: UInt32 = 0xffff_ffff

private let typeString: UInt8 = 0x03
private let typeIntDec: UInt8 = 0x10
private let typeIntHex: UInt8 = 0x11
private let typeIntBoolean: UInt8 = 0x12

private struct StringPool {
  let strings: [String]
}

private func stringAt(_ pool: StringPool, _ index: UInt32) -> String? {
  if index == noString { return nil }
  guard index < UInt32(pool.strings.count) else { return nil }
  return pool.strings[Int(index)]
}

private func readVarLength8(_ reader: ByteReader) throws -> Int {
  let first = try reader.readUInt8()
  if first & 0x80 == 0 { return Int(first) }
  let second = try reader.readUInt8()
  return (Int(first & 0x7f) << 8) | Int(second)
}

private func readVarLength16(_ reader: ByteReader) throws -> Int {
  let first = try reader.readUInt16LE()
  if first & 0x8000 == 0 { return Int(first) }
  let second = try reader.readUInt16LE()
  return (Int(first & 0x7fff) << 16) | Int(second)
}

private func readUtf8StringEntry(_ bytes: [UInt8], _ offset: Int) throws -> String {
  let reader = ByteReader(bytes, offset: offset)
  _ = try readVarLength8(reader)  // UTF-16 character count, unused when decoding UTF-8 bytes
  let byteLength = try readVarLength8(reader)
  let stringBytes = try reader.readBytes(byteLength)
  return String(decoding: stringBytes, as: UTF8.self)
}

private func readUtf16StringEntry(_ bytes: [UInt8], _ offset: Int) throws -> String {
  let reader = ByteReader(bytes, offset: offset)
  let charLength = try readVarLength16(reader)
  let stringBytes = try reader.readBytes(charLength * 2)
  var codeUnits: [UInt16] = []
  codeUnits.reserveCapacity(charLength)
  var iterator = stringBytes.makeIterator()
  while let low = iterator.next(), let high = iterator.next() {
    codeUnits.append(UInt16(low) | (UInt16(high) << 8))
  }
  return String(decoding: codeUnits, as: UTF16.self)
}

private func readStringPool(_ bytes: [UInt8], _ chunkStart: Int, _ chunkSize: Int) throws
  -> StringPool
{
  let reader = ByteReader(bytes, offset: chunkStart + 8)
  let stringCount = try reader.readUInt32LE()
  try reader.skip(4)  // styleCount
  let flags = try reader.readUInt32LE()
  let stringsStart = try reader.readUInt32LE()
  try reader.skip(4)  // stylesStart

  var offsets: [UInt32] = []
  for _ in 0..<stringCount {
    offsets.append(try reader.readUInt32LE())
  }

  let isUtf8 = (flags & utf8Flag) != 0
  let dataStart = chunkStart + Int(stringsStart)
  var strings: [String] = []
  for offset in offsets {
    let entryOffset = dataStart + Int(offset)
    strings.append(
      isUtf8
        ? try readUtf8StringEntry(bytes, entryOffset)
        : try readUtf16StringEntry(bytes, entryOffset)
    )
  }
  return StringPool(strings: strings)
}

private struct RawResValue {
  let dataType: UInt8
  let data: UInt32
}

private func readResValue(_ reader: ByteReader) throws -> RawResValue {
  try reader.skip(2)  // size
  try reader.skip(1)  // res0
  let dataType = try reader.readUInt8()
  let data = try reader.readUInt32LE()
  return RawResValue(dataType: dataType, data: data)
}

private func toAttributeValue(
  _ pool: StringPool,
  rawValueIndex: UInt32,
  resValue: RawResValue
) -> AttributeValue {
  switch resValue.dataType {
  case typeString:
    return .string(stringAt(pool, resValue.data) ?? "")
  case typeIntDec, typeIntHex:
    return .int(Int(resValue.data))
  case typeIntBoolean:
    return .boolean(resValue.data != 0)
  default:
    return .string(stringAt(pool, rawValueIndex) ?? "")
  }
}

private final class MutableElement {
  var name: String = ""
  var attributes: [RawAttribute] = []
  var children: [MutableElement] = []
}

private func toRawElement(_ element: MutableElement) -> RawElement {
  RawElement(
    name: element.name,
    attributes: element.attributes,
    children: element.children.map(toRawElement)
  )
}

public func decodeApkManifest(_ bytes: [UInt8]) -> Result<RawElement, ParseError> {
  tryParse("AXML_PARSE_FAILED") {
    let reader = ByteReader(bytes)
    try reader.skip(2)  // type (RES_XML_TYPE), not checked
    let outerHeaderSize = try reader.readUInt16LE()
    let outerSize = Int(try reader.readUInt32LE())
    if outerSize > bytes.count {
      throw ParseError(code: "AXML_PARSE_FAILED", message: "truncated AXML document")
    }
    reader.seek(Int(outerHeaderSize))

    var pool: StringPool?
    var resourceMap: [UInt32] = []
    var stack: [MutableElement] = []
    var root: MutableElement?

    while reader.offset < outerSize, reader.remaining >= 8 {
      let chunkStart = reader.offset
      let type = try reader.readUInt16LE()
      let headerSize = try reader.readUInt16LE()
      let size = Int(try reader.readUInt32LE())
      if size < Int(headerSize) || chunkStart + size > bytes.count {
        throw ParseError(
          code: "AXML_PARSE_FAILED",
          message: "malformed chunk at offset \(chunkStart)"
        )
      }

      if type == resStringPoolType {
        pool = try readStringPool(bytes, chunkStart, size)
        reader.seek(chunkStart + size)
        continue
      }
      if type == resXmlResourceMapType {
        reader.seek(chunkStart + Int(headerSize))
        while reader.offset + 4 <= chunkStart + size {
          resourceMap.append(try reader.readUInt32LE())
        }
        reader.seek(chunkStart + size)
        continue
      }

      guard let currentPool = pool else {
        throw ParseError(
          code: "AXML_PARSE_FAILED",
          message: "encountered an XML node before the string pool chunk"
        )
      }

      switch type {
      case resXmlStartNamespaceType, resXmlEndNamespaceType:
        reader.seek(chunkStart + size)

      case resXmlStartElementType:
        reader.seek(chunkStart + Int(headerSize))
        try reader.skip(4)  // namespace ResStringPool_ref, unused
        let nameIndex = try reader.readUInt32LE()
        let attributeStart = Int(try reader.readUInt16LE())
        let attributeSize = Int(try reader.readUInt16LE())
        let attributeCount = Int(try reader.readUInt16LE())
        try reader.skip(6)  // idIndex, classIndex, styleIndex

        let attrExtStart = chunkStart + Int(headerSize)
        var attributes: [RawAttribute] = []
        for i in 0..<attributeCount {
          reader.seek(attrExtStart + attributeStart + i * attributeSize)
          try reader.skip(4)  // attribute namespace, unused
          let attrNameIndex = try reader.readUInt32LE()
          let rawValueIndex = try reader.readUInt32LE()
          let resValue = try readResValue(reader)
          let name = stringAt(currentPool, attrNameIndex) ?? ""
          let resourceId =
            attrNameIndex < UInt32(resourceMap.count) ? resourceMap[Int(attrNameIndex)] : nil
          let value = toAttributeValue(
            currentPool, rawValueIndex: rawValueIndex, resValue: resValue)
          attributes.append(RawAttribute(name: name, resourceId: resourceId, value: value))
        }

        let element = MutableElement()
        element.name = stringAt(currentPool, nameIndex) ?? ""
        element.attributes = attributes
        if let top = stack.last {
          top.children.append(element)
        } else {
          root = element
        }
        stack.append(element)
        reader.seek(chunkStart + size)

      case resXmlEndElementType:
        if !stack.isEmpty { stack.removeLast() }
        reader.seek(chunkStart + size)

      default:
        reader.seek(chunkStart + size)
      }
    }

    guard let root else {
      throw ParseError(code: "AXML_PARSE_FAILED", message: "no root element found")
    }
    return toRawElement(root)
  }
}
