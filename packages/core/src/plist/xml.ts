import { XMLParser } from 'fast-xml-parser';
import { type Result, tryParse } from '../util/result.ts';
import type { PlistDict, PlistValue } from './types.ts';

const TEXT_KEY = '#text';

export function parseXmlPlist(bytes: Uint8Array): Result<PlistValue> {
  return tryParse('XML_PLIST_PARSE_FAILED', () => decode(bytes));
}

function decode(bytes: Uint8Array): PlistValue {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parser = new XMLParser({
    preserveOrder: true,
    parseTagValue: false,
    trimValues: true,
    ignoreAttributes: true,
  });
  const parsed: unknown = parser.parse(xml);
  const topLevel = asArray(parsed);
  if (!topLevel) {
    throw new Error('expected an XML document');
  }
  const plistNode = topLevel.find((node) => tagOf(node) === 'plist');
  if (plistNode === undefined) {
    throw new Error('missing <plist> root element');
  }
  const root = childrenOf(plistNode).find((child) => tagOf(child) !== undefined);
  if (root === undefined) {
    throw new Error('<plist> has no value element');
  }
  return decodeValue(root);
}

// --- Minimal structural helpers over fast-xml-parser's `preserveOrder` tree. Every element node
// is `{ [tagName]: children[] }`; every text node is `{ '#text': string }`. ---

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/** The tag name of an element node, or `undefined` for a text node or anything unexpected. */
function tagOf(node: unknown): string | undefined {
  const record = asRecord(node);
  if (!record) {
    return undefined;
  }
  const keys = Object.keys(record).filter((key) => key !== TEXT_KEY);
  return keys.length === 1 ? keys[0] : undefined;
}

function childrenOf(node: unknown): unknown[] {
  const record = asRecord(node);
  const tag = tagOf(node);
  if (!record || tag === undefined) {
    return [];
  }
  return asArray(record[tag]) ?? [];
}

function textOf(node: unknown): string | undefined {
  const record = asRecord(node);
  if (!record) {
    return undefined;
  }
  const value = record[TEXT_KEY];
  return typeof value === 'string' ? value : undefined;
}

function textContentOf(node: unknown): string {
  const first = childrenOf(node).at(0);
  return (first === undefined ? undefined : textOf(first)) ?? '';
}

function decodeValue(node: unknown): PlistValue {
  const tag = tagOf(node);
  if (tag === undefined) {
    throw new Error('expected a plist value element');
  }
  switch (tag) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'string':
      return textContentOf(node);
    case 'integer':
      return parseNumberText(textContentOf(node), 'integer');
    case 'real':
      return parseNumberText(textContentOf(node), 'real');
    case 'date':
      return parseDateText(textContentOf(node));
    case 'data':
      return parseDataText(textContentOf(node));
    case 'array':
      return childrenOf(node).map(decodeValue);
    case 'dict':
      return decodeDict(node);
    default:
      throw new Error(`unsupported plist XML element <${tag}>`);
  }
}

function decodeDict(node: unknown): PlistDict {
  const children = childrenOf(node);
  const dict: PlistDict = {};
  for (let i = 0; i < children.length; i += 2) {
    const keyNode = children[i];
    if (tagOf(keyNode) !== 'key') {
      throw new Error('expected <key> element in <dict>');
    }
    const key = textContentOf(keyNode);
    const valueNode = children.at(i + 1);
    if (valueNode === undefined) {
      throw new Error(`dict key "${key}" has no matching value element`);
    }
    dict[key] = decodeValue(valueNode);
  }
  return dict;
}

function parseNumberText(text: string, kind: string): number {
  const value = Number(text.trim());
  if (!Number.isFinite(value)) {
    throw new Error(`invalid <${kind}> text: ${JSON.stringify(text)}`);
  }
  return value;
}

function parseDateText(text: string): Date {
  const date = new Date(text.trim());
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid <date> text: ${JSON.stringify(text)}`);
  }
  return date;
}

function parseDataText(text: string): Uint8Array {
  const binaryString = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
