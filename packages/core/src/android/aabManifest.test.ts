import { create, toBinary, type MessageInitShape } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';
import {
  ItemSchema,
  PrimitiveSchema,
  XmlElementSchema,
  XmlNodeSchema,
  type Item,
  type Primitive,
} from '../gen/aapt2/Resources_pb.ts';
import { decodeAabManifest } from './aabManifest.ts';

function manifestNode(element: MessageInitShape<typeof XmlElementSchema>): Uint8Array {
  const node = create(XmlNodeSchema, { node: { case: 'element', value: element } });
  return toBinary(XmlNodeSchema, node);
}

function intItem(value: number): Item {
  // Annotated to the single non-deprecated union member: Primitive.oneofValue's "value" property
  // name is otherwise shared with the deprecated dimensionValueDeprecated/fractionValueDeprecated
  // members, which trips @typescript-eslint/no-deprecated if TS resolves against the full union.
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

describe('decodeAabManifest', () => {
  it('decodes package/version attributes and a compiled integer target SDK', () => {
    const bytes = manifestNode({
      name: 'manifest',
      attribute: [
        { name: 'package', value: 'com.example.app' },
        {
          name: 'versionCode',
          resourceId: 0x0101021b,
          value: '7',
          compiledItem: intItem(7),
        },
      ],
      child: [
        {
          node: {
            case: 'element',
            value: {
              name: 'uses-sdk',
              attribute: [
                {
                  name: 'targetSdkVersion',
                  resourceId: 0x01010270,
                  value: '36',
                  compiledItem: intItem(36),
                },
              ],
            },
          },
        },
      ],
    });

    const result = decodeAabManifest(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('manifest');
    expect(result.value.attributes).toEqual([
      {
        name: 'package',
        resourceId: undefined,
        value: { kind: 'string', value: 'com.example.app' },
      },
      { name: 'versionCode', resourceId: 0x0101021b, value: { kind: 'int', value: 7 } },
    ]);
    expect(result.value.children).toHaveLength(1);
    expect(result.value.children[0]?.name).toBe('uses-sdk');
  });

  it('decodes a preview codename target SDK as a string Item', () => {
    const bytes = manifestNode({
      name: 'manifest',
      child: [
        {
          node: {
            case: 'element',
            value: {
              name: 'uses-sdk',
              attribute: [
                {
                  name: 'targetSdkVersion',
                  resourceId: 0x01010270,
                  value: 'Baklava',
                  compiledItem: stringItem('Baklava'),
                },
              ],
            },
          },
        },
      ],
    });

    const result = decodeAabManifest(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.children[0]?.attributes[0]).toEqual({
      name: 'targetSdkVersion',
      resourceId: 0x01010270,
      value: { kind: 'string', value: 'Baklava' },
    });
  });

  it('decodes a boolean compiled Primitive', () => {
    const booleanValue: Extract<Primitive['oneofValue'], { case: 'booleanValue' }> = {
      case: 'booleanValue',
      value: true,
    };
    const item = create(ItemSchema, {
      value: { case: 'prim', value: create(PrimitiveSchema, { oneofValue: booleanValue }) },
    });
    const bytes = manifestNode({
      name: 'manifest',
      attribute: [{ name: 'debuggable', value: 'true', compiledItem: item }],
    });
    const result = decodeAabManifest(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attributes[0]?.value).toEqual({ kind: 'boolean', value: true });
  });

  it('falls back to an empty string for a Primitive of an unsupported flavor', () => {
    const floatValue: Extract<Primitive['oneofValue'], { case: 'floatValue' }> = {
      case: 'floatValue',
      value: 1.5,
    };
    const item = create(ItemSchema, {
      value: { case: 'prim', value: create(PrimitiveSchema, { oneofValue: floatValue }) },
    });
    const bytes = manifestNode({
      name: 'manifest',
      attribute: [{ name: 'weird', value: '1.5', compiledItem: item }],
    });
    const result = decodeAabManifest(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attributes[0]?.value).toEqual({ kind: 'string', value: '' });
  });

  it('falls back to an empty string for a compiled Item that is neither str nor prim', () => {
    const item = create(ItemSchema, { value: { case: 'id', value: {} } });
    const bytes = manifestNode({
      name: 'manifest',
      attribute: [{ name: 'weird', value: 'raw', compiledItem: item }],
    });
    const result = decodeAabManifest(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attributes[0]?.value).toEqual({ kind: 'string', value: '' });
  });

  it('returns a typed error when the root XmlNode is not an element', () => {
    const node = create(XmlNodeSchema, { node: { case: 'text', value: 'not an element' } });
    const result = decodeAabManifest(toBinary(XmlNodeSchema, node));
    expect(result.ok).toBe(false);
  });

  it('returns a typed error on truncated/garbage input', () => {
    const result = decodeAabManifest(new Uint8Array([0xff, 0xff, 0xff]));
    expect(result.ok).toBe(false);
  });
});
