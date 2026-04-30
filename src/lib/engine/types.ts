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

export const MAX_IN_MEMORY_SIZE = 100 * 1024 * 1024;
