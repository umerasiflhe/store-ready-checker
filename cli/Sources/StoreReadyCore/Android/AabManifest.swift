/// Mirrors `packages/core/src/android/aabManifest.ts`: decodes the `aapt.pb.XmlNode` protobuf
/// (generated from `proto/aapt2/Resources.proto` into `Generated/aapt2/Resources.pb.swift`) into
/// the shared `RawElement` tree `Manifest.swift` reads uniformly alongside the APK's AXML tree.

public func decodeAabManifest(_ bytes: [UInt8]) -> Result<RawElement, ParseError> {
  tryParse("AAB_MANIFEST_PARSE_FAILED") {
    let node = try Aapt_Pb_XmlNode(serializedBytes: bytes)
    guard case .element(let element)? = node.node else {
      throw ParseError(
        code: "AAB_MANIFEST_PARSE_FAILED",
        message: "root XmlNode is not an element"
      )
    }
    return toRawElement(element)
  }
}

private func toRawElement(_ element: Aapt_Pb_XmlElement) -> RawElement {
  RawElement(
    name: element.name,
    attributes: element.attribute.map(toRawAttribute),
    children: element.child.compactMap { child in
      guard case .element(let childElement)? = child.node else { return nil }
      return toRawElement(childElement)
    }
  )
}

private func toRawAttribute(_ attribute: Aapt_Pb_XmlAttribute) -> RawAttribute {
  let resourceId: UInt32? = attribute.resourceID == 0 ? nil : attribute.resourceID
  let value: AttributeValue =
    attribute.hasCompiledItem
    ? itemToAttributeValue(attribute.compiledItem) : .string(attribute.value)
  return RawAttribute(name: attribute.name, resourceId: resourceId, value: value)
}

private func itemToAttributeValue(_ item: Aapt_Pb_Item) -> AttributeValue {
  switch item.value {
  case .str(let string):
    return .string(string.value)
  case .prim(let primitive):
    switch primitive.oneofValue {
    case .intDecimalValue(let value):
      return .int(Int(value))
    case .intHexadecimalValue(let value):
      return .int(Int(value))
    case .booleanValue(let value):
      return .boolean(value)
    default:
      return .string("")
    }
  default:
    return .string("")
  }
}
