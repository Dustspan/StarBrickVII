/**
 * useEngine Hook
 * 
 * Manages WASM engine loading, selection, and operations.
 * Connects to real WASM engines from public/engines directory.
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
  MAX_IN_MEMORY_SIZE,
} from '@/lib/engine/types';
import { PRESET_ENGINES } from '@/lib/engine/protocol';

// Worker message types
interface WorkerRequest {
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
  clearError: () => void;
}

/**
 * Creates a new Worker for engine operations
 */
function createEngineWorker(): Worker {
  return new Worker(
    new URL('../workers/engine.worker.ts', import.meta.url),
    { type: 'module' }
  );
}

/**
 * useEngine Hook
 */
export function useEngine(): UseEngineReturn {
  // State
  const [engines, setEngines] = useState<Map<string, Engine>>(new Map());
  const [currentEngine, setCurrentEngine] = useState<Engine | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  
  // Refs
  const workersRef = useRef<Map<string, Worker>>(new Map());
  const pendingRequestsRef = useRef<Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>>(new Map());
  
  /**
   * Sends a message to a worker and waits for response
   */
  const sendWorkerMessage = useCallback(async <T = unknown>(
    engineId: string,
    type: 'load' | 'encode' | 'decode',
    payload: WorkerRequest['payload'],
    onProgress?: (progress: number) => void
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      let worker = workersRef.current.get(engineId);
      
      if (!worker) {
        worker = createEngineWorker();
        workersRef.current.set(engineId, worker);
      }
      
      const requestId = `${engineId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // Set 30 second timeout
      const timeout = setTimeout(() => {
        pendingRequestsRef.current.delete(requestId);
        reject(new Error('Operation timed out'));
      }, 30000);
      
      pendingRequestsRef.current.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });
      
      const handleMessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        
        if (response.id !== requestId) return;
        
        if (response.type === 'progress' && onProgress) {
          onProgress(response.payload?.progress || 0);
          return;
        }
        
        worker!.removeEventListener('message', handleMessage);
        clearTimeout(timeout);
        pendingRequestsRef.current.delete(requestId);
        
        if (response.type === 'error') {
          reject(new Error(response.error || 'Unknown error'));
        } else {
          resolve(response.payload as T);
        }
      };
      
      worker.addEventListener('message', handleMessage);
      
      const message: WorkerRequest = {
        id: requestId,
        type,
        payload,
      };
      
      worker.postMessage(message);
    });
  }, []);
  
  /**
   * Loads all preset engines from public/engines
   */
  const loadPresetEngines = useCallback(async (): Promise<void> => {
    setProcessingState('loading');
    setError(null);
    
    const newEngines = new Map<string, Engine>();
    
    try {
      for (const wasmPath of PRESET_ENGINES) {
        try {
          const engineId = wasmPath.split('/').pop()?.replace('.wasm', '') || 'unknown';
          
          // Create a worker for this engine
          const worker = createEngineWorker();
          workersRef.current.set(engineId, worker);
          
          // Load the engine
          const result = await sendWorkerMessage<{ info: EngineInfo }>(
            engineId,
            'load',
            { wasmUrl: wasmPath }
          );
          
          const engine: Engine = {
            ...result.info,
            isPreset: true,
            worker,
          };
          
          newEngines.set(engineId, engine);
        } catch (err) {
          console.error(`Failed to load engine ${wasmPath}:`, err);
        }
      }
      
      setEngines(newEngines);
      setProcessingState('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load engines';
      setError(message);
      setProcessingState('error');
    }
  }, [sendWorkerMessage]);
  
  /**
   * Loads a custom engine from URL or File
   */
  const loadCustomEngine = useCallback(async (source: string | File): Promise<EngineInfo | null> => {
    setProcessingState('loading');
    setError(null);
    
    try {
      const engineId = `custom-${Date.now()}`;
      const wasmUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
      
      // Create a worker for this engine
      const worker = createEngineWorker();
      workersRef.current.set(engineId, worker);
      
      const result = await sendWorkerMessage<{ info: EngineInfo }>(
        engineId,
        'load',
        { wasmUrl }
      );
      
      const engine: Engine = {
        ...result.info,
        isPreset: false,
        worker,
      };
      
      setEngines((prev) => {
        const newEngines = new Map(prev);
        newEngines.set(engineId, engine);
        return newEngines;
      });
      
      setProcessingState('idle');
      return result.info;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load custom engine';
      setError(message);
      setProcessingState('error');
      return null;
    }
  }, [sendWorkerMessage]);
  
  /**
   * Selects an engine by ID
   */
  const selectEngine = useCallback((id: string): void => {
    const engine = engines.get(id);
    if (engine) {
      setCurrentEngine(engine);
      setError(null);
    }
  }, [engines]);
  
  /**
   * Unloads an engine by ID
   */
  const unloadEngine = useCallback((id: string): void => {
    const worker = workersRef.current.get(id);
    if (worker) {
      worker.terminate();
      workersRef.current.delete(id);
    }
    
    setEngines((prev) => {
      const newEngines = new Map(prev);
      newEngines.delete(id);
      return newEngines;
    });
    
    if (currentEngine?.id === id) {
      setCurrentEngine(null);
    }
  }, [currentEngine]);
  
  /**
   * Processes text using the current engine
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
    setError(null);
    
    const startTime = Date.now();
    
    try {
      const result = await sendWorkerMessage<{ result: string }>(
        currentEngine.id,
        mode,
        { text },
        (p) => setProgress(p)
      );
      
      const duration = Date.now() - startTime;
      
      setProcessingState('complete');
      setProgress(1);
      
      return {
        data: new Blob([result.result], { type: 'text/plain' }),
        inputSize: new TextEncoder().encode(text).length,
        outputSize: result.result.length,
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
   * Processes a file using the current engine
   */
  const processFile = useCallback(async (
    file: File,
    mode: ProcessingMode
  ): Promise<ProcessingResult | null> => {
    if (!currentEngine) {
      setError('No engine selected');
      return null;
    }
    
    if (file.size > MAX_IN_MEMORY_SIZE) {
      setError(`File too large. Maximum size is ${MAX_IN_MEMORY_SIZE / 1024 / 1024}MB`);
      return null;
    }
    
    setProcessingState('processing');
    setProgress(0);
    setError(null);
    
    const startTime = Date.now();
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const totalChunks = Math.ceil(arrayBuffer.byteLength / DEFAULT_CHUNK_SIZE);
      
      let result = '';
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * DEFAULT_CHUNK_SIZE;
        const end = Math.min(start + DEFAULT_CHUNK_SIZE, arrayBuffer.byteLength);
        const chunk = arrayBuffer.slice(start, end);
        
        const chunkResult = await sendWorkerMessage<{ result: string }>(
          currentEngine.id,
          mode,
          {
            chunk,
            totalSize: arrayBuffer.byteLength,
            chunkIndex: i,
            totalChunks,
            isLast: i === totalChunks - 1,
          },
          (p) => setProgress((i + p) / totalChunks)
        );
        
        result += chunkResult.result;
      }
      
      const duration = Date.now() - startTime;
      
      setProcessingState('complete');
      setProgress(1);
      
      return {
        data: new Blob([result], { type: 'text/plain' }),
        inputSize: file.size,
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

export default useEngine;
