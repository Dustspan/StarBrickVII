/**
 * StarBrickVII WASM Engine Type Definitions
 * 
 * This module defines the types for the WASM engine protocol,
 * including the standard v1.0 exports and extended v2.0 capabilities.
 */

/**
 * Engine capability flags returned by WASM exports
 */
export interface EngineCapabilities {
  /** Whether the engine can handle binary data without corruption */
  binarySafe: boolean;
  /** Whether encode and decode operations are identical (e.g., ROT13) */
  selfInverse: boolean;
  /** Whether the engine supports decode operation */
  reversible: boolean;
  /** Whether the engine maintains state across chunked operations (v2.0) */
  stateful: boolean;
}

/**
 * Character encoding support information (v2.0 protocol extension)
 */
export interface CharsetSupport {
  /** List of supported character encodings */
  supported: string[];
  /** Default encoding to use when not specified */
  default: string;
  /** Whether the engine can auto-detect encoding */
  autoDetect: boolean;
}

/**
 * Complete engine metadata returned after loading
 */
export interface EngineInfo {
  /** Unique engine identifier */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Engine description */
  desc: string;
  /** Engine capabilities */
  capabilities: EngineCapabilities;
  /** Character encoding support (optional, v2.0) */
  charset?: CharsetSupport;
  /** Whether this is a preset engine */
  isPreset: boolean;
  /** Engine version string (optional) */
  version?: string;
}

/**
 * Internal engine representation with worker reference
 */
export interface Engine extends EngineInfo {
  /** Web Worker instance for this engine (optional during initialization) */
  worker?: Worker;
}

/**
 * Message types for Worker communication
 */
export type WorkerMessageType = 
  | 'load'      // Load a WASM engine
  | 'encode'    // Encode data
  | 'decode'    // Decode data
  | 'validate'; // Validate engine

/**
 * Message types sent from Worker to main thread
 */
export type WorkerResponseType = 
  | 'loaded'    // Engine loaded successfully
  | 'chunk'     // Chunk processed
  | 'result'    // Operation complete
  | 'error'     // Error occurred
  | 'progress'; // Progress update

/**
 * Base message structure for Worker communication
 */
export interface WorkerMessage<T = unknown> {
  /** Request ID for correlation */
  id: number;
  /** Message type */
  type: WorkerMessageType;
  /** Message payload */
  payload: T;
}

/**
 * Load message payload
 */
export interface LoadPayload {
  /** URL to the WASM file */
  wasmUrl: string;
}

/**
 * Encode/Decode message payload
 */
export interface ProcessPayload {
  /** Input data as ArrayBuffer */
  chunk: ArrayBuffer;
  /** Whether this is the last chunk */
  isLast: boolean;
  /** Total number of chunks (for progress) */
  totalChunks?: number;
  /** Chunk index (0-based) */
  chunkIndex?: number;
}

/**
 * Chunk response payload
 */
export interface ChunkPayload {
  /** Processed data as ArrayBuffer */
  buffer: ArrayBuffer;
}

/**
 * Progress update payload
 */
export interface ProgressPayload {
  /** Current chunk index */
  current: number;
  /** Total chunks */
  total: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining?: number;
}

/**
 * Worker response structure
 */
export interface WorkerResponse<T = unknown> {
  /** Request ID for correlation */
  id: number;
  /** Response type */
  type: WorkerResponseType;
  /** Response payload */
  payload?: T;
  /** Error message if type is 'error' */
  error?: string;
}

/**
 * Processing mode
 */
export type ProcessingMode = 'encode' | 'decode';

/**
 * Input source type
 */
export type InputSource = 'text' | 'file';

/**
 * Processing state
 */
export type ProcessingState = 'idle' | 'loading' | 'processing' | 'complete' | 'error';

/**
 * File preview type
 */
export type PreviewType = 'image' | 'text' | 'binary' | 'unsupported';

/**
 * File preview data
 */
export interface FilePreview {
  /** Preview type */
  type: PreviewType;
  /** Preview content (URL for images, text for text files, etc.) */
  content: string | ArrayBuffer | null;
  /** MIME type if detected */
  mimeType?: string;
  /** File size in bytes */
  size: number;
  /** File name */
  name: string;
}

/**
 * Processing result
 */
export interface ProcessingResult {
  /** Output data as Blob */
  data: Blob;
  /** Original input size in bytes */
  inputSize: number;
  /** Output size in bytes */
  outputSize: number;
  /** Processing time in ms */
  duration: number;
  /** Preview of the result */
  preview?: FilePreview;
}

/**
 * Engine validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  ok: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Warnings (non-fatal issues) */
  warnings?: string[];
}

/**
 * Required WASM exports for v1.0 compliance
 */
export const REQUIRED_EXPORTS = [
  'sb_get_id',
  'sb_get_name',
  'sb_get_desc',
  'sb_is_binary_safe',
  'sb_is_self_inverse',
  'sb_is_reversible',
  'sb_alloc',
  'sb_free',
  'sb_encode',
  'sb_decode',
  'memory',
] as const;

/**
 * Optional WASM exports for v2.0 extended features
 */
export const OPTIONAL_EXPORTS = [
  'sb_is_stateful',
  'sb_get_charset_count',
  'sb_get_charset',
  'sb_get_version',
] as const;

/**
 * Validation test string for engine verification
 */
export const VALIDATION_TEST_STRING = 'StarBrickVII_VALIDATION_123';

/**
 * Validation test binary data
 */
export const VALIDATION_TEST_BINARY = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x7F, 0x80, 0xFF, 0x00,
  0x0A, 0x0D, 0x20, 0x41, 0x5A, 0x61, 0x7A, 0x00,
]);

/**
 * Default chunk size for file processing (64KB)
 */
export const DEFAULT_CHUNK_SIZE = 64 * 1024;

/**
 * Maximum file size for in-memory processing (100MB)
 */
export const MAX_IN_MEMORY_SIZE = 100 * 1024 * 1024;
