# iOS byte layouts

Supporting reference for the `ipa-analysis` skill. Verify every constant against a real build
before shipping a check that depends on it (the `real-builds.yml` workflow, Milestone 5, exists
for exactly this).

## Binary plist (`bplist00`)

```text
offset 0:       "bplist00"                    (8-byte magic)
...             object table                  (variable-size objects, type in top nibble of
                                                each marker byte: 0x0=null/bool, 0x1=int,
                                                0x2=real, 0x3=date, 0x4=data, 0x5=ASCII string,
                                                0x6=UTF-16 string, 0x8=UID, 0xA=array, 0xD=dict)
...             offset table                  (one entry per object, `offsetIntSize` bytes each)
trailer (32 bytes, at end of file):
  offset 0:  6 bytes unused
  offset 6:  1 byte  sortVersion
  offset 7:  1 byte  offsetIntSize
  offset 8:  1 byte  objectRefSize
  offset 9:  8 bytes numObjects       (big-endian)
  offset 17: 8 bytes topObject        (big-endian, index into offset table)
  offset 25: 8 bytes offsetTableOffset (big-endian)
```

Dict objects store key refs then value refs, each `objectRefSize` bytes, both big-endian.

## Mach-O fat header

```text
offset 0: uint32 magic         (0xcafebabe = FAT_MAGIC, 0xcafebabf = FAT_MAGIC_64; always
                                 big-endian regardless of host/target endianness)
offset 4: uint32 nfat_arch
then nfat_arch entries of fat_arch (FAT_MAGIC) or fat_arch_64 (FAT_MAGIC_64):
  cputype, cpusubtype, offset, size, align   (uint32 each; fat_arch_64 widens offset/size to uint64)
```

`arm64` is `cputype = 0x0100000c` (`CPU_TYPE_ARM64`, i.e. `CPU_TYPE_ARM | CPU_ARCH_ABI64`).

## Mach-O thin header + load commands

```text
offset 0:  uint32 magic        (0xfeedfacf = MH_MAGIC_64, little-endian on-disk for arm64)
offset 4:  uint32 cputype
offset 8:  uint32 cpusubtype
offset 12: uint32 filetype
offset 16: uint32 ncmds
offset 20: uint32 sizeofcmds
offset 24: uint32 flags
offset 28: uint32 reserved
offset 32: load commands begin, ncmds entries, each starting with:
  uint32 cmd                   (e.g. LC_SYMTAB = 0x2, LC_DYLD_INFO = 0x22,
                                 LC_DYLD_INFO_ONLY = 0x80000022,
                                 LC_ENCRYPTION_INFO_64 = 0x2C,
                                 LC_DYLD_CHAINED_FIXUPS = 0x80000034)
  uint32 cmdsize                (total size of this command, including this header)
```

`LC_ENCRYPTION_INFO_64`: `cryptoff`, `cryptsize`, `cryptid` (uint32 each, after the cmd/cmdsize
pair). `cryptid != 0` means the executable is FairPlay-encrypted.

`LC_SYMTAB`: `symoff`, `nsyms`, `stroff`, `strsize` — symbol table entries are `nlist_64` structs
(16 bytes each: `n_strx` uint32, `n_type` uint8, `n_sect` uint8, `n_desc` uint16, `n_value` uint64);
an undefined external symbol has `n_type & N_TYPE == N_UNDF` and `n_type & N_EXT != 0`.
