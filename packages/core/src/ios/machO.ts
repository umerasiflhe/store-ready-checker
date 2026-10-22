import { cStringAt } from '../util/bytes.ts';
import { type Result, tryParse } from '../util/result.ts';

// Byte layouts per .claude/skills/ipa-analysis/reference.md and mach-o/loader.h. Only the 64-bit
// Mach-O format is supported, since every iOS app slice in 2026 is arm64.
const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const MH_MAGIC_64 = 0xfeedfacf;
const CPU_TYPE_ARM64 = 0x0100000c;

const LC_SEGMENT_64 = 0x19;
const LC_SYMTAB = 0x2;
const LC_DYLD_INFO = 0x22;
const LC_DYLD_INFO_ONLY = 0x80000022;
const LC_ENCRYPTION_INFO_64 = 0x2c;
const LC_DYLD_CHAINED_FIXUPS = 0x80000034;

const N_TYPE_MASK = 0x0e;
const N_EXT = 0x01;
const N_UNDF = 0x00;

export interface MachOFacts {
  readonly encrypted: boolean;
  /** Imported symbol names, unioned from LC_SYMTAB, chained fixups, and bind opcodes. */
  readonly symbols: readonly string[];
  /** Objective-C selector names from `__TEXT,__objc_methname`; empty when encrypted. */
  readonly selectors: readonly string[];
}

export function parseMachO(bytes: Uint8Array): Result<MachOFacts> {
  return tryParse('MACH_O_PARSE_FAILED', () => decode(bytes));
}

function decode(bytes: Uint8Array): MachOFacts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, false);
  if (magic === FAT_MAGIC || magic === FAT_MAGIC_64) {
    return decodeFat(bytes, view, magic === FAT_MAGIC_64);
  }
  if (view.getUint32(0, true) === MH_MAGIC_64) {
    return decodeThin(bytes);
  }
  throw new Error(`unrecognized Mach-O magic 0x${magic.toString(16)}`);
}

function decodeFat(bytes: Uint8Array, view: DataView, is64: boolean): MachOFacts {
  const archCount = view.getUint32(4, false);
  const archEntrySize = is64 ? 32 : 20;
  let fallback: { offset: number; size: number } | undefined;
  for (let i = 0; i < archCount; i += 1) {
    const archOffset = 8 + i * archEntrySize;
    const cputype = view.getUint32(archOffset, false);
    const offset = is64
      ? Number(view.getBigUint64(archOffset + 8, false))
      : view.getUint32(archOffset + 8, false);
    const size = is64
      ? Number(view.getBigUint64(archOffset + 16, false))
      : view.getUint32(archOffset + 12, false);
    fallback ??= { offset, size };
    if (cputype === CPU_TYPE_ARM64) {
      return decodeThin(bytes.slice(offset, offset + size));
    }
  }
  if (fallback === undefined) {
    throw new Error('fat Mach-O has no architecture slices');
  }
  return decodeThin(bytes.slice(fallback.offset, fallback.offset + fallback.size));
}

function decodeThin(thin: Uint8Array): MachOFacts {
  const view = new DataView(thin.buffer, thin.byteOffset, thin.byteLength);
  const ncmds = view.getUint32(16, true);
  const sizeofcmds = view.getUint32(20, true);

  const symbols = new Set<string>();
  let encrypted = false;
  let objcMethName: { offset: number; size: number } | undefined;

  let pos = 32;
  const commandsEnd = 32 + sizeofcmds;
  for (let i = 0; i < ncmds && pos + 8 <= commandsEnd; i += 1) {
    const cmd = view.getUint32(pos, true);
    const cmdsize = view.getUint32(pos + 4, true);
    const next = pos + cmdsize;

    if (cmd === LC_SYMTAB) {
      collectSymtabSymbols(thin, view, pos, symbols);
    } else if (cmd === LC_DYLD_INFO || cmd === LC_DYLD_INFO_ONLY) {
      collectDyldInfoSymbols(thin, view, pos, symbols);
    } else if (cmd === LC_DYLD_CHAINED_FIXUPS) {
      collectChainedFixupSymbols(thin, view, pos, symbols);
    } else if (cmd === LC_ENCRYPTION_INFO_64) {
      if (view.getUint32(pos + 16, true) !== 0) {
        encrypted = true;
      }
    } else if (cmd === LC_SEGMENT_64) {
      const found = findObjcMethNameSection(thin, view, pos);
      if (found) {
        objcMethName = found;
      }
    }

    pos = next;
  }

  const selectors = encrypted || !objcMethName ? [] : collectSelectors(thin, objcMethName);

  return { encrypted, symbols: [...symbols].sort(), selectors };
}

function collectSymtabSymbols(
  thin: Uint8Array,
  view: DataView,
  cmdPos: number,
  symbols: Set<string>,
): void {
  const symoff = view.getUint32(cmdPos + 8, true);
  const nsyms = view.getUint32(cmdPos + 12, true);
  const stroff = view.getUint32(cmdPos + 16, true);

  for (let i = 0; i < nsyms; i += 1) {
    const entry = symoff + i * 16;
    if (entry + 16 > thin.length) {
      break;
    }
    const strx = view.getUint32(entry, true);
    const type = view.getUint8(entry + 4);
    const isUndefined = (type & N_TYPE_MASK) === N_UNDF;
    const isExternal = (type & N_EXT) !== 0;
    if (isUndefined && isExternal && strx !== 0) {
      const name = cStringAt(thin, stroff + strx);
      if (name !== '') {
        symbols.add(name);
      }
    }
  }
}

function collectDyldInfoSymbols(
  thin: Uint8Array,
  view: DataView,
  cmdPos: number,
  symbols: Set<string>,
): void {
  const fields = [8, 16, 24, 32] as const; // bind, weak_bind, lazy_bind (skip rebase at +0, export at +32... see below)
  // dyld_info_command (after cmd/cmdsize): rebase_off/size, bind_off/size, weak_bind_off/size,
  // lazy_bind_off/size, export_off/size — 10 uint32 fields, offsets 0,4,8,...,36 from cmdPos+8.
  for (const fieldOffset of fields) {
    const off = view.getUint32(cmdPos + fieldOffset, true);
    const size = view.getUint32(cmdPos + fieldOffset + 4, true);
    collectBindSymbols(thin, view, off, size, symbols);
  }
}

function collectBindSymbols(
  thin: Uint8Array,
  view: DataView,
  offset: number,
  size: number,
  symbols: Set<string>,
): void {
  if (offset === 0 || size === 0) {
    return;
  }
  const end = Math.min(offset + size, thin.length);
  let pos = offset;
  while (pos < end) {
    const byte = view.getUint8(pos);
    pos += 1;
    const opcode = byte & 0xf0;
    switch (opcode) {
      case 0x00: // BIND_OPCODE_DONE
      case 0x10: // BIND_OPCODE_SET_DYLIB_ORDINAL_IMM
      case 0x30: // BIND_OPCODE_SET_DYLIB_SPECIAL_IMM
      case 0x50: // BIND_OPCODE_SET_TYPE_IMM
      case 0x90: // BIND_OPCODE_DO_BIND
      case 0xb0: // BIND_OPCODE_DO_BIND_ADD_ADDR_IMM_SCALED
        break;
      case 0x40: {
        // BIND_OPCODE_SET_SYMBOL_TRAILING_FLAGS_IMM
        const start = pos;
        while (pos < end && view.getUint8(pos) !== 0) {
          pos += 1;
        }
        const name = cStringAt(thin, start);
        if (name !== '') {
          symbols.add(name);
        }
        pos += 1;
        break;
      }
      case 0x20: // SET_DYLIB_ORDINAL_ULEB
      case 0x60: // SET_ADDEND_SLEB
      case 0x70: // SET_SEGMENT_AND_OFFSET_ULEB
      case 0x80: // ADD_ADDR_ULEB
      case 0xa0: // DO_BIND_ADD_ADDR_ULEB
        pos = skipVarint(view, pos, end);
        break;
      case 0xc0: // DO_BIND_ULEB_TIMES_SKIPPING_ULEB
        pos = skipVarint(view, pos, end);
        pos = skipVarint(view, pos, end);
        break;
      default:
        return;
    }
  }
}

function skipVarint(view: DataView, start: number, end: number): number {
  let pos = start;
  while (pos < end) {
    const byte = view.getUint8(pos);
    pos += 1;
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return pos;
}

function collectChainedFixupSymbols(
  thin: Uint8Array,
  view: DataView,
  cmdPos: number,
  symbols: Set<string>,
): void {
  const dataoff = view.getUint32(cmdPos + 8, true);
  if (dataoff === 0 || dataoff + 28 > thin.length) {
    return;
  }
  const importsOffset = view.getUint32(dataoff + 8, true);
  const symbolsOffset = view.getUint32(dataoff + 12, true);
  const importsCount = view.getUint32(dataoff + 16, true);
  const importsFormat = view.getUint32(dataoff + 20, true);
  const symbolsFormat = view.getUint32(dataoff + 24, true);
  if (symbolsFormat !== 0) {
    return; // compressed symbol pools are not supported.
  }

  const importsBase = dataoff + importsOffset;
  const symbolsBase = dataoff + symbolsOffset;
  const entrySize = importsFormat === 3 ? 16 : importsFormat === 2 ? 8 : 4;

  for (let i = 0; i < importsCount; i += 1) {
    const entry = importsBase + i * entrySize;
    if (entry + entrySize > thin.length) {
      break;
    }
    const nameOffset =
      importsFormat === 3
        ? Number(view.getBigUint64(entry, true) >> 32n)
        : view.getUint32(entry, true) >>> 9;
    const name = cStringAt(thin, symbolsBase + nameOffset);
    if (name !== '') {
      symbols.add(name);
    }
  }
}

function findObjcMethNameSection(
  thin: Uint8Array,
  view: DataView,
  cmdPos: number,
): { offset: number; size: number } | undefined {
  const segname = asciiFixed(thin, cmdPos + 8, 16);
  if (segname !== '__TEXT') {
    return undefined;
  }
  const nsects = view.getUint32(cmdPos + 64, true);
  // segment_command_64 fixed header is 72 bytes: cmd+cmdsize(8) + segname(16) + vmaddr/vmsize/
  // fileoff/filesize(32) + maxprot/initprot/nsects/flags(16) = 8+16+32+16 = 72.
  const sectionsStart = cmdPos + 72;
  for (let i = 0; i < nsects; i += 1) {
    const sectionStart = sectionsStart + i * 80;
    if (sectionStart + 80 > thin.length) {
      break;
    }
    const sectname = asciiFixed(thin, sectionStart, 16);
    if (sectname === '__objc_methname') {
      const size = Number(view.getBigUint64(sectionStart + 40, true));
      const offset = view.getUint32(sectionStart + 48, true);
      return { offset, size };
    }
  }
  return undefined;
}

function collectSelectors(thin: Uint8Array, section: { offset: number; size: number }): string[] {
  const end = Math.min(section.offset + section.size, thin.length);
  const selectors: string[] = [];
  let start = section.offset;
  for (let pos = section.offset; pos < end; pos += 1) {
    if (thin[pos] === 0) {
      if (pos > start) {
        selectors.push(cStringAt(thin, start));
      }
      start = pos + 1;
    }
  }
  return selectors;
}

function asciiFixed(bytes: Uint8Array, offset: number, length: number): string {
  let result = '';
  for (const byte of bytes.subarray(offset, offset + length)) {
    if (byte === 0) {
      break;
    }
    result += String.fromCharCode(byte);
  }
  return result;
}
