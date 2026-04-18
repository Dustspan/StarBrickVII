/**
 * useEngine Hook
 * 
 * Manages WASM engine loading, selection, and operations.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  type Engine,
  type EngineInfo,
  type ProcessingMode,
  type ProcessingState,
  type ProcessingResult,
  DEFAULT_CHUNK_SIZE,
} from '@/lib/engine/types';
import { PRESET_ENGINES as PRESET_PATHS } from '@/lib/engine/protocol';

interface UseEngineReturn {
  // Engine state
  engines: Map<string, Engine>;
  currentEngine: Engine | null;
  processingState: ProcessingState;
  error: string | null;
  
  // Engine operations
  loadPresetEngines: () => Promise<void>;
  loadCustomEngine: (url: string | File) => Promise<EngineInfo | null>;
  selectEngine: (id: string) => void;
  unloadEngine: (id: string) => void;
  
  // Processing operations
  processText: (text: string, mode: ProcessingMode) => Promise<ProcessingResult | null>;
  processFile: (file: File, mode: ProcessingMode) => Promise<ProcessingResult | null>;
  
  // Progress
  progress: number;
  estimatedTimeRemaining: number | null;
  
  // Utilities
  clearError: () => void;
}

interface WorkerRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  chunks: ArrayBuffer[];
  startTime: number;
  inputSize: number;
}

export function useEngine(): UseEngineReturn {
  const [engines, setEngines] = useState<Map<string, Engine>>(new Map());
  const [currentEngine, setCurrentEngine] = useState<Engine | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  
  const nextRequestId = useRef(0);
  const pendingRequests = useRef<Map<number, WorkerRequest>>(new Map());
  const workersRef = useRef<Map<string, Worker>>(new Map());
  
  /**
   * Creates a worker for an engine
   */
  const createWorker = useCallback((engineId: string): Worker => {
    const worker = new Worker(
      new URL('../workers/engine.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    worker.onmessage = (event) => {
      const { id, type, payload, error: err } = event.data;
      const request = pendingRequests.current.get(id);
      
      if (!request) return;
      
      if (type === 'error') {
        request.reject(new Error(err || 'Unknown error'));
        pendingRequests.current.delete(id);
        return;
      }
      
      if (type === 'chunk' && payload) {
        request.chunks.push(payload);
      }
      
      if (type === 'progress' && payload) {
        const elapsed = Date.now() - request.startTime;
        const progressValue = payload.current / payload.total;
        setProgress(progressValue);
        
        if (progressValue > 0) {
          const remaining = Math.round(elapsed / progressValue - elapsed);
          setEstimatedTimeRemaining(remaining);
        }
      }
      
      if (type === 'result') {
        // Combine all chunks
        const totalSize = request.chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of request.chunks) {
          result.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        
        const duration = Date.now() - request.startTime;
        const blob = new Blob([result]);
        
        request.resolve({
          data: blob,
          inputSize: request.inputSize,
          outputSize: blob.size,
          duration,
        });
        
        pendingRequests.current.delete(id);
      }
    };
    
    worker.onerror = (event) => {
      console.error('Worker error:', event);
    };
    
    workersRef.current.set(engineId, worker);
    return worker;
  }, []);
  
  /**
   * Sends a message to a worker and waits for response
   */
  const sendWorkerMessage = useCallback(<T = unknown>(
    engineId: string,
    type: 'load' | 'encode' | 'decode' | 'validate',
    payload: unknown,
    inputSize = 0
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      let worker = workersRef.current.get(engineId);
      
      if (!worker && type === 'load') {
        worker = createWorker(engineId);
      }
      
      if (!worker) {
        reject(new Error('Worker not found'));
        return;
      }
      
      const id = nextRequestId.current++;
      
      pendingRequests.current.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        chunks: [],
        startTime: Date.now(),
        inputSize,
      });
      
      worker.postMessage({ id, type, payload }, 
        type === 'encode' || type === 'decode' 
          ? [(payload as { chunk: ArrayBuffer }).chunk] 
          : []
      );
    });
  }, [createWorker]);
  
  /**
   * Loads preset engines
   */
  const loadPresetEngines = useCallback(async (): Promise<void> => {
    setProcessingState('loading');
    setError(null);
    
    const newEngines = new Map(engines);
    
    for (const path of PRESET_PATHS) {
      try {
        const info = await sendWorkerMessage<EngineInfo & { warnings?: string[] }>(
          path,
          'load',
          { wasmUrl: path }
        );
        
        const engine: Engine = {
          ...info,
          isPreset: true,
          worker: workersRef.current.get(path)!,
        };
        
        newEngines.set(engine.id, engine);
      } catch (err) {
        console.error(`Failed to load preset engine ${path}:`, err);
      }
    }
    
    setEngines(newEngines);
    setProcessingState('idle');
  }, [engines, sendWorkerMessage]);
  
  /**
   * Loads a custom engine from URL or File
   */
  const loadCustomEngine = useCallback(async (
    urlOrFile: string | File
  ): Promise<EngineInfo | null> => {
    setProcessingState('loading');
    setError(null);
    
    try {
      let wasmUrl: string;
      let cleanup: (() => void) | null = null;
      
      if (typeof urlOrFile === 'string') {
        wasmUrl = urlOrFile;
      } else {
        wasmUrl = URL.createObjectURL(urlOrFile);
        cleanup = () => URL.revokeObjectURL(wasmUrl);
      }
      
      const engineId = `custom-${Date.now()}`;
      const info = await sendWorkerMessage<EngineInfo>(
        engineId,
        'load',
        { wasmUrl }
      );
      
      const engine: Engine = {
        ...info,
        isPreset: false,
        worker: workersRef.current.get(engineId)!,
      };
      
      setEngines((prev) => {
        const newMap = new Map(prev);
        newMap.set(engine.id, engine);
        return newMap;
      });
      
      cleanup?.();
      setProcessingState('idle');
      
      return info;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load engine';
      setError(message);
      setProcessingState('error');
      return null;
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
    const worker = workersRef.current.get(id);
    if (worker) {
      worker.terminate();
      workersRef.current.delete(id);
    }
    
    setEngines((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
    
    if (currentEngine?.id === id) {
      setCurrentEngine(null);
    }
  }, [currentEngine]);
  
  /**
   * Processes text input
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
    setProgress(0);
    setEstimatedTimeRemaining(null);
    setError(null);
    
    try {
      const input = new TextEncoder().encode(text);
      const result = await sendWorkerMessage<ProcessingResult>(
        currentEngine.id,
        mode,
        { chunk: input.buffer, isLast: true },
        input.length
      );
      
      setProcessingState('complete');
      setProgress(1);
      
      return result;
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
    
    setProcessingState('processing');
    setProgress(0);
    setEstimatedTimeRemaining(null);
    setError(null);
    
    try {
      const totalChunks = Math.ceil(file.size / DEFAULT_CHUNK_SIZE);
      const resultChunks: ArrayBuffer[] = [];
      const startTime = Date.now();
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * DEFAULT_CHUNK_SIZE;
        const end = Math.min(start + DEFAULT_CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const buffer = await chunk.arrayBuffer();
        
        const result = await sendWorkerMessage<ArrayBuffer>(
          currentEngine.id,
          mode,
          {
            chunk: buffer,
            isLast: i === totalChunks - 1,
            totalChunks,
            chunkIndex: i,
          },
          file.size
        );
        
        if (result) {
          resultChunks.push(result);
        }
        
        setProgress((i + 1) / totalChunks);
      }
      
      // Combine results
      const totalSize = resultChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      const output = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of resultChunks) {
        output.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      
      const duration = Date.now() - startTime;
      const blob = new Blob([output]);
      
      setProcessingState('complete');
      
      return {
        data: blob,
        inputSize: file.size,
        outputSize: blob.size,
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
   * Clears the error state
   */
  const clearError = useCallback((): void => {
    setError(null);
    if (processingState === 'error') {
      setProcessingState('idle');
    }
  }, [processingState]);
  
  // Cleanup workers on unmount
  useEffect(() => {
    const workers = workersRef.current;
    return () => {
      workers.forEach((worker) => worker.terminate());
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
  };
}
