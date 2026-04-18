# StarBrickVII WASM Engine Standard

## Version

- **v1.0**: Base protocol (stable)
- **v2.0**: Extended capabilities (backward compatible)

## Overview

Engines are WASM modules exporting specific functions for the host. The protocol defines required exports for basic functionality and optional exports for extended features.

## Required Exports (v1.0)

| Function | Signature | Description |
|----------|-----------|-------------|
| `sb_get_id` | `(outLenPtr: i32) -> ptr` | Unique engine ID string |
| `sb_get_name` | `(outLenPtr: i32) -> ptr` | Display name |
| `sb_get_desc` | `(outLenPtr: i32) -> ptr` | Description |
| `sb_is_binary_safe` | `() -> i32` | Returns 1 if binary-safe |
| `sb_is_self_inverse` | `() -> i32` | Returns 1 if encode=decode |
| `sb_is_reversible` | `() -> i32` | Returns 1 if has decode |
| `sb_alloc` | `(size: i32) -> ptr` | Memory allocation |
| `sb_free` | `(ptr: i32, size: i32)` | Memory free |
| `sb_encode` | `(ptr: i32, len: i32, outLenPtr: i32) -> ptr` | Encode function |
| `sb_decode` | `(ptr: i32, len: i32, outLenPtr: i32) -> ptr` | Decode (if reversible) |
| `memory` | `WebAssembly.Memory` | Linear memory |

## Optional Exports (v2.0)

| Function | Signature | Description |
|----------|-----------|-------------|
| `sb_is_stateful` | `() -> i32` | Returns 1 if engine maintains state across chunks |
| `sb_get_version` | `(outLenPtr: i32) -> ptr` | Engine version string |
| `sb_get_charset_count` | `() -> i32` | Number of supported charsets |
| `sb_get_charset` | `(index: i32, outLenPtr: i32) -> ptr` | Get charset name by index |
| `sb_reset_state` | `() -> void` | Reset internal state (stateful engines) |
| `sb_get_default_charset` | `(outLenPtr: i32) -> ptr` | Default charset for this engine |

## Chunked Processing (v2.0)

For large files, engines may support chunked processing. The host sends data in chunks:

### Non-Stateful Engines (Default)

Each chunk is processed independently:
- Input: `chunk_data`, `is_last`, `total_chunks`, `chunk_index`
- Output: Processed chunk data
- Constraint: Output of chunk N does not depend on chunk N-1

Example: Base64, Hex encoding

### Stateful Engines

When `sb_is_stateful()` returns 1:
- Engine maintains internal state across chunks
- Host MUST call `sb_reset_state()` before starting a new operation
- Output may depend on previous chunks

Example: Compression algorithms, encryption with CBC mode

### Recommended Chunk Size

- Default: 64KB (65536 bytes)
- Maximum: 1MB (1048576 bytes)
- Minimum: 4KB (4096 bytes)

## Character Encoding (v2.0)

### Charset Support Declaration

Engines can declare supported character encodings:

```
sb_get_charset_count() -> 3
sb_get_charset(0) -> "utf-8"
sb_get_charset(1) -> "utf-16le"
sb_get_charset(2) -> "iso-8859-1"
```

### Default Behavior

If charset functions are not implemented:
- Host assumes UTF-8 as the default encoding
- UI displays "UTF-8 (default)" indicator
- Text input is converted to UTF-8 bytes before processing

### Charset Variants

Some encodings have variants (e.g., Base64):
- `base64-standard`: Standard Base64 with `+/` and `=`
- `base64-urlsafe`: URL-safe Base64 with `-_` and no padding
- `hex-upper`: Uppercase hexadecimal
- `hex-lower`: Lowercase hexadecimal

### Host Responsibilities

1. Query `sb_get_charset_count()` to check charset support
2. If count > 0, display supported charsets in UI
3. Convert text input to the selected charset before encoding
4. For binary input, charset selection is ignored

## Validation

Engines are validated on load:

### v1.0 Validation

1. Check all required exports exist
2. Encode test string: `"StarBrickVII_VALIDATION_123"`
3. If reversible, decode the result
4. Compare with original

### v2.0 Validation (Extended)

1. All v1.0 validation steps
2. If `sb_is_binary_safe()` returns 1:
   - Encode binary test data: `[0x00, 0x01, 0x02, 0x03, 0x7F, 0x80, 0xFF, ...]`
   - Decode result
   - Compare byte-by-byte with original
3. If `sb_is_stateful()` returns 1:
   - Verify `sb_reset_state()` exists
   - Test chunked processing consistency

## Error Handling

### Memory Allocation Failures

If `sb_alloc` returns 0 (null pointer):
- Host should abort the operation
- Display error: "Memory allocation failed"

### Processing Failures

If `sb_encode` or `sb_decode` returns 0:
- Check `outLenPtr` value
- If 0: Operation failed
- If non-zero: Empty output (valid)

### Invalid Input

Engines should handle invalid input gracefully:
- Return error code or empty output
- Do not trap/panic
- Host will display appropriate error message

## Build Instructions

### Rust (Recommended)

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib"]

[profile.release]
opt-level = "s"
lto = true
```

```rust
// lib.rs
#[no_mangle]
pub unsafe extern "C" fn sb_get_id(out_len_ptr: *mut u32) -> *mut u8 {
    // Implementation
}
```

```bash
cargo build --target wasm32-unknown-unknown --release
```

### AssemblyScript

```typescript
// assembly/index.ts
export function sb_get_id(outLenPtr: i32): i32 {
    // Implementation
}
```

```bash
asc assembly/index.ts -o engine.wasm --optimize
```

### C/C++

```c
// engine.c
__attribute__((export_name("sb_get_id")))
char* sb_get_id(int* out_len_ptr) {
    // Implementation
}
```

```bash
clang --target=wasm32 -O2 -nostdlib -Wl,--no-entry -Wl,--export-all -o engine.wasm engine.c
```

## Example Engines

| Engine | ID | Binary Safe | Self-Inverse | Reversible | Stateful |
|--------|-----|-------------|--------------|------------|----------|
| Base64 | `base64` | Yes | No | Yes | No |
| Hex | `hex` | Yes | No | Yes | No |
| Binary | `binary` | Yes | No | Yes | No |
| ROT13 | `rot13` | No | Yes | Yes | No |
| URL Encode | `url` | No | No | Yes | No |

## Versioning

- Engines should implement `sb_get_version()` returning a semver string
- Host displays version in engine info panel
- Breaking changes require a new engine ID

## License

All engines in this repository are licensed under GPL-3.0.
