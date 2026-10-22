// Builds a synthetic AAB module AndroidManifest.xml as `aapt.pb.XmlNode` protobuf bytes (never a
// real aapt2 output — make-fixture skill). Resource IDs match
// packages/core/src/android/manifest.ts's constants.
import { create, toBinary, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ItemSchema,
  PrimitiveSchema,
  XmlAttributeSchema,
  XmlNodeSchema,
  type Item,
  type Primitive,
} from '../../packages/core/src/gen/aapt2/Resources_pb.ts';

type AttributeInit = MessageInitShape<typeof XmlAttributeSchema>;

const RES_ID_NAME = 0x01010003;
const RES_ID_MIN_SDK_VERSION = 0x0101020c;
const RES_ID_VERSION_CODE = 0x0101021b;
const RES_ID_VERSION_NAME = 0x0101021c;
const RES_ID_TARGET_SDK_VERSION = 0x01010270;

export type TargetSdk = number | { readonly codename: string };

export interface AndroidManifestOptions {
  readonly packageName?: string;
  readonly versionCode?: number;
  readonly versionName?: string;
  /** `undefined` omits `<uses-sdk>` entirely. */
  readonly usesSdk?: { readonly minSdkVersion?: number; readonly targetSdkVersion?: TargetSdk };
  readonly usesFeatures?: readonly string[];
}

function intItem(value: number): Item {
  const oneofValue: Extract<Primitive['oneofValue'], { case: 'intDecimalValue' }> = {
    case: 'intDecimalValue',
    value,
  };
  const primitive = create(PrimitiveSchema, { oneofValue });
  return create(ItemSchema, { value: { case: 'prim', value: primitive } });
}

function stringItem(value: string): Item {
  return create(ItemSchema, { value: { case: 'str', value: { value } } });
}

function targetSdkAttribute(targetSdk: TargetSdk): AttributeInit[] {
  return [
    typeof targetSdk === 'number'
      ? {
          name: 'targetSdkVersion',
          resourceId: RES_ID_TARGET_SDK_VERSION,
          value: String(targetSdk),
          compiledItem: intItem(targetSdk),
        }
      : {
          name: 'targetSdkVersion',
          resourceId: RES_ID_TARGET_SDK_VERSION,
          value: targetSdk.codename,
          compiledItem: stringItem(targetSdk.codename),
        },
  ];
}

/** Builds `<module>/manifest/AndroidManifest.xml` bytes for an AAB module. */
export function buildAabManifest(options: AndroidManifestOptions): Uint8Array {
  const attribute: AttributeInit[] = [];
  if (options.packageName !== undefined) {
    attribute.push({ name: 'package', value: options.packageName });
  }
  if (options.versionCode !== undefined) {
    attribute.push({
      name: 'versionCode',
      resourceId: RES_ID_VERSION_CODE,
      value: String(options.versionCode),
      compiledItem: intItem(options.versionCode),
    });
  }
  if (options.versionName !== undefined) {
    attribute.push({
      name: 'versionName',
      resourceId: RES_ID_VERSION_NAME,
      value: options.versionName,
      compiledItem: stringItem(options.versionName),
    });
  }

  const child: MessageInitShape<typeof XmlNodeSchema>[] = [];
  if (options.usesSdk) {
    const usesSdkAttrs: AttributeInit[] = [];
    if (options.usesSdk.minSdkVersion !== undefined) {
      usesSdkAttrs.push({
        name: 'minSdkVersion',
        resourceId: RES_ID_MIN_SDK_VERSION,
        value: String(options.usesSdk.minSdkVersion),
        compiledItem: intItem(options.usesSdk.minSdkVersion),
      });
    }
    if (options.usesSdk.targetSdkVersion !== undefined) {
      usesSdkAttrs.push(...targetSdkAttribute(options.usesSdk.targetSdkVersion));
    }
    child.push({
      node: { case: 'element', value: { name: 'uses-sdk', attribute: usesSdkAttrs } },
    });
  }
  for (const feature of options.usesFeatures ?? []) {
    child.push({
      node: {
        case: 'element',
        value: {
          name: 'uses-feature',
          attribute: [{ name: 'name', resourceId: RES_ID_NAME, value: feature }],
        },
      },
    });
  }

  const node = create(XmlNodeSchema, {
    node: { case: 'element', value: { name: 'manifest', attribute, child } },
  });
  return toBinary(XmlNodeSchema, node);
}
