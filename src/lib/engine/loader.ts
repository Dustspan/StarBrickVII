/**
 * StarBrickVII — WASM Engine Loader
 *
 * Loads, instantiates, and caches WASM engines in the MAIN THREAD.
 * Robust validation: optional exports gracefully handled.
 * Works with any v1.0-compliant WASM module.
 */

import { type Engine, type WasmInstance } from './types';

function readStr(mem: WebAssembly.Memory, ptr: number, len: number): string {
  if (!ptr || !len) return '';
  return new TextDecoder().decode(new Uint8Array(mem.buffer, ptr, len));
}

function writeStr(mem: WebAssembly.Memory, alloc: (s: number) => number, str: string) {
  const bytes = new TextEncoder().encode(str);
  const ptr = alloc(bytes.length);
  if (!ptr) throw new Error('WASM alloc failed');
  new Uint8Array(mem.buffer).set(bytes, ptr);
  return { ptr, len: bytes.length };
}

function writeBin(mem: WebAssembly.Memory, alloc: (s: number) => number, data: Uint8Array) {
  const ptr = alloc(data.length);
  if (!ptr) throw new Error('WASM alloc failed');
  new Uint8Array(mem.buffer).set(data, ptr);
  return { ptr, len: data.length };
}

/**
 * Load a single WASM engine from URL or ArrayBuffer
 */
export async function loadWasmEngine(source: string | ArrayBuffer): Promise<{ engine: Engine; wasm: WasmInstance }> {
  let buffer: ArrayBuffer;

  if (typeof source === 'string') {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source}: ${response.status} ${response.statusText}`);
    }
    buffer = await response.arrayBuffer();
  } else {
    buffer = source;
  }

  // Validate it's a real WASM module
  if (buffer.byteLength < 8) {
    throw new Error('File too small to be a valid WASM module');
  }
  const magic = new Uint8Array(buffer, 0, 4);
  if (magic[0] !== 0x00 || magic[1] !== 0x61 || magic[2] !== 0x73 || magic[3] !== 0x6d) {
    throw new Error('Invalid WASM magic number — not a .wasm file');
  }

  let instance: WebAssembly.Instance;
  try {
    const result = await WebAssembly.instantiate(buffer);
    instance = result.instance;
  } catch (err) {
    throw new Error(`WASM instantiation failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  const exp = instance.exports as Record<string, unknown>;

  // Validate required exports with clear error messages
  const required = ['sb_alloc', 'sb_encode', 'sb_decode', 'memory'];
  const missing = required.filter(name => !(name in exp));
  if (missing.length > 0) {
    throw new Error(`Missing required exports: ${missing.join(', ')}. Ensure your WASM follows the StarBrickVII v1.0 protocol.`);
  }

  const memory = exp.memory as WebAssembly.Memory;
  const alloc = exp.sb_alloc as (s: number) => number;
  const free = exp.sb_free as ((p: number, s: number) => void) | undefined;
  const encode = exp.sb_encode as (p: number, l: number, o: number) => number;
  const decode = exp.sb_decode as (p: number, l: number, o: number) => number;

  // Allocate a single reusable outLenPtr for all metadata reads
  const outLenPtr = alloc(4);
  const u32 = new Uint32Array(memory.buffer, outLenPtr, 1);

  // Read metadata — sb_get_id is required, others have fallbacks
  let id = 'unknown';
  let name = 'Unknown Engine';
  let desc = '';

  if (exp.sb_get_id) {
    try {
      const ptr = (exp.sb_get_id as (p: number) => number)(outLenPtr);
      id = readStr(memory, ptr, u32[0]) || 'unknown';
    } catch { /* fallback */ }
  }

  if (exp.sb_get_name) {
    try {
      const ptr = (exp.sb_get_name as (p: number) => number)(outLenPtr);
      name = readStr(memory, ptr, u32[0]) || name;
    } catch { /* fallback */ }
  }

  if (exp.sb_get_desc) {
    try {
      const ptr = (exp.sb_get_desc as (p: number) => number)(outLenPtr);
      desc = readStr(memory, ptr, u32[0]) || '';
    } catch { /* fallback */ }
  }

  // Read capabilities — all optional with safe defaults
  let binarySafe = false;
  let selfInverse = false;
  let reversible = true;
  let stateful = false;

  if (exp.sb_is_binary_safe) {
    try { binarySafe = !!(exp.sb_is_binary_safe as () => number)(); } catch { /* default false */ }
  }
  if (exp.sb_is_self_inverse) {
    try { selfInverse = !!(exp.sb_is_self_inverse as () => number)(); } catch { /* default false */ }
  }
  if (exp.sb_is_reversible) {
    try { reversible = !!(exp.sb_is_reversible as () => number)(); } catch { /* default true */ }
  }
  if (exp.sb_is_stateful) {
    try { stateful = !!(exp.sb_is_stateful as () => number)(); } catch { /* default false */ }
  }

  // Quick validation: encode a test string
  try {
    const testStr = 'StarBrickVII';
    const testBytes = new TextEncoder().encode(testStr);
    const inPtr = alloc(testBytes.length);
    new Uint8Array(memory.buffer).set(testBytes, inPtr);
    const encPtr = encode(inPtr, testBytes.length, outLenPtr);
    const encLen = u32[0];
    if (!encPtr || encLen === 0) {
      throw new Error('Engine encode returned empty result for test input');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Engine encode')) {
      throw new Error(`Engine validation failed: ${err.message}`);
    }
    // Other errors during validation are non-fatal
  }

  const engine: Engine = { id, name, desc, capabilities: { binarySafe, selfInverse, reversible, stateful } };
  const wasm: WasmInstance = {
    memory,
    alloc,
    free: free || ((_p: number, _s: number) => {}),
    encode,
    decode,
  };

  return { engine, wasm };
}

/**
 * Encode text using a WasmInstance
 */
export function wasmEncode(wasm: WasmInstance, text: string): string {
  const { memory, alloc, encode } = wasm;
  const { ptr, len } = writeStr(memory, alloc, text);
  const outLenPtr = alloc(4);
  const resultPtr = encode(ptr, len, outLenPtr);
  const resultLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
  if (!resultPtr || resultLen === 0) return '';
  const result = readStr(memory, resultPtr, resultLen);
  return result;
}

/**
 * Decode text using a WasmInstance
 */
export function wasmDecode(wasm: WasmInstance, text: string): string {
  const { memory, alloc, decode } = wasm;
  const { ptr, len } = writeStr(memory, alloc, text);
  const outLenPtr = alloc(4);
  const resultPtr = decode(ptr, len, outLenPtr);
  const resultLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
  if (!resultPtr || resultLen === 0) return '';
  const result = readStr(memory, resultPtr, resultLen);
  return result;
}

/**
 * Encode binary data using a WasmInstance
 */
export function wasmEncodeBinary(wasm: WasmInstance, data: Uint8Array): Uint8Array {
  const { memory, alloc, encode } = wasm;
  const { ptr, len } = writeBin(memory, alloc, data);
  const outLenPtr = alloc(4);
  const resultPtr = encode(ptr, len, outLenPtr);
  const resultLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
  if (!resultPtr || resultLen === 0) return new Uint8Array(0);
  return new Uint8Array(memory.buffer, resultPtr, resultLen).slice();
}

/**
 * Decode binary data using a WasmInstance
 */
export function wasmDecodeBinary(wasm: WasmInstance, data: Uint8Array): Uint8Array {
  const { memory, alloc, decode } = wasm;
  const { ptr, len } = writeBin(memory, alloc, data);
  const outLenPtr = alloc(4);
  const resultPtr = decode(ptr, len, outLenPtr);
  const resultLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
  if (!resultPtr || resultLen === 0) return new Uint8Array(0);
  return new Uint8Array(memory.buffer, resultPtr, resultLen).slice();
}
