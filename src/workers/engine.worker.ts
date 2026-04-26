/**
 * StarBrickVII Engine Worker
 * 
 * Web Worker for WASM engine operations.
 * Handles loading, encoding, decoding with real WASM engines.
 * Implements chunked processing for large files.
 */

// Engine instance cache
const engineCache = new Map<string, {
  exports: WebAssembly.Exports;
  memory: WebAssembly.Memory;
  info: EngineInfo;
}>();

// Current active engine
let currentEngineId: string | null = null;

// Message types
interface WorkerMessage {
  id: string;
  type: 'load' | 'encode' | 'decode' | 'abort';
  payload: {
    wasmUrl?: string;
    text?: string;
    chunk?: ArrayBuffer;
    totalSize?: number;
    chunkIndex?: number;
    totalChunks?: number;
    isLast?: boolean;
  };
}

interface WorkerResponse {
  id: string;
  type: 'loaded' | 'progress' | 'result' | 'error';
  payload?: {
    info?: EngineInfo;
    result?: string;
    progress?: number;
  };
  error?: string;
}

interface EngineInfo {
  id: string;
  name: string;
  desc: string;
  capabilities: {
    binarySafe: boolean;
    selfInverse: boolean;
    reversible: boolean;
    stateful: boolean;
  };
}

// Chunk size for large file processing (1MB)
const _CHUNK_SIZE = 1024 * 1024;

/**
 * Sends a response message to the main thread
 */
function sendResponse(response: WorkerResponse): void {
  self.postMessage(response);
}

/**
 * Reads a string from WASM memory
 */
function readWasmString(memory: WebAssembly.Memory, ptr: number, len: number): string {
  if (ptr === 0 || len === 0) return '';
  const bytes = new Uint8Array(memory.buffer, ptr, len);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Writes a string to WASM memory
 */
function writeWasmString(
  memory: WebAssembly.Memory,
  alloc: (size: number) => number,
  str: string
): { ptr: number; len: number } {
  const bytes = new TextEncoder().encode(str);
  const ptr = alloc(bytes.length);
  
  if (ptr === 0) {
    throw new Error('Memory allocation failed');
  }
  
  new Uint8Array(memory.buffer).set(bytes, ptr);
  
  return { ptr, len: bytes.length };
}

/**
 * Writes binary data to WASM memory
 */
function writeWasmBinary(
  memory: WebAssembly.Memory,
  alloc: (size: number) => number,
  data: Uint8Array
): { ptr: number; len: number } {
  const ptr = alloc(data.length);
  
  if (ptr === 0) {
    throw new Error('Memory allocation failed');
  }
  
  new Uint8Array(memory.buffer).set(data, ptr);
  
  return { ptr, len: data.length };
}

/**
 * Loads a WASM engine and extracts metadata
 */
async function loadEngine(requestId: string, wasmUrl: string): Promise<void> {
  try {
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 0.1 },
    });
    
    // Fetch WASM file
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
    }
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 0.3 },
    });
    
    const wasmBuffer = await response.arrayBuffer();
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 0.5 },
    });
    
    // Compile and instantiate WASM
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    
    // Check exports before instantiation
    const exports = WebAssembly.Module.exports(wasmModule);
    const exportNames = exports.map(e => e.name);
    
    const requiredExports = [
      'sb_alloc', 'sb_free', 'sb_encode', 'sb_decode',
      'sb_get_id', 'sb_get_name', 'sb_get_desc',
      'sb_is_binary_safe', 'sb_is_self_inverse', 'sb_is_reversible',
      'memory'
    ];
    
    for (const required of requiredExports) {
      if (!exportNames.includes(required)) {
        throw new Error(`Missing required export: ${required}`);
      }
    }
    
    const instance = await WebAssembly.instantiate(wasmModule, {
      env: {
        memory: new WebAssembly.Memory({ initial: 256, maximum: 16384 }),
      },
    });
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 0.7 },
    });
    
    const wasmExports = instance.exports;
    const memory = wasmExports.memory as WebAssembly.Memory;
    
    // Extract engine metadata
    const alloc = wasmExports.sb_alloc as (size: number) => number;
    const free = wasmExports.sb_free as (ptr: number, size: number) => void;
    
    const getId = wasmExports.sb_get_id as (outLenPtr: number) => number;
    const getName = wasmExports.sb_get_name as (outLenPtr: number) => number;
    const getDesc = wasmExports.sb_get_desc as (outLenPtr: number) => number;
    const isBinarySafe = wasmExports.sb_is_binary_safe as () => number;
    const isSelfInverse = wasmExports.sb_is_self_inverse as () => number;
    const isReversible = wasmExports.sb_is_reversible as () => number;
    
    // Allocate output length pointer
    const outLenPtr = alloc(4);
    
    // Get engine ID
    const idPtr = getId(outLenPtr);
    const idLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    const id = readWasmString(memory, idPtr, idLen);
    
    // Get engine name
    const namePtr = getName(outLenPtr);
    const nameLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    const name = readWasmString(memory, namePtr, nameLen);
    
    // Get engine description
    const descPtr = getDesc(outLenPtr);
    const descLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    const desc = readWasmString(memory, descPtr, descLen);
    
    // Get capabilities
    const binarySafe = isBinarySafe() !== 0;
    const selfInverse = isSelfInverse() !== 0;
    const reversible = isReversible() !== 0;
    
    // Check for stateful capability (optional)
    const isStateful = wasmExports.sb_is_stateful as (() => number) | undefined;
    const stateful = isStateful ? isStateful() !== 0 : false;
    
    // Free allocated memory
    free(outLenPtr, 4);
    
    const engineInfo: EngineInfo = {
      id,
      name,
      desc,
      capabilities: {
        binarySafe,
        selfInverse,
        reversible,
        stateful,
      },
    };
    
    // Cache the engine
    engineCache.set(id, {
      exports: wasmExports,
      memory,
      info: engineInfo,
    });
    
    currentEngineId = id;
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 1.0 },
    });
    
    sendResponse({
      id: requestId,
      type: 'loaded',
      payload: { info: engineInfo },
    });
  } catch (error) {
    sendResponse({
      id: requestId,
      type: 'error',
      error: error instanceof Error ? error.message : 'Failed to load engine',
    });
  }
}

/**
 * Processes text using WASM engine
 */
function processText(
  requestId: string,
  text: string,
  mode: 'encode' | 'decode'
): void {
  try {
    const engine = currentEngineId ? engineCache.get(currentEngineId) : null;
    
    if (!engine) {
      throw new Error('No engine loaded');
    }
    
    const { exports, memory } = engine;
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 0.1 },
    });
    
    const alloc = exports.sb_alloc as (size: number) => number;
    const free = exports.sb_free as (ptr: number, size: number) => void;
    const process = (mode === 'encode' 
      ? exports.sb_encode 
      : exports.sb_decode) as (ptr: number, len: number, outLenPtr: number) => number;
    
    // Write input to memory
    const { ptr: inPtr, len: inLen } = writeWasmString(memory, alloc, text);
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 0.3 },
    });
    
    // Allocate output length pointer
    const outLenPtr = alloc(4);
    
    // Process
    const outPtr = process(inPtr, inLen, outLenPtr);
    
    // Read output length
    const outLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    
    if (outPtr === 0 || outLen === 0) {
      free(inPtr, inLen);
      free(outLenPtr, 4);
      throw new Error(`${mode === 'encode' ? 'Encoding' : 'Decoding'} produced no output`);
    }
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 0.7 },
    });
    
    // Read result
    const result = readWasmString(memory, outPtr, outLen);
    
    // Free memory
    free(inPtr, inLen);
    free(outLenPtr, 4);
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress: 0.9 },
    });
    
    sendResponse({
      id: requestId,
      type: 'result',
      payload: { result },
    });
  } catch (error) {
    sendResponse({
      id: requestId,
      type: 'error',
      error: error instanceof Error ? error.message : `${mode} failed`,
    });
  }
}

/**
 * Processes binary data using WASM engine
 */
function processBinary(
  requestId: string,
  data: Uint8Array,
  mode: 'encode' | 'decode',
  progress: number
): void {
  try {
    const engine = currentEngineId ? engineCache.get(currentEngineId) : null;
    
    if (!engine) {
      throw new Error('No engine loaded');
    }
    
    const { exports, memory } = engine;
    
    const alloc = exports.sb_alloc as (size: number) => number;
    const free = exports.sb_free as (ptr: number, size: number) => void;
    const process = (mode === 'encode' 
      ? exports.sb_encode 
      : exports.sb_decode) as (ptr: number, len: number, outLenPtr: number) => number;
    
    // Write binary data to memory
    const { ptr: inPtr, len: inLen } = writeWasmBinary(memory, alloc, data);
    
    // Allocate output length pointer
    const outLenPtr = alloc(4);
    
    // Process
    const outPtr = process(inPtr, inLen, outLenPtr);
    
    // Read output length
    const outLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    
    if (outPtr === 0 || outLen === 0) {
      free(inPtr, inLen);
      free(outLenPtr, 4);
      throw new Error(`${mode === 'encode' ? 'Encoding' : 'Decoding'} produced no output`);
    }
    
    // Read result
    const result = readWasmString(memory, outPtr, outLen);
    
    // Free memory
    free(inPtr, inLen);
    free(outLenPtr, 4);
    
    sendResponse({
      id: requestId,
      type: 'progress',
      payload: { progress },
    });
    
    sendResponse({
      id: requestId,
      type: 'result',
      payload: { result },
    });
  } catch (error) {
    sendResponse({
      id: requestId,
      type: 'error',
      error: error instanceof Error ? error.message : `${mode} failed`,
    });
  }
}

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;
  
  switch (type) {
    case 'load':
      if (payload.wasmUrl) {
        await loadEngine(id, payload.wasmUrl);
      }
      break;
      
    case 'encode':
      if (payload.text) {
        processText(id, payload.text, 'encode');
      } else if (payload.chunk) {
        const progress = payload.chunkIndex !== undefined && payload.totalChunks
          ? (payload.chunkIndex + 1) / payload.totalChunks
          : 0.5;
        const bytes = new Uint8Array(payload.chunk);
        processBinary(id, bytes, 'encode', progress);
      }
      break;
      
    case 'decode':
      if (payload.text) {
        processText(id, payload.text, 'decode');
      } else if (payload.chunk) {
        const progress = payload.chunkIndex !== undefined && payload.totalChunks
          ? (payload.chunkIndex + 1) / payload.totalChunks
          : 0.5;
        const bytes = new Uint8Array(payload.chunk);
        processBinary(id, bytes, 'decode', progress);
      }
      break;
      
    case 'abort':
      // Clear engine cache on abort
      if (currentEngineId) {
        engineCache.delete(currentEngineId);
        currentEngineId = null;
      }
      sendResponse({
        id,
        type: 'error',
        error: 'Operation aborted',
      });
      break;
      
    default:
      sendResponse({
        id,
        type: 'error',
        error: `Unknown message type: ${type}`,
      });
  }
};

// Export empty object for TypeScript module
export {};
