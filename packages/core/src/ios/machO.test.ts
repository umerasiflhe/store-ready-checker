import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseMachO } from './machO.ts';

// --- Minimal test-only Mach-O encoder. Builds the smallest valid thin/fat 64-bit binaries that
// exercise each load command the decoder understands, per
// .claude/skills/ipa-analysis/reference.md. Never a real compiler output (make-fixture skill). ---

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}
function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}
function u64le(value: number | bigint): number[] {
  const big = BigInt(value);
  const bytes: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    bytes.push(Number((big >> BigInt(8 * i)) & 0xffn));
  }
  return bytes;
}
function cstr(value: string): number[] {
  return [...Array.from(value, (char) => char.charCodeAt(0)), 0];
}
function fixed(value: string, length: number): number[] {
  const bytes = Array.from(value, (char) => char.charCodeAt(0));
  while (bytes.length < length) bytes.push(0);
  return bytes.slice(0, length);
}
function uleb(value: number): number[] {
  const bytes: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return bytes;
}

const LC_SEGMENT_64 = 0x19;
const LC_SYMTAB = 0x2;
const LC_DYLD_INFO_ONLY = 0x80000022;
const LC_ENCRYPTION_INFO_64 = 0x2c;
const LC_DYLD_CHAINED_FIXUPS = 0x80000034;

// BIND_OPCODE_* immediates, enough to build a realistic stream.
const BIND_SET_DYLIB_ORDINAL_IMM = 0x11; // opcode 0x10 | ordinal 1
const BIND_SET_SYMBOL_TRAILING_FLAGS_IMM = 0x40;
const BIND_SET_TYPE_IMM = 0x51; // opcode 0x50 | type 1
const BIND_SET_SEGMENT_AND_OFFSET_ULEB = 0x71; // opcode 0x70 | segment index 1
const BIND_DO_BIND = 0x90;
const BIND_DONE = 0x00;

function encodeBindStream(symbolName: string, segmentOffset: number): number[] {
  return [
    BIND_SET_DYLIB_ORDINAL_IMM,
    BIND_SET_SYMBOL_TRAILING_FLAGS_IMM,
    ...cstr(symbolName),
    BIND_SET_TYPE_IMM,
    BIND_SET_SEGMENT_AND_OFFSET_ULEB,
    ...uleb(segmentOffset),
    BIND_DO_BIND,
    BIND_DONE,
  ];
}

interface ThinMachOOptions {
  readonly symtabSymbols?: readonly { name: string; undefinedExternal: boolean }[];
  readonly bindSymbol?: string;
  readonly lazyBindSymbol?: string;
  readonly chainedImportNames?: readonly string[];
  readonly encrypted?: boolean;
  readonly objcSelectors?: readonly string[];
}

function buildThinMachO(options: ThinMachOOptions): Uint8Array {
  const symtabSymbols = options.symtabSymbols ?? [];
  const bindBytes = options.bindSymbol ? encodeBindStream(options.bindSymbol, 0x10) : [];
  const lazyBindBytes = options.lazyBindSymbol
    ? encodeBindStream(options.lazyBindSymbol, 0x20)
    : [];
  const chainedImportNames = options.chainedImportNames ?? [];
  const objcSelectors = options.objcSelectors ?? [];

  const hasSymtab = symtabSymbols.length > 0;
  const hasDyldInfo = bindBytes.length > 0 || lazyBindBytes.length > 0;
  const hasChainedFixups = chainedImportNames.length > 0;
  const hasEncryption = options.encrypted !== undefined;
  const hasObjcSection = objcSelectors.length > 0;

  const cmdSizes: number[] = [];
  if (hasSymtab) cmdSizes.push(24);
  if (hasDyldInfo) cmdSizes.push(48);
  if (hasChainedFixups) cmdSizes.push(16);
  if (hasEncryption) cmdSizes.push(24);
  if (hasObjcSection) cmdSizes.push(72 + 80); // one section
  const sizeofcmds = cmdSizes.reduce((a, b) => a + b, 0);
  const ncmds = cmdSizes.length;
  const tailStart = 32 + sizeofcmds;

  // --- Lay out tail data, tracking absolute offsets. ---
  let cursor = tailStart;
  const tailParts: number[][] = [];

  let symoff = 0;
  let stroff = 0;
  let nsyms = 0;
  if (hasSymtab) {
    const strings: number[] = [0]; // index 0 is reserved/empty per convention
    const nlistEntries: number[] = [];
    for (const sym of symtabSymbols) {
      const strx = strings.length;
      strings.push(...cstr(sym.name));
      const type = sym.undefinedExternal ? 0x01 : 0x0f; // N_UNDF|N_EXT vs a defined+external type
      nlistEntries.push(...u32le(strx), type, 0, ...[0, 0], ...u64le(0));
    }
    symoff = cursor;
    tailParts.push(nlistEntries);
    cursor += nlistEntries.length;
    stroff = cursor;
    tailParts.push(strings);
    cursor += strings.length;
    nsyms = symtabSymbols.length;
  }

  let bindOff = 0;
  let bindSize = 0;
  if (bindBytes.length > 0) {
    bindOff = cursor;
    bindSize = bindBytes.length;
    tailParts.push(bindBytes);
    cursor += bindBytes.length;
  }
  let lazyBindOff = 0;
  let lazyBindSize = 0;
  if (lazyBindBytes.length > 0) {
    lazyBindOff = cursor;
    lazyBindSize = lazyBindBytes.length;
    tailParts.push(lazyBindBytes);
    cursor += lazyBindBytes.length;
  }

  let chainedDataoff = 0;
  if (hasChainedFixups) {
    const symbolsPool: number[] = [];
    const importOffsets: number[] = [];
    for (const name of chainedImportNames) {
      importOffsets.push(symbolsPool.length);
      symbolsPool.push(...cstr(name));
    }
    const importsOffset = 28; // right after the 7-uint32 fixups header
    const importsBytes = importOffsets.flatMap((nameOffset) => u32le(nameOffset << 9));
    const symbolsOffset = importsOffset + importsBytes.length;
    const header = [
      ...u32le(0), // fixups_version
      ...u32le(0), // starts_offset (unused by the decoder)
      ...u32le(importsOffset),
      ...u32le(symbolsOffset),
      ...u32le(chainedImportNames.length),
      ...u32le(1), // imports_format = DYLD_CHAINED_IMPORT
      ...u32le(0), // symbols_format = uncompressed
    ];
    chainedDataoff = cursor;
    const blob = [...header, ...importsBytes, ...symbolsPool];
    tailParts.push(blob);
    cursor += blob.length;
  }

  let objcSectionOffset = 0;
  let objcSectionSize = 0;
  if (hasObjcSection) {
    const blob = objcSelectors.flatMap((selector) => cstr(selector));
    objcSectionOffset = cursor;
    objcSectionSize = blob.length;
    tailParts.push(blob);
    cursor += blob.length;
  }

  // --- Build load commands, now that every tail offset is known. ---
  const commands: number[] = [];
  if (hasSymtab) {
    commands.push(
      LC_SYMTAB,
      0,
      0,
      0,
      24,
      0,
      0,
      0,
      ...u32le(symoff),
      ...u32le(nsyms),
      ...u32le(stroff),
      ...u32le(0),
    );
  }
  if (hasDyldInfo) {
    commands.push(
      ...u32le(LC_DYLD_INFO_ONLY),
      ...u32le(48),
      ...u32le(0),
      ...u32le(0), // rebase
      ...u32le(bindOff),
      ...u32le(bindSize),
      ...u32le(0),
      ...u32le(0), // weak_bind
      ...u32le(lazyBindOff),
      ...u32le(lazyBindSize),
      ...u32le(0),
      ...u32le(0), // export
    );
  }
  if (hasChainedFixups) {
    commands.push(
      ...u32le(LC_DYLD_CHAINED_FIXUPS),
      ...u32le(16),
      ...u32le(chainedDataoff),
      ...u32le(cursor - chainedDataoff),
    );
  }
  if (hasEncryption) {
    commands.push(
      ...u32le(LC_ENCRYPTION_INFO_64),
      ...u32le(24),
      ...u32le(0),
      ...u32le(0),
      ...u32le(options.encrypted ? 1 : 0),
      ...u32le(0),
    );
  }
  if (hasObjcSection) {
    commands.push(
      ...u32le(LC_SEGMENT_64),
      ...u32le(72 + 80),
      ...fixed('__TEXT', 16),
      ...u64le(0), // vmaddr
      ...u64le(0), // vmsize
      ...u64le(0), // fileoff
      ...u64le(0), // filesize
      ...u32le(0), // maxprot
      ...u32le(0), // initprot
      ...u32le(1), // nsects
      ...u32le(0), // flags
      // section_64
      ...fixed('__objc_methname', 16),
      ...fixed('__TEXT', 16),
      ...u64le(0), // addr
      ...u64le(objcSectionSize),
      ...u32le(objcSectionOffset),
      ...u32le(0), // align
      ...u32le(0), // reloff
      ...u32le(0), // nreloc
      ...u32le(0), // flags
      ...u32le(0),
      ...u32le(0),
      ...u32le(0), // reserved1-3
    );
  }

  const header = [
    ...u32le(0xfeedfacf), // MH_MAGIC_64
    ...u32le(0x0100000c), // CPU_TYPE_ARM64
    ...u32le(0),
    ...u32le(0), // filetype
    ...u32le(ncmds),
    ...u32le(sizeofcmds),
    ...u32le(0), // flags
    ...u32le(0), // reserved
  ];

  return Uint8Array.from([...header, ...commands, ...tailParts.flat()]);
}

function buildFatMachO(slices: readonly { cputype: number; thin: Uint8Array }[]): Uint8Array {
  const archEntrySize = 20;
  let cursor = 8 + slices.length * archEntrySize;
  const archEntries: number[] = [];
  const bodies: Uint8Array[] = [];
  for (const slice of slices) {
    archEntries.push(
      ...u32be(slice.cputype),
      ...u32be(0),
      ...u32be(cursor),
      ...u32be(slice.thin.length),
      ...u32be(0),
    );
    bodies.push(slice.thin);
    cursor += slice.thin.length;
  }
  const header = [...u32be(0xcafebabe), ...u32be(slices.length)];
  return Uint8Array.from([...header, ...archEntries, ...bodies.flatMap((b) => Array.from(b))]);
}

function unwrapOk<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value as T;
}

describe('parseMachO', () => {
  it('collects only undefined external symbols from LC_SYMTAB', () => {
    const bytes = buildThinMachO({
      symtabSymbols: [
        { name: '_OBJC_CLASS_$_NSUserDefaults', undefinedExternal: true },
        { name: '_locallyDefined', undefinedExternal: false },
      ],
    });
    const facts = unwrapOk(parseMachO(bytes));
    expect(facts.symbols).toEqual(['_OBJC_CLASS_$_NSUserDefaults']);
    expect(facts.encrypted).toBe(false);
  });

  it('collects symbol names from bind and lazy bind opcode streams', () => {
    const bytes = buildThinMachO({
      bindSymbol: '_stat',
      lazyBindSymbol: '_mach_absolute_time',
    });
    const facts = unwrapOk(parseMachO(bytes));
    expect(facts.symbols).toEqual(['_mach_absolute_time', '_stat']);
  });

  it('collects import names from LC_DYLD_CHAINED_FIXUPS (format 1)', () => {
    const bytes = buildThinMachO({ chainedImportNames: ['_statfs', '_fstatfs'] });
    const facts = unwrapOk(parseMachO(bytes));
    expect(facts.symbols).toEqual(['_fstatfs', '_statfs']);
  });

  it('unions symbols from all three sources and dedupes', () => {
    const bytes = buildThinMachO({
      symtabSymbols: [{ name: '_stat', undefinedExternal: true }],
      bindSymbol: '_stat',
      chainedImportNames: ['_stat'],
    });
    const facts = unwrapOk(parseMachO(bytes));
    expect(facts.symbols).toEqual(['_stat']);
  });

  it('detects FairPlay encryption via LC_ENCRYPTION_INFO_64', () => {
    const encrypted = unwrapOk(parseMachO(buildThinMachO({ encrypted: true })));
    expect(encrypted.encrypted).toBe(true);

    const notEncrypted = unwrapOk(parseMachO(buildThinMachO({ encrypted: false })));
    expect(notEncrypted.encrypted).toBe(false);
  });

  it('collects Objective-C selectors from __TEXT,__objc_methname when not encrypted', () => {
    const facts = unwrapOk(
      parseMachO(buildThinMachO({ objcSelectors: ['systemUptime', 'activeInputModes'] })),
    );
    expect(facts.selectors).toEqual(['systemUptime', 'activeInputModes']);
  });

  it('skips the selector scan but keeps the symbol scan when encrypted', () => {
    const bytes = buildThinMachO({
      symtabSymbols: [{ name: '_stat', undefinedExternal: true }],
      objcSelectors: ['systemUptime'],
      encrypted: true,
    });
    const facts = unwrapOk(parseMachO(bytes));
    expect(facts.encrypted).toBe(true);
    expect(facts.symbols).toEqual(['_stat']);
    expect(facts.selectors).toEqual([]);
  });

  it('picks the arm64 slice out of a fat binary', () => {
    const arm64Thin = buildThinMachO({
      symtabSymbols: [{ name: '_arm64Symbol', undefinedExternal: true }],
    });
    const x86Thin = buildThinMachO({
      symtabSymbols: [{ name: '_x86Symbol', undefinedExternal: true }],
    });
    const fat = buildFatMachO([
      { cputype: 0x01000007, thin: x86Thin }, // CPU_TYPE_X86_64
      { cputype: 0x0100000c, thin: arm64Thin }, // CPU_TYPE_ARM64
    ]);
    const facts = unwrapOk(parseMachO(fat));
    expect(facts.symbols).toEqual(['_arm64Symbol']);
  });

  it('falls back to the first slice when no arm64 slice is present', () => {
    const x86Thin = buildThinMachO({
      symtabSymbols: [{ name: '_x86Symbol', undefinedExternal: true }],
    });
    const fat = buildFatMachO([{ cputype: 0x01000007, thin: x86Thin }]);
    const facts = unwrapOk(parseMachO(fat));
    expect(facts.symbols).toEqual(['_x86Symbol']);
  });

  it('returns a typed error, never throws, for an unrecognized magic', () => {
    const result = parseMachO(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8));
    expect(result.ok).toBe(false);
  });
});

describe('parseMachO property tests', () => {
  it('never throws on random or truncated bytes', () => {
    expect(() => {
      fc.assert(
        fc.property(fc.uint8Array({ maxLength: 256 }), (bytes) => {
          const result = parseMachO(bytes);
          return typeof result.ok === 'boolean';
        }),
      );
    }).not.toThrow();
  });

  it('never throws on a truncated valid Mach-O', () => {
    const good = buildThinMachO({
      symtabSymbols: [{ name: '_stat', undefinedExternal: true }],
      bindSymbol: '_mach_absolute_time',
      chainedImportNames: ['_statfs'],
      objcSelectors: ['systemUptime'],
    });
    expect(() => {
      fc.assert(
        fc.property(fc.nat({ max: good.length }), (cutoff) => {
          const result = parseMachO(good.slice(0, cutoff));
          return typeof result.ok === 'boolean';
        }),
      );
    }).not.toThrow();
  });
});
