/**
 * StarBrickVII WASM Engine Protocol Constants
 * 
 * This module defines constants for the WASM engine protocol,
 * including function signatures and memory management conventions.
 */

/**
 * WASM function signatures for documentation and validation
 */
export const ENGINE_SIGNATURES = {
  // Metadata functions
  sb_get_id: '(outLenPtr: i32) -> i32',
  sb_get_name: '(outLenPtr: i32) -> i32',
  sb_get_desc: '(outLenPtr: i32) -> i32',
  sb_get_version: '(outLenPtr: i32) -> i32',
  
  // Capability functions
  sb_is_binary_safe: '() -> i32',
  sb_is_self_inverse: '() -> i32',
  sb_is_reversible: '() -> i32',
  sb_is_stateful: '() -> i32',
  
  // Memory management
  sb_alloc: '(size: i32) -> i32',
  sb_free: '(ptr: i32, size: i32) -> void',
  
  // Processing functions
  sb_encode: '(ptr: i32, len: i32, outLenPtr: i32) -> i32',
  sb_decode: '(ptr: i32, len: i32, outLenPtr: i32) -> i32',
  
  // Charset functions (v2.0)
  sb_get_charset_count: '() -> i32',
  sb_get_charset: '(index: i32, outLenPtr: i32) -> i32',
} as const;

/**
 * Return value meanings for capability functions
 */
export const CAPABILITY_VALUES = {
  TRUE: 1,
  FALSE: 0,
} as const;

/**
 * Memory allocation alignment
 */
export const MEMORY_ALIGNMENT = 8;

/**
 * Maximum string length for metadata retrieval
 */
export const MAX_METADATA_STRING_LENGTH = 1024;

/**
 * Charset identifiers for common encodings
 */
export const CHARSET_IDS = {
  UTF_8: 'utf-8',
  UTF_16LE: 'utf-16le',
  UTF_16BE: 'utf-16be',
  ISO_8859_1: 'iso-8859-1',
  ASCII: 'ascii',
  BASE64_STANDARD: 'base64-standard',
  BASE64_URLSAFE: 'base64-urlsafe',
  HEX_UPPERCASE: 'hex-upper',
  HEX_LOWERCASE: 'hex-lower',
} as const;

/**
 * Default charset for text processing
 */
export const DEFAULT_CHARSET = CHARSET_IDS.UTF_8;

/**
 * Engine error codes
 */
export const ENGINE_ERRORS = {
  ALLOC_FAILED: 'Memory allocation failed',
  INVALID_POINTER: 'Invalid memory pointer',
  ENCODE_FAILED: 'Encoding operation failed',
  DECODE_FAILED: 'Decoding operation failed',
  MISSING_EXPORT: 'Required export missing',
  VALIDATION_FAILED: 'Engine validation failed',
  BINARY_UNSAFE: 'Engine is not binary-safe',
  NOT_REVERSIBLE: 'Engine does not support decode',
  STATE_MISMATCH: 'Stateful engine state mismatch',
} as const;

/**
 * Preset engine paths
 */
export const PRESET_ENGINES = [
  '/engines/base64.wasm',
  '/engines/hex.wasm',
  '/engines/binary.wasm',
] as const;

/**
 * Engine capability display labels
 */
export const CAPABILITY_LABELS = {
  binarySafe: 'Binary Safe',
  selfInverse: 'Self-Inverse',
  reversible: 'Reversible',
  stateful: 'Stateful',
} as const;

/**
 * Capability abbreviations for compact display
 */
export const CAPABILITY_ABBREVIATIONS = {
  binarySafe: 'B',
  selfInverse: 'S',
  reversible: 'R',
  stateful: 'F',
} as const;
