/**
 * StarBrickVII WASM Engine Type Definitions
 */

export interface EngineCapabilities {
  binarySafe: boolean;
  selfInverse: boolean;
  reversible: boolean;
  stateful: boolean;
}

export interface EngineInfo {
  id: string;
  name: string;
  desc: string;
  capabilities: EngineCapabilities;
}

export type Engine = EngineInfo;

export type ProcessingMode = 'encode' | 'decode';

export type ProcessingState = 'idle' | 'loading' | 'processing' | 'complete' | 'error';

export interface ProcessingResult {
  data: Blob;
  inputSize: number;
  outputSize: number;
  duration: number;
}

export interface WasmInstance {
  memory: WebAssembly.Memory;
  alloc: (size: number) => number;
  free: (ptr: number, size: number) => void;
  encode: (ptr: number, len: number, outLenPtr: number) => number;
  decode: (ptr: number, len: number, outLenPtr: number) => number;
}

export const MAX_IN_MEMORY_SIZE = 100 * 1024 * 1024;
export const CHUNK_SIZE = 1024 * 1024;
