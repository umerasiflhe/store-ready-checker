# Android byte layouts

Supporting reference for the `android-bundle-analysis` skill.

## AXML chunk header (every chunk starts with this)

```text
offset 0: uint16 type     (0x0001 = RES_STRING_POOL_TYPE, 0x0180 = RES_XML_START_NAMESPACE_TYPE,
                            0x0100 = RES_XML_START_ELEMENT_TYPE, 0x0101 = RES_XML_END_ELEMENT_TYPE,
                            0x0180 = RES_XML_RESOURCE_MAP_TYPE)
offset 2: uint16 headerSize
offset 4: uint32 size     (size of this whole chunk, including header)
```

All multi-byte values little-endian. The string pool chunk (type `0x0001`) holds every string
referenced by element/attribute names and values, indexed by integer refs used throughout the rest
of the document.

## ELF64 header + program header

```text
ELF header (first 64 bytes):
  offset 0:  4 bytes   magic "\x7fELF"
  offset 4:  1 byte    EI_CLASS (2 = 64-bit)
  offset 5:  1 byte    EI_DATA  (1 = little-endian)
  offset 32: uint64    e_phoff   (program header table file offset)
  offset 54: uint16    e_phentsize
  offset 56: uint16    e_phnum

Program header entry (e_phentsize bytes each, at e_phoff):
  offset 0:  uint32 p_type    (1 = PT_LOAD, 0x6474e552 = PT_GNU_RELRO)
  offset 4:  uint32 p_flags
  offset 8:  uint64 p_offset  (file offset)
  offset 16: uint64 p_vaddr   (virtual address)
  offset 24: uint64 p_paddr
  offset 32: uint64 p_filesz
  offset 40: uint64 p_memsz
  offset 48: uint64 p_align
```

## Zip local file header (for the `AND-16K-003` data-offset check)

```text
offset 0:  uint32 signature       (0x04034b50)
offset 4:  uint16 version
offset 6:  uint16 flags
offset 8:  uint16 compression     (0 = stored, 8 = deflate)
offset 10: uint16 modTime
offset 12: uint16 modDate
offset 14: uint32 crc32
offset 18: uint32 compressedSize
offset 22: uint32 uncompressedSize
offset 26: uint16 fileNameLength
offset 28: uint16 extraFieldLength
offset 30: file name (fileNameLength bytes)
            extra field (extraFieldLength bytes)
            --- file data starts here ---
```

The entry's **data offset** is
`central-directory local-header-offset + 30 + fileNameLength + extraFieldLength` (using the
**local** header's `fileNameLength`/`extraFieldLength`, which can differ from the central
directory's copy — read the local header, don't assume they match).
