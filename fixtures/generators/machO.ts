// Builds minimal valid 64-bit Mach-O binaries for fixtures: fat/thin headers, load commands,
// symbol table, bind opcodes, chained fixups, and an `__objc_methname` section. Byte layouts per
// .claude/skills/ipa-analysis/reference.md. Never a real compiler output (make-fixture skill).

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

const BIND_SET_DYLIB_ORDINAL_IMM = 0x11;
const BIND_SET_SYMBOL_TRAILING_FLAGS_IMM = 0x40;
const BIND_SET_TYPE_IMM = 0x51;
const BIND_SET_SEGMENT_AND_OFFSET_ULEB = 0x71;
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

export interface MachOSpec {
  readonly symtabSymbols?: readonly { name: string; undefinedExternal: boolean }[];
  readonly bindSymbol?: string;
  readonly lazyBindSymbol?: string;
  readonly chainedImportNames?: readonly string[];
  readonly encrypted?: boolean;
  readonly objcSelectors?: readonly string[];
}

export function buildThinMachO(spec: MachOSpec): Uint8Array {
  const symtabSymbols = spec.symtabSymbols ?? [];
  const bindBytes = spec.bindSymbol ? encodeBindStream(spec.bindSymbol, 0x10) : [];
  const lazyBindBytes = spec.lazyBindSymbol ? encodeBindStream(spec.lazyBindSymbol, 0x20) : [];
  const chainedImportNames = spec.chainedImportNames ?? [];
  const objcSelectors = spec.objcSelectors ?? [];

  const hasSymtab = symtabSymbols.length > 0;
  const hasDyldInfo = bindBytes.length > 0 || lazyBindBytes.length > 0;
  const hasChainedFixups = chainedImportNames.length > 0;
  const hasEncryption = spec.encrypted !== undefined;
  const hasObjcSection = objcSelectors.length > 0;

  const cmdSizes: number[] = [];
  if (hasSymtab) cmdSizes.push(24);
  if (hasDyldInfo) cmdSizes.push(48);
  if (hasChainedFixups) cmdSizes.push(16);
  if (hasEncryption) cmdSizes.push(24);
  if (hasObjcSection) cmdSizes.push(72 + 80);
  const sizeofcmds = cmdSizes.reduce((a, b) => a + b, 0);
  const ncmds = cmdSizes.length;
  const tailStart = 32 + sizeofcmds;

  let cursor = tailStart;
  const tailParts: number[][] = [];

  let symoff = 0;
  let stroff = 0;
  let nsyms = 0;
  if (hasSymtab) {
    const strings: number[] = [0];
    const nlistEntries: number[] = [];
    for (const sym of symtabSymbols) {
      const strx = strings.length;
      strings.push(...cstr(sym.name));
      const type = sym.undefinedExternal ? 0x01 : 0x0f;
      nlistEntries.push(...u32le(strx), type, 0, 0, 0, ...u64le(0));
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
    const importsOffset = 28;
    const importsBytes = importOffsets.flatMap((nameOffset) => u32le(nameOffset << 9));
    const symbolsOffset = importsOffset + importsBytes.length;
    const header = [
      ...u32le(0),
      ...u32le(0),
      ...u32le(importsOffset),
      ...u32le(symbolsOffset),
      ...u32le(chainedImportNames.length),
      ...u32le(1),
      ...u32le(0),
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
      ...u32le(0),
      ...u32le(bindOff),
      ...u32le(bindSize),
      ...u32le(0),
      ...u32le(0),
      ...u32le(lazyBindOff),
      ...u32le(lazyBindSize),
      ...u32le(0),
      ...u32le(0),
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
      ...u32le(spec.encrypted ? 1 : 0),
      ...u32le(0),
    );
  }
  if (hasObjcSection) {
    commands.push(
      ...u32le(LC_SEGMENT_64),
      ...u32le(72 + 80),
      ...fixed('__TEXT', 16),
      ...u64le(0),
      ...u64le(0),
      ...u64le(0),
      ...u64le(0),
      ...u32le(0),
      ...u32le(0),
      ...u32le(1),
      ...u32le(0),
      ...fixed('__objc_methname', 16),
      ...fixed('__TEXT', 16),
      ...u64le(0),
      ...u64le(objcSectionSize),
      ...u32le(objcSectionOffset),
      ...u32le(0),
      ...u32le(0),
      ...u32le(0),
      ...u32le(0),
      ...u32le(0),
      ...u32le(0),
      ...u32le(0),
    );
  }

  const header = [
    ...u32le(0xfeedfacf),
    ...u32le(0x0100000c),
    ...u32le(0),
    ...u32le(0),
    ...u32le(ncmds),
    ...u32le(sizeofcmds),
    ...u32le(0),
    ...u32le(0),
  ];

  return Uint8Array.from([...header, ...commands, ...tailParts.flat()]);
}

export function buildFatMachO(
  slices: readonly { cputype: number; thin: Uint8Array }[],
): Uint8Array {
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

export const CPU_TYPE_ARM64 = 0x0100000c;
export const CPU_TYPE_X86_64 = 0x01000007;
