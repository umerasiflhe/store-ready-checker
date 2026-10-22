import { describe, expect, it } from 'vitest';
import { parseElf, PT_GNU_RELRO, PT_LOAD } from './elf.ts';

// --- Minimal test-only ELF64 LE encoder (make-fixture skill: never a real compiler output). ---

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

interface PhInit {
  readonly pType: number;
  readonly pVAddr: number;
  readonly pMemSz: number;
  readonly pAlign: number;
}

function programHeaderBytes(ph: PhInit): number[] {
  return [
    ...u32le(ph.pType),
    ...u32le(0), // p_flags
    ...u64le(0), // p_offset
    ...u64le(ph.pVAddr),
    ...u64le(0), // p_paddr
    ...u64le(0), // p_filesz
    ...u64le(ph.pMemSz),
    ...u64le(ph.pAlign),
  ];
}

const PH_ENTRY_SIZE = 56; // 4+4+8+8+8+8+8+8

function buildElf64(programHeaders: readonly PhInit[]): Uint8Array {
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

  const body = programHeaders.flatMap(programHeaderBytes);
  return new Uint8Array([...header, ...body]);
}

describe('parseElf', () => {
  it('reads PT_LOAD and PT_GNU_RELRO program headers', () => {
    const bytes = buildElf64([
      { pType: PT_LOAD, pVAddr: 0, pMemSz: 0x1000, pAlign: 16384 },
      { pType: PT_GNU_RELRO, pVAddr: 0x1000, pMemSz: 0x4000, pAlign: 1 },
    ]);
    const result = parseElf(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.programHeaders).toEqual([
      { pType: PT_LOAD, pVAddr: 0n, pMemSz: 0x1000n, pAlign: 16384n },
      { pType: PT_GNU_RELRO, pVAddr: 0x1000n, pMemSz: 0x4000n, pAlign: 1n },
    ]);
  });

  it('returns a typed error for a 32-bit ELF file', () => {
    const bytes = new Uint8Array(64);
    bytes[0] = 0x7f;
    bytes[1] = 0x45;
    bytes[2] = 0x4c;
    bytes[3] = 0x46;
    bytes[4] = 1; // ELFCLASS32
    const result = parseElf(bytes);
    expect(result.ok).toBe(false);
  });

  it('returns a typed error on truncated/garbage input', () => {
    expect(parseElf(new Uint8Array([1, 2, 3])).ok).toBe(false);
    expect(parseElf(new Uint8Array(70)).ok).toBe(false);
  });
});
