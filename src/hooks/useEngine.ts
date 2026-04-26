/**
 * useEngine Hook
 * 
 * Manages WASM engine loading, selection, and operations.
 * Connects to real WASM engines from public/engines directory.
 * Implements request queue with timeout and abort support.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  type Engine,
  type EngineInfo,
  type ProcessingMode,
  type ProcessingState,
  type ProcessingResult,
  MAX_IN_MEMORY_SIZE,
} from '@/lib/engine/types';
import { PRESET_ENGINES } from '@/lib/engine/protocol';

// Worker message types
interface WorkerRequest {
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

// Request queue entry
interface RequestEntry {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  aborted: boolean;
}

interface UseEngineReturn {
  // Engine state
  engines: Map<string, Engine>;
  currentEngine: Engine | null;
  processingState: ProcessingState;
  error: string | null;
  
  // Engine management
  loadPresetEngines: () => Promise<void>;
  loadCustomEngine: (file: File) => Promise<void>;
  selectEngine: (id: string) => void;
  unloadEngine: (id: string) => void;
  
  // Processing
  processText: (text: string, mode: ProcessingMode) => Promise<ProcessingResult | null>;
  processFile: (file: File, mode: ProcessingMode) => Promise<ProcessingResult | null>;
  
  // Progress
  progress: number;
  estimatedTimeRemaining: number | null;
  
  // Error handling
  clearError: () => void;
  
  // Abort
  abort: () => void;
}

// Request timeout (30 seconds)
const REQUEST_TIMEOUT = 30000;

// Chunk size for large files (1MB)
const CHUNK_SIZE = 1024 * 1024;

/**
 * Generates a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * useEngine Hook
 */
export function useEngine(): UseEngineReturn {
  // State
  const [engines, setEngines] = useState<Map<string, Engine>>(new Map());
  const [currentEngine, setCurrentEngine] = useState<Engine | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  
  // Refs
  const workerRef = useRef<Worker | null>(null);
  const requestQueueRef = useRef<Map<string, RequestEntry>>(new Map());
  const processingStartTimeRef = useRef<number | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  
  /**
   * Gets or creates a worker
   */
  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/engine.worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, type, payload, error } = event.data;
        const entry = requestQueueRef.current.get(id);
        
        if (!entry) return;
        
        switch (type) {
          case 'loaded':
            // Engine loaded successfully
            if (payload?.info) {
              const engine: Engine = {
                ...payload.info,
              };
              setEngines(prev => {
                const next = new Map(prev);
                next.set(engine.id, engine);
                return next;
              });
              setCurrentEngine(engine);
              setProcessingState('idle');
            }
            break;
            
          case 'progress':
            if (payload?.progress !== undefined) {
              setProgress(payload.progress);
              entry.onProgress?.(payload.progress);
              
              // Estimate remaining time
              if (processingStartTimeRef.current && payload.progress > 0) {
                const elapsed = Date.now() - processingStartTimeRef.current;
                const total = elapsed / payload.progress;
                const remaining = total - elapsed;
                setEstimatedTimeRemaining(Math.round(remaining));
              }
            }
            break;
            
          case 'result':
            if (payload?.result !== undefined && !entry.aborted) {
              clearTimeout(entry.timeoutId);
              requestQueueRef.current.delete(id);
              entry.resolve(payload.result);
              setProgress(1);
              setProcessingState('complete');
              setEstimatedTimeRemaining(null);
            }
            break;
            
          case 'error':
            clearTimeout(entry.timeoutId);
            requestQueueRef.current.delete(id);
            if (!entry.aborted) {
              entry.reject(new Error(error || 'Unknown error'));
              setError(error || 'Unknown error');
              setProcessingState('error');
            }
            break;
        }
      };
      
      workerRef.current.onerror = (event) => {
        console.error('Worker error:', event);
        setError('Worker error: ' + event.message);
        setProcessingState('error');
      };
    }
    
    return workerRef.current;
  }, []);
  
  /**
   * Sends a message to the worker and returns a promise
   */
  const sendWorkerMessage = useCallback((
    type: WorkerRequest['type'],
    payload: WorkerRequest['payload'],
    onProgress?: (progress: number) => void
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const worker = getWorker();
      const id = generateRequestId();
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        const entry = requestQueueRef.current.get(id);
        if (entry) {
          entry.aborted = true;
          requestQueueRef.current.delete(id);
          reject(new Error('Request timeout'));
          setError('Request timeout (30s)');
          setProcessingState('error');
          
          // Terminate and recreate worker
          worker.terminate();
          workerRef.current = null;
        }
      }, REQUEST_TIMEOUT);
      
      // Add to queue
      requestQueueRef.current.set(id, {
        resolve,
        reject,
        onProgress,
        timeoutId,
        aborted: false,
      });
      
      currentRequestIdRef.current = id;
      
      // Send message
      worker.postMessage({ id, type, payload });
    });
  }, [getWorker]);
  
  /**
   * Loads preset engines
   */
  const loadPresetEngines = useCallback(async (): Promise<void> => {
    setProcessingState('loading');
    setError(null);
    
    for (const wasmUrl of PRESET_ENGINES) {
      try {
        await sendWorkerMessage('load', { wasmUrl });
      } catch (err) {
        console.error(`Failed to load engine ${wasmUrl}:`, err);
      }
    }
    
    setProcessingState('idle');
  }, [sendWorkerMessage]);
  
  /**
   * Loads a custom engine from file
   */
  const loadCustomEngine = useCallback(async (file: File): Promise<void> => {
    setProcessingState('loading');
    setError(null);
    
    try {
      // Create object URL for the file
      const wasmUrl = URL.createObjectURL(file);
      await sendWorkerMessage('load', { wasmUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load custom engine';
      setError(message);
      setProcessingState('error');
    }
  }, [sendWorkerMessage]);
  
  /**
   * Selects an engine
   */
  const selectEngine = useCallback((id: string): void => {
    const engine = engines.get(id);
    if (engine) {
      setCurrentEngine(engine);
      setError(null);
    }
  }, [engines]);
  
  /**
   * Unloads an engine
   */
  const unloadEngine = useCallback((id: string): void => {
    setEngines(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    
    if (currentEngine?.id === id) {
      setCurrentEngine(null);
    }
  }, [currentEngine]);
  
  /**
   * Processes text
   */
  const processText = useCallback(async (
    text: string,
    mode: ProcessingMode
  ): Promise<ProcessingResult | null> => {
    if (!currentEngine) {
      setError('No engine selected');
      return null;
    }
    
    setProcessingState('processing');
    setError(null);
    setProgress(0);
    processingStartTimeRef.current = Date.now();
    
    try {
      const startTime = Date.now();
      
      const result = await sendWorkerMessage(mode, { text }, (p) => {
        setProgress(p);
      });
      
      const duration = Date.now() - startTime;
      
      return {
        data: new Blob([result], { type: 'text/plain' }),
        inputSize: new Blob([text]).size,
        outputSize: result.length,
        duration,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      setError(message);
      setProcessingState('error');
      return null;
    }
  }, [currentEngine, sendWorkerMessage]);
  
  /**
   * Processes a file
   */
  const processFile = useCallback(async (
    file: File,
    mode: ProcessingMode
  ): Promise<ProcessingResult | null> => {
    if (!currentEngine) {
      setError('No engine selected');
      return null;
    }
    
    // Check file size
    if (file.size > MAX_IN_MEMORY_SIZE) {
      setError(`File too large (max ${MAX_IN_MEMORY_SIZE / 1024 / 1024}MB)`);
      return null;
    }
    
    setProcessingState('processing');
    setError(null);
    setProgress(0);
    processingStartTimeRef.current = Date.now();
    
    try {
      const startTime = Date.now();
      
      // Read file content
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // For large files, process in chunks
      if (file.size > CHUNK_SIZE) {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let result = '';
        
        for (let i = 0; i < totalChunks; i++) {
          const chunkStart = i * CHUNK_SIZE;
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, file.size);
          const chunk = bytes.slice(chunkStart, chunkEnd);
          
          const chunkResult = await sendWorkerMessage(mode, {
            chunk: chunk.buffer,
            chunkIndex: i,
            totalChunks,
            totalSize: file.size,
            isLast: i === totalChunks - 1,
          }, (p) => {
            // Progress is chunk-based
            const overallProgress = (i + p) / totalChunks;
            setProgress(overallProgress);
          });
          
          result += chunkResult;
        }
        
        const duration = Date.now() - startTime;
        
        return {
          data: new Blob([result], { type: 'text/plain' }),
          inputSize: file.size,
          outputSize: result.length,
          duration,
        };
      } else {
        // Small file - process directly
        const result = await sendWorkerMessage(mode, {
          chunk: buffer,
          totalSize: file.size,
        }, (p) => {
          setProgress(p);
        });
        
        const duration = Date.now() - startTime;
        
        return {
          data: new Blob([result], { type: 'text/plain' }),
          inputSize: file.size,
          outputSize: result.length,
          duration,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      setError(message);
      setProcessingState('error');
      return null;
    }
  }, [currentEngine, sendWorkerMessage]);
  
  /**
   * Clears the error state
   */
  const clearError = useCallback((): void => {
    setError(null);
    if (processingState === 'error') {
      setProcessingState('idle');
    }
  }, [processingState]);
  
  /**
   * Aborts current processing
   */
  const abort = useCallback((): void => {
    const worker = workerRef.current;
    
    if (worker) {
      // Send abort message
      if (currentRequestIdRef.current) {
        worker.postMessage({
          id: currentRequestIdRef.current,
          type: 'abort',
          payload: {},
        });
      }
      
      // Terminate worker
      worker.terminate();
      workerRef.current = null;
    }
    
    // Clear request queue
    for (const [_id, entry] of requestQueueRef.current) {
      entry.aborted = true;
      clearTimeout(entry.timeoutId);
      entry.reject(new Error('Operation aborted'));
    }
    requestQueueRef.current.clear();
    
    // Reset state
    setProcessingState('idle');
    setProgress(0);
    setEstimatedTimeRemaining(null);
    currentRequestIdRef.current = null;
  }, []);
  
  // Cleanup workers on unmount
  useEffect(() => {
    const worker = workerRef.current;
    return () => {
      if (worker) {
        worker.terminate();
      }
    };
  }, []);
  
  return {
    engines,
    currentEngine,
    processingState,
    error,
    loadPresetEngines,
    loadCustomEngine,
    selectEngine,
    unloadEngine,
    processText,
    processFile,
    progress,
    estimatedTimeRemaining,
    clearError,
    abort,
  };
}

export default useEngine;
