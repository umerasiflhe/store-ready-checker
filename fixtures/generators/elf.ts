// Minimal ELF64 LE encoder (make-fixture skill: never a real compiler output). Layout matches
// packages/core/src/android/elf.ts's reader, which itself follows the android-bundle-analysis
// skill's reference.md.
import { PT_LOAD } from '../../packages/core/src/android/elf.ts';

function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}
function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}
function u64le(value: number | bigint): number[] {
  const big = BigInt(value);
  const bytes: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    bytes.push(Number((big >> BigInt(8 * i)) & 0xffn));
  }
  return bytes;
}

export interface ProgramHeaderInput {
  readonly pType?: number;
  readonly pVAddr: number | bigint;
  readonly pMemSz: number | bigint;
  readonly pAlign: number | bigint;
}

const PH_ENTRY_SIZE = 56; // p_type(4)+p_flags(4)+p_offset(8)+p_vaddr(8)+p_paddr(8)+p_filesz(8)+p_memsz(8)+p_align(8)

function programHeaderBytes(ph: ProgramHeaderInput): number[] {
  return [
    ...u32le(ph.pType ?? PT_LOAD),
    ...u32le(0), // p_flags
    ...u64le(0), // p_offset
    ...u64le(ph.pVAddr),
    ...u64le(0), // p_paddr
    ...u64le(0), // p_filesz
    ...u64le(ph.pMemSz),
    ...u64le(ph.pAlign),
  ];
}

/** Builds a minimal ELF64 LE shared library: a 64-byte ELF header followed immediately by the
 * given program headers — no sections, no actual code, since the rules engine never reads them. */
export function buildElf64(programHeaders: readonly ProgramHeaderInput[]): Uint8Array {
  const phOffset = 64;
  const header = new Array<number>(64).fill(0);
  header[0] = 0x7f;
  header[1] = 0x45;
  header[2] = 0x4c;
  header[3] = 0x46;
  header[4] = 2; // ELFCLASS64
  header[5] = 1; // ELFDATA2LSB
  u64le(phOffset).forEach((byte, i) => (header[32 + i] = byte));
  u16le(PH_ENTRY_SIZE).forEach((byte, i) => (header[54 + i] = byte));
  u16le(programHeaders.length).forEach((byte, i) => (header[56 + i] = byte));

  return new Uint8Array([...header, ...programHeaders.flatMap(programHeaderBytes)]);
}
