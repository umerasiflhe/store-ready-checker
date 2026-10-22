// Binary XML (AXML) decoder for APK `AndroidManifest.xml`. Chunk/struct layout per AOSP
// `libs/androidfw/include/androidfw/ResourceTypes.h` (ResChunk_header, ResStringPool_header,
// ResXMLTree_node/_namespaceExt/_attrExt/_attribute, Res_value) — see the android-bundle-analysis
// skill's reference.md for a summary.
import { ByteReader } from '../util/bytes.ts';
import { tryParse, type Result } from '../util/result.ts';
import type { AttributeValue, RawAttribute, RawElement } from './manifest.ts';

const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_START_NAMESPACE_TYPE = 0x0100;
const RES_XML_END_NAMESPACE_TYPE = 0x0101;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;

const UTF8_FLAG = 1 << 8;
const NO_STRING = 0xffffffff;

const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_INT_BOOLEAN = 0x12;

interface StringPool {
  readonly strings: readonly string[];
}

function readStringPool(reader: ByteReader, chunkStart: number, chunkSize: number): StringPool {
  const stringCount = reader.readUint32LE();
  reader.skip(4); // styleCount — styled spans are never relevant to manifest attribute values.
  const flags = reader.readUint32LE();
  const stringsStart = reader.readUint32LE();
  reader.skip(4); // stylesStart

  const offsets: number[] = [];
  for (let i = 0; i < stringCount; i += 1) {
    offsets.push(reader.readUint32LE());
  }

  const isUtf8 = (flags & UTF8_FLAG) !== 0;
  const dataStart = chunkStart + stringsStart;
  const strings = offsets.map((offset) =>
    isUtf8
      ? readUtf8StringEntry(reader, dataStart + offset)
      : readUtf16StringEntry(reader, dataStart + offset),
  );

  reader.seek(chunkStart + chunkSize);
  return { strings };
}

function readVarLength8(reader: ByteReader): number {
  const first = reader.readUint8();
  if ((first & 0x80) === 0) {
    return first;
  }
  const second = reader.readUint8();
  return ((first & 0x7f) << 8) | second;
}

function readUtf8StringEntry(reader: ByteReader, offset: number): string {
  reader.seek(offset);
  readVarLength8(reader); // UTF-16 character count — not needed, we decode the UTF-8 bytes.
  const byteLength = readVarLength8(reader);
  const bytes = reader.readBytes(byteLength);
  return new TextDecoder('utf-8').decode(bytes);
}

function readVarLength16(reader: ByteReader): number {
  const first = reader.readUint16LE();
  if ((first & 0x8000) === 0) {
    return first;
  }
  const second = reader.readUint16LE();
  return ((first & 0x7fff) << 16) | second;
}

function readUtf16StringEntry(reader: ByteReader, offset: number): string {
  reader.seek(offset);
  const charLength = readVarLength16(reader);
  const bytes = reader.readBytes(charLength * 2);
  return new TextDecoder('utf-16le').decode(bytes);
}

function stringAt(pool: StringPool, index: number): string | undefined {
  if (index === NO_STRING) return undefined;
  return pool.strings.at(index);
}

interface ParsedAttribute {
  readonly rawValueIndex: number;
  readonly dataType: number;
  readonly data: number;
}

function readResValue(reader: ByteReader): { readonly dataType: number; readonly data: number } {
  reader.skip(2); // size
  reader.skip(1); // res0
  const dataType = reader.readUint8();
  const data = reader.readUint32LE();
  return { dataType, data };
}

function toAttributeValue(pool: StringPool, attribute: ParsedAttribute): AttributeValue {
  switch (attribute.dataType) {
    case TYPE_STRING:
      return { kind: 'string', value: stringAt(pool, attribute.data) ?? '' };
    case TYPE_INT_DEC:
    case TYPE_INT_HEX:
      return { kind: 'int', value: attribute.data };
    case TYPE_INT_BOOLEAN:
      return { kind: 'boolean', value: attribute.data !== 0 };
    default:
      return { kind: 'string', value: stringAt(pool, attribute.rawValueIndex) ?? '' };
  }
}

/** Decodes an APK's binary-XML `AndroidManifest.xml` into the shared `RawElement` shape. Never
 * throws on malformed/truncated input. */
export function decodeApkManifest(bytes: Uint8Array): Result<RawElement> {
  return tryParse('AXML_PARSE_FAILED', () => decode(bytes));
}

interface MutableElement {
  name: string;
  attributes: RawAttribute[];
  children: MutableElement[];
}

function decode(bytes: Uint8Array): RawElement {
  const reader = new ByteReader(bytes);
  reader.skip(2); // outer ResXMLTree_header type (RES_XML_TYPE)
  const outerHeaderSize = reader.readUint16LE();
  const outerSize = reader.readUint32LE();
  if (outerSize > bytes.length) {
    throw new Error('AXML chunk size exceeds the buffer length');
  }
  reader.seek(outerHeaderSize);

  let pool: StringPool | undefined;
  let resourceMap: readonly number[] = [];
  const stack: MutableElement[] = [];
  let root: MutableElement | undefined;

  while (reader.offset < outerSize && reader.remaining >= 8) {
    const chunkStart = reader.offset;
    const type = reader.readUint16LE();
    const headerSize = reader.readUint16LE();
    const size = reader.readUint32LE();
    if (size < headerSize || chunkStart + size > bytes.length) {
      throw new Error(`malformed chunk at offset ${String(chunkStart)}`);
    }

    if (type === RES_STRING_POOL_TYPE) {
      pool = readStringPool(reader, chunkStart, size);
      reader.seek(chunkStart + size);
      continue;
    }
    if (type === RES_XML_RESOURCE_MAP_TYPE) {
      const ids: number[] = [];
      reader.seek(chunkStart + headerSize);
      while (reader.offset + 4 <= chunkStart + size) {
        ids.push(reader.readUint32LE());
      }
      resourceMap = ids;
      reader.seek(chunkStart + size);
      continue;
    }

    if (!pool) {
      throw new Error('encountered an XML node before the string pool chunk');
    }

    if (type === RES_XML_START_NAMESPACE_TYPE || type === RES_XML_END_NAMESPACE_TYPE) {
      reader.seek(chunkStart + size);
      continue;
    }

    if (type === RES_XML_START_ELEMENT_TYPE) {
      reader.seek(chunkStart + headerSize);
      reader.skip(4); // namespace ResStringPool_ref
      const nameIndex = reader.readUint32LE();
      const attributeStart = reader.readUint16LE();
      const attributeSize = reader.readUint16LE();
      const attributeCount = reader.readUint16LE();
      reader.skip(6); // idIndex, classIndex, styleIndex

      const attrExtStart = chunkStart + headerSize;
      const attributes: RawAttribute[] = [];
      for (let i = 0; i < attributeCount; i += 1) {
        reader.seek(attrExtStart + attributeStart + i * attributeSize);
        reader.skip(4); // namespace ResStringPool_ref
        const attrNameIndex = reader.readUint32LE();
        const rawValueIndex = reader.readUint32LE();
        const { dataType, data } = readResValue(reader);
        const name = stringAt(pool, attrNameIndex) ?? '';
        attributes.push({
          name,
          resourceId: resourceMap.at(attrNameIndex),
          value: toAttributeValue(pool, { rawValueIndex, dataType, data }),
        });
      }

      const element: MutableElement = {
        name: stringAt(pool, nameIndex) ?? '',
        attributes,
        children: [],
      };
      const parent = stack.at(-1);
      if (parent) {
        parent.children.push(element);
      } else {
        root = element;
      }
      stack.push(element);
      reader.seek(chunkStart + size);
      continue;
    }

    if (type === RES_XML_END_ELEMENT_TYPE) {
      stack.pop();
      reader.seek(chunkStart + size);
      continue;
    }

    // CDATA and any other chunk type: skip, manifests carry no text content we need.
    reader.seek(chunkStart + size);
  }

  if (!root) {
    throw new Error('no root element found');
  }
  return root;
}
