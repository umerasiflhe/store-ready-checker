// ELF64 little-endian program-header reader. Layout per the android-bundle-analysis skill's
// reference.md (ELF header + program header table), used only for the 16 KB page-size checks:
// PT_LOAD alignment and the PT_GNU_RELRO extent exception.
import { ByteReader } from '../util/bytes.ts';
import { tryParse, type Result } from '../util/result.ts';

export const PT_LOAD = 1;
export const PT_GNU_RELRO = 0x6474e552;

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46]; // "\x7fELF"
const ELFCLASS64 = 2;
const ELFDATA2LSB = 1;

export interface ProgramHeader {
  readonly pType: number;
  readonly pVAddr: bigint;
  readonly pMemSz: bigint;
  readonly pAlign: bigint;
}

export interface ElfFacts {
  readonly programHeaders: readonly ProgramHeader[];
}

function isElf64Le(bytes: Uint8Array): boolean {
  if (bytes.length < 20) return false;
  return (
    ELF_MAGIC.every((byte, index) => bytes[index] === byte) &&
    bytes[4] === ELFCLASS64 &&
    bytes[5] === ELFDATA2LSB
  );
}

/** Parses an ELF64 LE shared library's program headers. Never throws on malformed/truncated
 * input; returns an error instead (e.g. for 32-bit or big-endian ELF files, which the 16 KB
 * rules never apply to). */
export function parseElf(bytes: Uint8Array): Result<ElfFacts> {
  return tryParse('ELF_PARSE_FAILED', () => {
    if (!isElf64Le(bytes)) {
      throw new Error('not a 64-bit little-endian ELF file');
    }
    const reader = new ByteReader(bytes);
    reader.seek(32);
    const phOffset = reader.readUint64LE();
    reader.seek(54);
    const phEntSize = reader.readUint16LE();
    const phNum = reader.readUint16LE();

    const programHeaders: ProgramHeader[] = [];
    for (let i = 0; i < phNum; i += 1) {
      reader.seek(Number(phOffset) + i * phEntSize);
      const pType = reader.readUint32LE();
      reader.skip(4); // p_flags
      reader.skip(8); // p_offset
      const pVAddr = reader.readUint64LE();
      reader.skip(8); // p_paddr
      reader.skip(8); // p_filesz
      const pMemSz = reader.readUint64LE();
      const pAlign = reader.readUint64LE();
      programHeaders.push({ pType, pVAddr, pMemSz, pAlign });
    }
    return { programHeaders };
  });
}
