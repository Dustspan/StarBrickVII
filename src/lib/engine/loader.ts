/**
 * StarBrickVII — WASM Engine Loader
 * 
 * Loads, instantiates, and caches WASM engines in the MAIN THREAD.
 * No worker dependency for loading — eliminates all URL resolution issues.
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
 * Load a single WASM engine from URL, return Engine metadata + WasmInstance
 */
export async function loadWasmEngine(wasmUrl: string): Promise<{ engine: Engine; wasm: WasmInstance }> {
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${wasmUrl}: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(buffer);
  const exp = instance.exports as Record<string, unknown>;

  const memory = exp.memory as WebAssembly.Memory;
  const alloc = exp.sb_alloc as (s: number) => number;
  const free = exp.sb_free as (p: number, s: number) => void;
  const encode = exp.sb_encode as (p: number, l: number, o: number) => number;
  const decode = exp.sb_decode as (p: number, l: number, o: number) => number;

  if (!alloc || !encode || !decode || !memory) {
    throw new Error(`Missing required WASM exports in ${wasmUrl}`);
  }

  // Allocate a single reusable outLenPtr for all metadata reads
  const outLenPtr = alloc(4);
  const u32 = new Uint32Array(memory.buffer, outLenPtr, 1);

  const idPtr = (exp.sb_get_id as (p: number) => number)(outLenPtr);
  const id = readStr(memory, idPtr, u32[0]);

  const namePtr = (exp.sb_get_name as (p: number) => number)(outLenPtr);
  const name = readStr(memory, namePtr, u32[0]);

  const descPtr = (exp.sb_get_desc as (p: number) => number)(outLenPtr);
  const desc = readStr(memory, descPtr, u32[0]);

  // Read capabilities — sb_is_stateful is optional (v2.0)
  const binarySafe = !!(exp.sb_is_binary_safe as (() => number))();
  const selfInverse = !!(exp.sb_is_self_inverse as (() => number))();
  const reversible = !!(exp.sb_is_reversible as (() => number))();
  const statefulFn = exp.sb_is_stateful as (() => number) | undefined;
  const stateful = statefulFn ? !!statefulFn() : false;

  const engine: Engine = { id, name, desc, capabilities: { binarySafe, selfInverse, reversible, stateful } };
  const wasm: WasmInstance = { memory, alloc, free, encode, decode };

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
