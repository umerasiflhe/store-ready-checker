import { describe, expect, it } from 'vitest';
import { decodeApkManifest } from './axml.ts';

// --- Minimal test-only AXML (binary XML) encoder, built from AOSP
// libs/androidfw/include/androidfw/ResourceTypes.h. Never a real aapt2 output
// (make-fixture skill: synthetic fixtures only). ---

const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_TYPE = 0x0003;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;

const NO_STRING = 0xffffffff;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;

function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}
function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** `headerExtra` is written immediately after the generic 8-byte chunk header (so
 * `headerSize = 8 + headerExtra.length`); `data` is everything after that. */
function chunk(type: number, headerExtra: readonly number[], data: readonly number[]): number[] {
  const headerSize = 8 + headerExtra.length;
  const size = headerSize + data.length;
  return [...u16le(type), ...u16le(headerSize), ...u32le(size), ...headerExtra, ...data];
}

/** A UTF-8-flagged string pool chunk (ResStringPool_header.flags bit 0x100). */
function stringPool(strings: readonly string[]): number[] {
  const entries = strings.map((value) => {
    const bytes = new TextEncoder().encode(value);
    return [bytes.length, bytes.length, ...bytes, 0];
  });
  const offsets: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    offsets.push(offset);
    offset += entry.length;
  }
  const stringsStart = 8 + 20 + strings.length * 4; // headerSize + the index array
  const headerExtra = [
    ...u32le(strings.length), // stringCount
    ...u32le(0), // styleCount
    ...u32le(1 << 8), // flags: UTF8_FLAG
    ...u32le(stringsStart),
    ...u32le(0), // stylesStart
  ];
  const data = [...offsets.flatMap(u32le), ...entries.flat()];
  return chunk(RES_STRING_POOL_TYPE, headerExtra, data);
}

function resourceMapChunk(ids: readonly number[]): number[] {
  return chunk(RES_XML_RESOURCE_MAP_TYPE, [], ids.flatMap(u32le));
}

interface AttrInit {
  readonly nameIndex: number;
  readonly dataType: number;
  readonly data: number;
}

function resValue(dataType: number, data: number): number[] {
  return [...u16le(8), 0, dataType, ...u32le(data)];
}

const NODE_HEADER_EXTRA = [...u32le(0), ...u32le(NO_STRING)]; // lineNumber, comment

function startElement(nameIndex: number, attrs: readonly AttrInit[]): number[] {
  const attributeStart = 20;
  const attributeSize = 20;
  const extStruct = [
    ...u32le(NO_STRING), // namespace
    ...u32le(nameIndex),
    ...u16le(attributeStart),
    ...u16le(attributeSize),
    ...u16le(attrs.length),
    ...u16le(0),
    ...u16le(0),
    ...u16le(0),
  ];
  const attrBytes = attrs.flatMap((attr) => [
    ...u32le(NO_STRING), // namespace
    ...u32le(attr.nameIndex),
    ...u32le(NO_STRING), // rawValue
    ...resValue(attr.dataType, attr.data),
  ]);
  return chunk(RES_XML_START_ELEMENT_TYPE, NODE_HEADER_EXTRA, [...extStruct, ...attrBytes]);
}

function endElement(nameIndex: number): number[] {
  const extStruct = [...u32le(NO_STRING), ...u32le(nameIndex)];
  return chunk(RES_XML_END_ELEMENT_TYPE, NODE_HEADER_EXTRA, extStruct);
}

interface ElementInit {
  readonly name: string;
  readonly attrs: readonly AttrInit[];
  readonly children?: readonly ElementInit[];
}

/** Builds a minimal valid AXML document. `strings[0..resourceIds.length-1]` are the names that
 * carry a resource ID (per aapt2 convention, these come first in the pool); any later string has
 * no resource ID. */
function buildAxml(
  strings: readonly string[],
  resourceIds: readonly number[],
  root: ElementInit,
): Uint8Array {
  const nameIndex = (name: string): number => strings.indexOf(name);

  function emit(element: ElementInit): number[] {
    const bytes = startElement(nameIndex(element.name), element.attrs);
    for (const child of element.children ?? []) {
      bytes.push(...emit(child));
    }
    bytes.push(...endElement(nameIndex(element.name)));
    return bytes;
  }

  const body = [...stringPool(strings), ...resourceMapChunk(resourceIds), ...emit(root)];
  return new Uint8Array(chunk(RES_XML_TYPE, [], body));
}

describe('decodeApkManifest', () => {
  // strings: 0=targetSdkVersion (has a resource ID) 1=manifest 2=package 3=com.example.app
  // 4=uses-sdk — none of 1..4 are covered by resourceIds, so they resolve to no resource ID.
  const strings = ['targetSdkVersion', 'manifest', 'package', 'com.example.app', 'uses-sdk'];
  const resourceIds = [0x01010270];

  it('decodes element names and a compiled integer attribute', () => {
    const bytes = buildAxml(strings, resourceIds, {
      name: 'manifest',
      attrs: [{ nameIndex: strings.indexOf('package'), dataType: TYPE_STRING, data: 3 }],
      children: [
        {
          name: 'uses-sdk',
          attrs: [
            { nameIndex: strings.indexOf('targetSdkVersion'), dataType: TYPE_INT_DEC, data: 36 },
          ],
        },
      ],
    });

    const result = decodeApkManifest(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('manifest');
    expect(result.value.attributes).toEqual([
      {
        name: 'package',
        resourceId: undefined,
        value: { kind: 'string', value: 'com.example.app' },
      },
    ]);
    expect(result.value.children).toHaveLength(1);
    expect(result.value.children[0]).toEqual({
      name: 'uses-sdk',
      attributes: [
        { name: 'targetSdkVersion', resourceId: 0x01010270, value: { kind: 'int', value: 36 } },
      ],
      children: [],
    });
  });

  it('returns a typed error on truncated input', () => {
    const result = decodeApkManifest(new Uint8Array([3, 0, 8, 0, 20, 0, 0, 0]));
    expect(result.ok).toBe(false);
  });

  it('returns a typed error on garbage input', () => {
    const result = decodeApkManifest(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(result.ok).toBe(false);
  });

  it('returns a typed error when a chunk size is smaller than its header size', () => {
    const bytes = new Uint8Array([3, 0, 8, 0, 4, 0, 0, 0]);
    const result = decodeApkManifest(bytes);
    expect(result.ok).toBe(false);
  });
});
