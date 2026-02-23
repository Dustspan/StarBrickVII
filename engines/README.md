# StarBrickVII WASM Engine Standard v1.0

## Overview
Engines are WASM modules exporting specific functions for the host.

## Required Exports
| Function | Signature | Description |
|----------|-----------|-------------|
| sb_get_id | (outLenPtr) -> ptr | Unique engine ID string |
| sb_get_name | (outLenPtr) -> ptr | Display name |
| sb_get_desc | (outLenPtr) -> ptr | Description |
| sb_is_binary_safe | () -> i32 | 1 if binary-safe |
| sb_is_self_inverse | () -> i32 | 1 if encode=decode |
| sb_is_reversible | () -> i32 | 1 if has decode |
| sb_alloc | (size) -> ptr | Memory allocation |
| sb_free | (ptr, size) | Memory free |
| sb_encode | (ptr, len, outLenPtr) -> ptr | Encode function |
| sb_decode | (ptr, len, outLenPtr) -> ptr | Decode (if reversible) |

## Validation
Engines are validated on load:
1. Check required exports.
2. Encode "StarBrickVII_VALIDATION_123".
3. Decode result (if applicable).
4. Compare with original.

## Build
\`\`\`bash
cargo build --target wasm32-unknown-unknown --release
\`\`\`
