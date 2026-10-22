import { fromBinary } from '@bufbuild/protobuf';
import type { Item, XmlAttribute, XmlElement } from '../gen/aapt2/Resources_pb.ts';
import { XmlNodeSchema } from '../gen/aapt2/Resources_pb.ts';
import { tryParse, type Result } from '../util/result.ts';
import type { AttributeValue, RawAttribute, RawElement } from './manifest.ts';

function itemToAttributeValue(item: Item | undefined): AttributeValue {
  if (item?.value.case === 'str') {
    return { kind: 'string', value: item.value.value.value };
  }
  if (item?.value.case === 'prim') {
    const prim = item.value.value.oneofValue;
    switch (prim.case) {
      case 'intDecimalValue':
      case 'intHexadecimalValue':
        return { kind: 'int', value: prim.value };
      case 'booleanValue':
        return { kind: 'boolean', value: prim.value };
      default:
        break;
    }
  }
  return { kind: 'string', value: '' };
}

function toRawAttribute(attribute: XmlAttribute): RawAttribute {
  return {
    name: attribute.name,
    resourceId: attribute.resourceId === 0 ? undefined : attribute.resourceId,
    value: attribute.compiledItem
      ? itemToAttributeValue(attribute.compiledItem)
      : { kind: 'string', value: attribute.value },
  };
}

function toRawElement(element: XmlElement): RawElement {
  const children: RawElement[] = [];
  for (const child of element.child) {
    if (child.node.case === 'element') {
      children.push(toRawElement(child.node.value));
    }
  }
  return {
    name: element.name,
    attributes: element.attribute.map(toRawAttribute),
    children,
  };
}

/** Decodes an `aapt.pb.XmlNode`-encoded `AndroidManifest.xml` (AAB module manifest) into the
 * shared `RawElement` shape. Never throws on malformed/truncated input. */
export function decodeAabManifest(bytes: Uint8Array): Result<RawElement> {
  return tryParse('AAB_MANIFEST_PARSE_FAILED', () => {
    const root = fromBinary(XmlNodeSchema, bytes);
    if (root.node.case !== 'element') {
      throw new Error('root XmlNode is not an element');
    }
    return toRawElement(root.node.value);
  });
}
