/**
 * StarBrickVII Engine Worker
 * 
 * Web Worker for WASM engine operations.
 * Handles loading, encoding, decoding with real WASM engines.
 */

// Worker state
let wasmExports: WebAssembly.Exports | null = null;
let wasmMemory: WebAssembly.Memory | null = null;
let currentEngineId: string | null = null;

// Message types
interface WorkerMessage {
  id: string;
  type: 'load' | 'encode' | 'decode';
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

/**
 * Sends a response message to the main thread
 */
function sendResponse<T>(response: WorkerResponse): void {
  self.postMessage(response);
}

/**
 * Reads a string from WASM memory
 */
function readWasmString(ptr: number, len: number): string {
  if (!wasmMemory || ptr === 0 || len === 0) return '';
  const bytes = new Uint8Array(wasmMemory.buffer, ptr, len);
  return new TextDecoder().decode(bytes);
}

/**
 * Writes a string to WASM memory
 */
function writeWasmString(str: string): { ptr: number; len: number } {
  if (!wasmExports) throw new Error('WASM not loaded');
  
  const bytes = new TextEncoder().encode(str);
  const alloc = wasmExports.sb_alloc as (size: number) => number;
  const ptr = alloc(bytes.length);
  
  if (!wasmMemory) throw new Error('WASM memory not available');
  new Uint8Array(wasmMemory.buffer).set(bytes, ptr);
  
  return { ptr, len: bytes.length };
}

/**
 * Loads a WASM engine
 */
async function loadEngine(id: string, wasmUrl: string): Promise<void> {
  try {
    // Fetch and instantiate WASM
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.status}`);
    }
    
    const wasmBuffer = await response.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    const instance = await WebAssembly.instantiate(wasmModule, {
      env: {
        memory: new WebAssembly.Memory({ initial: 256, maximum: 4096 }),
      },
    });
    
    wasmExports = instance.exports;
    wasmMemory = wasmExports.memory as WebAssembly.Memory;
    currentEngineId = id;
    
    // Verify required exports
    const requiredExports = ['sb_alloc', 'sb_free', 'sb_encode', 'sb_decode'];
    for (const exp of requiredExports) {
      if (!(exp in wasmExports)) {
        throw new Error(`Missing required export: ${exp}`);
      }
    }
    
    sendResponse({
      id,
      type: 'loaded',
      payload: {
        info: {
          id,
          name: id,
          desc: `${id} encoding engine`,
          capabilities: {
            binarySafe: true,
            selfInverse: false,
            reversible: true,
            stateful: false,
          },
        },
      },
    });
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Failed to load engine',
    });
  }
}

/**
 * Encodes text using WASM
 */
function encodeText(id: string, text: string): void {
  try {
    if (!wasmExports || !wasmMemory) {
      throw new Error('Engine not loaded');
    }
    
    // Send progress
    sendResponse({
      id,
      type: 'progress',
      payload: { progress: 0.1 },
    });
    
    // Write input to memory
    const { ptr: inPtr, len: inLen } = writeWasmString(text);
    
    // Allocate output length pointer
    const alloc = wasmExports.sb_alloc as (size: number) => number;
    const free = wasmExports.sb_free as (ptr: number, size: number) => void;
    const encode = wasmExports.sb_encode as (ptr: number, len: number, outLenPtr: number) => number;
    
    const outLenPtr = alloc(4);
    
    // Send progress
    sendResponse({
      id,
      type: 'progress',
      payload: { progress: 0.5 },
    });
    
    // Call encode
    const outPtr = encode(inPtr, inLen, outLenPtr);
    
    // Read output length
    const outLen = new Uint32Array(wasmMemory.buffer, outLenPtr, 1)[0];
    
    if (outPtr === 0 || outLen === 0) {
      free(inPtr, inLen);
      free(outLenPtr, 4);
      throw new Error('Encoding produced no output');
    }
    
    // Read result
    const result = readWasmString(outPtr, outLen);
    
    // Free memory
    free(inPtr, inLen);
    free(outLenPtr, 4);
    
    // Send progress
    sendResponse({
      id,
      type: 'progress',
      payload: { progress: 0.9 },
    });
    
    sendResponse({
      id,
      type: 'result',
      payload: { result },
    });
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Encoding failed',
    });
  }
}

/**
 * Decodes text using WASM
 */
function decodeText(id: string, text: string): void {
  try {
    if (!wasmExports || !wasmMemory) {
      throw new Error('Engine not loaded');
    }
    
    // Send progress
    sendResponse({
      id,
      type: 'progress',
      payload: { progress: 0.1 },
    });
    
    // Write input to memory
    const { ptr: inPtr, len: inLen } = writeWasmString(text);
    
    // Allocate output length pointer
    const alloc = wasmExports.sb_alloc as (size: number) => number;
    const free = wasmExports.sb_free as (ptr: number, size: number) => void;
    const decode = wasmExports.sb_decode as (ptr: number, len: number, outLenPtr: number) => number;
    
    const outLenPtr = alloc(4);
    
    // Send progress
    sendResponse({
      id,
      type: 'progress',
      payload: { progress: 0.5 },
    });
    
    // Call decode
    const outPtr = decode(inPtr, inLen, outLenPtr);
    
    // Read output length
    const outLen = new Uint32Array(wasmMemory.buffer, outLenPtr, 1)[0];
    
    if (outPtr === 0 || outLen === 0) {
      free(inPtr, inLen);
      free(outLenPtr, 4);
      throw new Error('Decoding produced no output');
    }
    
    // Read result
    const result = readWasmString(outPtr, outLen);
    
    // Free memory
    free(inPtr, inLen);
    free(outLenPtr, 4);
    
    // Send progress
    sendResponse({
      id,
      type: 'progress',
      payload: { progress: 0.9 },
    });
    
    sendResponse({
      id,
      type: 'result',
      payload: { result },
    });
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Decoding failed',
    });
  }
}

/**
 * Encodes binary chunk using WASM
 */
function encodeChunk(id: string, chunk: ArrayBuffer, progress: number): void {
  try {
    if (!wasmExports || !wasmMemory) {
      throw new Error('Engine not loaded');
    }
    
    const bytes = new Uint8Array(chunk);
    const text = new TextDecoder().decode(bytes);
    
    encodeText(id, text);
    
    // Override progress with chunk progress
    sendResponse({
      id,
      type: 'progress',
      payload: { progress },
    });
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Chunk encoding failed',
    });
  }
}

/**
 * Decodes binary chunk using WASM
 */
function decodeChunk(id: string, chunk: ArrayBuffer, progress: number): void {
  try {
    if (!wasmExports || !wasmMemory) {
      throw new Error('Engine not loaded');
    }
    
    const bytes = new Uint8Array(chunk);
    const text = new TextDecoder().decode(bytes);
    
    decodeText(id, text);
    
    // Override progress with chunk progress
    sendResponse({
      id,
      type: 'progress',
      payload: { progress },
    });
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Chunk decoding failed',
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
        encodeText(id, payload.text);
      } else if (payload.chunk) {
        const progress = payload.chunkIndex !== undefined && payload.totalChunks
          ? (payload.chunkIndex + 1) / payload.totalChunks
          : 0.5;
        encodeChunk(id, payload.chunk, progress);
      }
      break;
      
    case 'decode':
      if (payload.text) {
        decodeText(id, payload.text);
      } else if (payload.chunk) {
        const progress = payload.chunkIndex !== undefined && payload.totalChunks
          ? (payload.chunkIndex + 1) / payload.totalChunks
          : 0.5;
        decodeChunk(id, payload.chunk, progress);
      }
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
