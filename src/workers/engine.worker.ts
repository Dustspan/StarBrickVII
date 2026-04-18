/**
 * StarBrickVII Engine Worker
 * 
 * Web Worker for WASM engine operations.
 * Handles loading, encoding, decoding, and validation of WASM engines.
 */

import {
  validateExports,
  extractEngineInfo,
  validateEngineFunctionality,
} from '../lib/engine/validator';

// Type imports (these will be bundled with the worker)
interface LoadPayload {
  wasmUrl: string;
}

interface ProcessPayload {
  chunk: ArrayBuffer;
  isLast: boolean;
  totalChunks?: number;
  chunkIndex?: number;
}

interface WorkerMessage<T = unknown> {
  id: number;
  type: 'load' | 'encode' | 'decode' | 'validate';
  payload: T;
}

interface WorkerResponse<T = unknown> {
  id: number;
  type: 'loaded' | 'chunk' | 'result' | 'error' | 'progress';
  payload?: T;
  error?: string;
}

// Worker state
let wasmExports: WebAssembly.Exports | null = null;
let engineInfo: ReturnType<typeof extractEngineInfo> | null = null;

/**
 * Sends a response message to the main thread
 */
function sendResponse<T>(response: WorkerResponse<T>): void {
  self.postMessage(response);
}

/**
 * Loads a WASM engine from a URL
 */
async function loadEngine(id: number, payload: LoadPayload): Promise<void> {
  try {
    const { wasmUrl } = payload;
    
    // Fetch and compile the WASM module
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
    }
    
    const wasmBytes = await response.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBytes);
    const instance = await WebAssembly.instantiate(wasmModule);
    const exports = instance.exports;
    
    // Validate required exports
    const validationResult = validateExports(exports);
    if (!validationResult.ok) {
      throw new Error(validationResult.error);
    }
    
    // Extract engine metadata
    const info = extractEngineInfo(exports);
    
    // Validate engine functionality
    const funcValidation = await validateEngineFunctionality(exports, info);
    if (!funcValidation.ok) {
      throw new Error(funcValidation.error);
    }
    
    // Store in worker state
    wasmExports = exports;
    engineInfo = info;
    
    // Send success response
    sendResponse({
      id,
      type: 'loaded',
      payload: {
        ...info,
        warnings: [...(validationResult.warnings || []), ...(funcValidation.warnings || [])],
      },
    });
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error loading engine',
    });
  }
}

/**
 * Processes a chunk of data (encode or decode)
 */
function processChunk(
  id: number,
  type: 'encode' | 'decode',
  payload: ProcessPayload
): void {
  try {
    if (!wasmExports) {
      throw new Error('Engine not loaded');
    }
    
    const { chunk, isLast, totalChunks, chunkIndex } = payload;
    const fnName = type === 'encode' ? 'sb_encode' : 'sb_decode';
    
    const memory = wasmExports.memory as WebAssembly.Memory;
    const alloc = wasmExports.sb_alloc as (size: number) => number;
    const free = wasmExports.sb_free as (ptr: number, size: number) => void;
    const processFn = wasmExports[fnName] as (ptr: number, len: number, outLenPtr: number) => number;
    
    // Allocate input memory
    const chunkBytes = new Uint8Array(chunk);
    const inPtr = alloc(chunkBytes.length);
    if (!inPtr) {
      throw new Error('Memory allocation failed for input');
    }
    
    // Copy input data to WASM memory
    new Uint8Array(memory.buffer).set(chunkBytes, inPtr);
    
    // Allocate output length pointer
    const outLenPtr = alloc(4);
    if (!outLenPtr) {
      free(inPtr, chunkBytes.length);
      throw new Error('Memory allocation failed for output length');
    }
    
    try {
      // Process the chunk
      const outPtr = processFn(inPtr, chunkBytes.length, outLenPtr);
      const outLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
      
      if (outPtr && outLen > 0) {
        // Copy output data from WASM memory
        const result = new Uint8Array(memory.buffer, outPtr, outLen).slice();
        
        // Send chunk response with transferable
        sendResponse({
          id,
          type: 'chunk',
          payload: result.buffer,
        });
      }
      
      // Send progress update if we have chunk info
      if (totalChunks !== undefined && chunkIndex !== undefined) {
        sendResponse({
          id,
          type: 'progress',
          payload: {
            current: chunkIndex + 1,
            total: totalChunks,
          },
        });
      }
      
      // Send result message if this is the last chunk
      if (isLast) {
        sendResponse({
          id,
          type: 'result',
        });
      }
    } finally {
      // Free allocated memory
      free(inPtr, chunkBytes.length);
      free(outLenPtr, 4);
    }
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error processing chunk',
    });
  }
}

/**
 * Validates the currently loaded engine
 */
function validateEngine(id: number): void {
  try {
    if (!wasmExports || !engineInfo) {
      throw new Error('Engine not loaded');
    }
    
    // Re-run validation
    const result = validateEngineFunctionality(wasmExports, engineInfo);
    
    sendResponse({
      id,
      type: 'result',
      payload: result,
    });
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error validating engine',
    });
  }
}

/**
 * Message handler
 */
self.onmessage = (event: MessageEvent<WorkerMessage<unknown>>) => {
  const { id, type, payload } = event.data;
  
  switch (type) {
    case 'load':
      loadEngine(id, payload as LoadPayload);
      break;
    case 'encode':
    case 'decode':
      processChunk(id, type, payload as ProcessPayload);
      break;
    case 'validate':
      validateEngine(id);
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
