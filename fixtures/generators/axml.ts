// Minimal AXML (binary XML) encoder for a synthetic APK AndroidManifest.xml (make-fixture skill:
// never a real aapt2 output). Chunk layout mirrors
// packages/core/src/android/axml.ts's reader, which follows AOSP's ResourceTypes.h.
import type { AndroidManifestOptions } from './androidManifest.ts';

const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_TYPE = 0x0003;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;

const NO_STRING = 0xffffffff;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;

const RES_ID_NAME = 0x01010003;
const RES_ID_MIN_SDK_VERSION = 0x0101020c;
const RES_ID_VERSION_CODE = 0x0101021b;
const RES_ID_VERSION_NAME = 0x0101021c;
const RES_ID_TARGET_SDK_VERSION = 0x01010270;

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

interface StringTable {
  readonly strings: string[];
  readonly resourceIds: number[];
}

/** Interns `name` with a resource ID, keeping all resource-ID'd names contiguous at the front of
 * the pool (the convention `resourceMap.at(index)` relies on — see axml.ts's reader). */
function internResourceName(table: StringTable, name: string, resourceId: number): number {
  const existing = table.strings.indexOf(name);
  if (existing !== -1 && existing < table.resourceIds.length) return existing;
  table.strings.splice(table.resourceIds.length, 0, name);
  table.resourceIds.push(resourceId);
  return table.resourceIds.length - 1;
}

function internPlain(table: StringTable, value: string): number {
  const existing = table.strings.indexOf(value);
  if (existing !== -1) return existing;
  table.strings.push(value);
  return table.strings.length - 1;
}

/** Builds a complete `AndroidManifest.xml` AXML document for an APK. */
export function buildApkManifest(options: AndroidManifestOptions): Uint8Array {
  const table: StringTable = { strings: [], resourceIds: [] };

  // Phase 1: intern every resource-ID'd attribute *name* first — internResourceName splices new
  // entries into the front of the pool, which would shift any plain string interned beforehand.
  const versionCodeNameIndex =
    options.versionCode !== undefined
      ? internResourceName(table, 'versionCode', RES_ID_VERSION_CODE)
      : -1;
  const versionNameNameIndex =
    options.versionName !== undefined
      ? internResourceName(table, 'versionName', RES_ID_VERSION_NAME)
      : -1;
  const minSdkVersionNameIndex =
    options.usesSdk?.minSdkVersion !== undefined
      ? internResourceName(table, 'minSdkVersion', RES_ID_MIN_SDK_VERSION)
      : -1;
  const targetSdkVersionNameIndex =
    options.usesSdk?.targetSdkVersion !== undefined
      ? internResourceName(table, 'targetSdkVersion', RES_ID_TARGET_SDK_VERSION)
      : -1;
  const featureNameIndex =
    (options.usesFeatures ?? []).length > 0 ? internResourceName(table, 'name', RES_ID_NAME) : -1;

  // Phase 2: plain (non-resource-ID'd) element/attribute names and all value strings.
  const manifestNameIndex = internPlain(table, 'manifest');
  const usesSdkElementNameIndex = options.usesSdk ? internPlain(table, 'uses-sdk') : -1;
  const usesFeatureElementNameIndex =
    (options.usesFeatures ?? []).length > 0 ? internPlain(table, 'uses-feature') : -1;

  const manifestAttrs: AttrInit[] = [];
  if (options.packageName !== undefined) {
    manifestAttrs.push({
      nameIndex: internPlain(table, 'package'),
      dataType: TYPE_STRING,
      data: internPlain(table, options.packageName),
    });
  }
  if (options.versionCode !== undefined) {
    manifestAttrs.push({
      nameIndex: versionCodeNameIndex,
      dataType: TYPE_INT_DEC,
      data: options.versionCode,
    });
  }
  if (options.versionName !== undefined) {
    manifestAttrs.push({
      nameIndex: versionNameNameIndex,
      dataType: TYPE_STRING,
      data: internPlain(table, options.versionName),
    });
  }

  let usesSdkAttrs: AttrInit[] | undefined;
  if (options.usesSdk) {
    usesSdkAttrs = [];
    if (options.usesSdk.minSdkVersion !== undefined) {
      usesSdkAttrs.push({
        nameIndex: minSdkVersionNameIndex,
        dataType: TYPE_INT_DEC,
        data: options.usesSdk.minSdkVersion,
      });
    }
    if (options.usesSdk.targetSdkVersion !== undefined) {
      const targetSdk = options.usesSdk.targetSdkVersion;
      usesSdkAttrs.push(
        typeof targetSdk === 'number'
          ? { nameIndex: targetSdkVersionNameIndex, dataType: TYPE_INT_DEC, data: targetSdk }
          : {
              nameIndex: targetSdkVersionNameIndex,
              dataType: TYPE_STRING,
              data: internPlain(table, targetSdk.codename),
            },
      );
    }
  }

  const usesFeatureAttrs = (options.usesFeatures ?? []).map((feature) => ({
    nameIndex: featureNameIndex,
    dataType: TYPE_STRING,
    data: internPlain(table, feature),
  }));

  const usesSdkNameIndex = usesSdkElementNameIndex;
  const usesFeatureNameIndex = usesFeatureElementNameIndex;

  const body: number[] = [...startElement(manifestNameIndex, manifestAttrs)];
  if (usesSdkAttrs) {
    body.push(...startElement(usesSdkNameIndex, usesSdkAttrs));
    body.push(...endElement(usesSdkNameIndex));
  }
  for (const attr of usesFeatureAttrs) {
    body.push(...startElement(usesFeatureNameIndex, [attr]));
    body.push(...endElement(usesFeatureNameIndex));
  }
  body.push(...endElement(manifestNameIndex));

  const fileBody = [...stringPool(table.strings), ...resourceMapChunk(table.resourceIds), ...body];
  return new Uint8Array(chunk(RES_XML_TYPE, [], fileBody));
}
