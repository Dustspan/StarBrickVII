/**
 * StarBrickVII WASM Engine Validator
 * 
 * This module provides validation functions for WASM engines,
 * ensuring they comply with the StarBrickVII protocol.
 */

import {
  REQUIRED_EXPORTS,
  OPTIONAL_EXPORTS,
  VALIDATION_TEST_STRING,
  VALIDATION_TEST_BINARY,
  type ValidationResult,
  type EngineInfo,
  type EngineCapabilities,
  type CharsetSupport,
} from './types';

/**
 * Validates that all required exports are present in a WASM instance
 * 
 * @param exports - The WASM instance exports
 * @returns Validation result with missing exports if any
 */
export function validateExports(exports: WebAssembly.Exports): ValidationResult {
  const missing: string[] = [];
  
  for (const required of REQUIRED_EXPORTS) {
    if (!(required in exports)) {
      missing.push(required);
    }
  }
  
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required exports: ${missing.join(', ')}`,
    };
  }
  
  const warnings: string[] = [];
  
  for (const optional of OPTIONAL_EXPORTS) {
    if (!(optional in exports)) {
      warnings.push(`Optional export '${optional}' not available`);
    }
  }
  
  return { ok: true, warnings };
}

/**
 * Reads a string from WASM memory
 * 
 * @param memory - WASM memory buffer
 * @param ptr - Pointer to the string
 * @param lenPtr - Pointer to the length value
 * @returns The decoded string
 */
export function readWasmString(
  memory: WebAssembly.Memory,
  ptr: number,
  lenPtr: number
): string {
  const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
  if (len === 0 || ptr === 0) return '';
  const bytes = new Uint8Array(memory.buffer, ptr, len);
  return new TextDecoder().decode(bytes);
}

/**
 * Extracts engine metadata from WASM exports
 * 
 * @param exports - The WASM instance exports
 * @returns Engine information object
 */
export function extractEngineInfo(exports: WebAssembly.Exports): EngineInfo {
  const memory = exports.memory as WebAssembly.Memory;
  
  // Allocate space for length pointer
  const alloc = exports.sb_alloc as (size: number) => number;
  const free = exports.sb_free as (ptr: number, size: number) => void;
  
  // Read engine ID
  const idLenPtr = alloc(4);
  const idPtr = (exports.sb_get_id as (lenPtr: number) => number)(idLenPtr);
  const id = readWasmString(memory, idPtr, idLenPtr);
  free(idLenPtr, 4);
  
  // Read engine name
  const nameLenPtr = alloc(4);
  const namePtr = (exports.sb_get_name as (lenPtr: number) => number)(nameLenPtr);
  const name = readWasmString(memory, namePtr, nameLenPtr);
  free(nameLenPtr, 4);
  
  // Read engine description
  const descLenPtr = alloc(4);
  const descPtr = (exports.sb_get_desc as (lenPtr: number) => number)(descLenPtr);
  const desc = readWasmString(memory, descPtr, descLenPtr);
  free(descLenPtr, 4);
  
  // Read capabilities
  const capabilities: EngineCapabilities = {
    binarySafe: (exports.sb_is_binary_safe as () => number)() === 1,
    selfInverse: (exports.sb_is_self_inverse as () => number)() === 1,
    reversible: (exports.sb_is_reversible as () => number)() === 1,
    stateful: false,
  };
  
  // Check for stateful support (v2.0)
  if ('sb_is_stateful' in exports && typeof exports.sb_is_stateful === 'function') {
    capabilities.stateful = (exports.sb_is_stateful as () => number)() === 1;
  }
  
  // Read charset support (v2.0)
  let charset: CharsetSupport | undefined;
  if ('sb_get_charset_count' in exports && typeof exports.sb_get_charset_count === 'function') {
    const count = (exports.sb_get_charset_count as () => number)();
    if (count > 0) {
      const supported: string[] = [];
      for (let i = 0; i < count; i++) {
        const charsetLenPtr = alloc(4);
        const charsetPtr = (exports.sb_get_charset as (idx: number, lenPtr: number) => number)(i, charsetLenPtr);
        const charsetName = readWasmString(memory, charsetPtr, charsetLenPtr);
        free(charsetLenPtr, 4);
        if (charsetName) {
          supported.push(charsetName);
        }
      }
      charset = {
        supported,
        default: supported[0] || 'utf-8',
        autoDetect: false,
      };
    }
  }
  
  // Read version (v2.0)
  let version: string | undefined;
  if ('sb_get_version' in exports && typeof exports.sb_get_version === 'function') {
    const versionLenPtr = alloc(4);
    const versionPtr = (exports.sb_get_version as (lenPtr: number) => number)(versionLenPtr);
    version = readWasmString(memory, versionPtr, versionLenPtr);
    free(versionLenPtr, 4);
  }
  
  return {
    id,
    name: name || id,
    desc,
    capabilities,
    charset,
    version,
    isPreset: false,
  };
}

/**
 * Validates engine functionality by running test operations
 * 
 * @param exports - The WASM instance exports
 * @param info - Engine information
 * @returns Validation result
 */
export async function validateEngineFunctionality(
  exports: WebAssembly.Exports,
  info: EngineInfo
): Promise<ValidationResult> {
  const { capabilities } = info;
  const memory = exports.memory as WebAssembly.Memory;
  const alloc = exports.sb_alloc as (size: number) => number;
  const free = exports.sb_free as (ptr: number, size: number) => void;
  const encode = exports.sb_encode as (ptr: number, len: number, outLenPtr: number) => number;
  const decode = exports.sb_decode as (ptr: number, len: number, outLenPtr: number) => number;
  
  const warnings: string[] = [];
  
  try {
    // Test 1: Basic text encoding
    const testInput = new TextEncoder().encode(VALIDATION_TEST_STRING);
    const inPtr = alloc(testInput.length);
    if (!inPtr) {
      return { ok: false, error: 'Memory allocation failed during validation' };
    }
    
    new Uint8Array(memory.buffer).set(testInput, inPtr);
    const outLenPtr = alloc(4);
    
    const outPtr = encode(inPtr, testInput.length, outLenPtr);
    const outLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    
    if (!outPtr || outLen === 0) {
      free(inPtr, testInput.length);
      free(outLenPtr, 4);
      return { ok: false, error: 'Encoding produced no output' };
    }
    
    const encoded = new Uint8Array(memory.buffer, outPtr, outLen).slice();
    free(inPtr, testInput.length);
    free(outLenPtr, 4);
    
    // Test 2: Decode if reversible
    if (capabilities.reversible || capabilities.selfInverse) {
      const decInPtr = alloc(encoded.length);
      new Uint8Array(memory.buffer).set(encoded, decInPtr);
      const decOutLenPtr = alloc(4);
      
      const decOutPtr = decode(decInPtr, encoded.length, decOutLenPtr);
      const decOutLen = new Uint32Array(memory.buffer, decOutLenPtr, 1)[0];
      
      if (!decOutPtr || decOutLen === 0) {
        free(decInPtr, encoded.length);
        free(decOutLenPtr, 4);
        return { ok: false, error: 'Decoding produced no output' };
      }
      
      const decoded = new Uint8Array(memory.buffer, decOutPtr, decOutLen).slice();
      free(decInPtr, encoded.length);
      free(decOutLenPtr, 4);
      
      const decodedStr = new TextDecoder().decode(decoded);
      if (decodedStr !== VALIDATION_TEST_STRING) {
        return { ok: false, error: 'Round-trip encoding/decoding mismatch' };
      }
    }
    
    // Test 3: Self-inverse check
    if (capabilities.selfInverse) {
      const enc2InPtr = alloc(encoded.length);
      new Uint8Array(memory.buffer).set(encoded, enc2InPtr);
      const enc2OutLenPtr = alloc(4);
      
      const enc2OutPtr = encode(enc2InPtr, encoded.length, enc2OutLenPtr);
      const enc2OutLen = new Uint32Array(memory.buffer, enc2OutLenPtr, 1)[0];
      
      if (!enc2OutPtr || enc2OutLen === 0) {
        free(enc2InPtr, encoded.length);
        free(enc2OutLenPtr, 4);
        return { ok: false, error: 'Self-inverse second encode failed' };
      }
      
      const doubleEncoded = new Uint8Array(memory.buffer, enc2OutPtr, enc2OutLen).slice();
      free(enc2InPtr, encoded.length);
      free(enc2OutLenPtr, 4);
      
      const doubleEncodedStr = new TextDecoder().decode(doubleEncoded);
      if (doubleEncodedStr !== VALIDATION_TEST_STRING) {
        return { ok: false, error: 'Self-inverse property not satisfied' };
      }
    }
    
    // Test 4: Binary safety check
    if (capabilities.binarySafe) {
      const binInPtr = alloc(VALIDATION_TEST_BINARY.length);
      new Uint8Array(memory.buffer).set(VALIDATION_TEST_BINARY, binInPtr);
      const binOutLenPtr = alloc(4);
      
      const binOutPtr = encode(binInPtr, VALIDATION_TEST_BINARY.length, binOutLenPtr);
      const binOutLen = new Uint32Array(memory.buffer, binOutLenPtr, 1)[0];
      
      if (!binOutPtr || binOutLen === 0) {
        free(binInPtr, VALIDATION_TEST_BINARY.length);
        free(binOutLenPtr, 4);
        return { ok: false, error: 'Binary-safe encoding failed' };
      }
      
      const binEncoded = new Uint8Array(memory.buffer, binOutPtr, binOutLen).slice();
      free(binInPtr, VALIDATION_TEST_BINARY.length);
      free(binOutLenPtr, 4);
      
      // Test round-trip for binary data
      if (capabilities.reversible || capabilities.selfInverse) {
        const binDecInPtr = alloc(binEncoded.length);
        new Uint8Array(memory.buffer).set(binEncoded, binDecInPtr);
        const binDecOutLenPtr = alloc(4);
        
        const binDecOutPtr = decode(binDecInPtr, binEncoded.length, binDecOutLenPtr);
        const binDecOutLen = new Uint32Array(memory.buffer, binDecOutLenPtr, 1)[0];
        
        if (!binDecOutPtr || binDecOutLen === 0) {
          free(binDecInPtr, binEncoded.length);
          free(binDecOutLenPtr, 4);
          return { ok: false, error: 'Binary-safe decoding failed' };
        }
        
        const binDecoded = new Uint8Array(memory.buffer, binDecOutPtr, binDecOutLen).slice();
        free(binDecInPtr, binEncoded.length);
        free(binDecOutLenPtr, 4);
        
        if (binDecoded.length !== VALIDATION_TEST_BINARY.length) {
          return { ok: false, error: 'Binary-safe size mismatch after round-trip' };
        }
        
        for (let i = 0; i < VALIDATION_TEST_BINARY.length; i++) {
          if (binDecoded[i] !== VALIDATION_TEST_BINARY[i]) {
            return { ok: false, error: 'Binary-safe content mismatch after round-trip' };
          }
        }
      }
    }
    
    return { ok: true, warnings };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}
