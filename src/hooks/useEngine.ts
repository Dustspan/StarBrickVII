/**
 * StarBrickVII — useEngine Hook
 * 
 * Manages WASM engine loading, selection, and processing.
 * Loads ALL engines in parallel in the MAIN THREAD (no worker for loading).
 * Uses async chunked processing for large files to keep UI responsive.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import {
  type Engine, type WasmInstance, type ProcessingMode,
  type ProcessingState, type ProcessingResult,
  MAX_IN_MEMORY_SIZE, CHUNK_SIZE,
} from '@/lib/engine/types';
import { PRESET_ENGINES, APP_BASE_PATH } from '@/lib/engine/protocol';
import {
  loadWasmEngine, wasmEncode, wasmDecode,
  wasmEncodeBinary, wasmDecodeBinary,
} from '@/lib/engine/loader';

export function useEngine() {
  const [engines, setEngines] = useState<Map<string, Engine>>(new Map());
  const [engineList, setEngineList] = useState<Engine[]>([]);
  const [currentEngine, setCurrentEngine] = useState<Engine | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);

  // WASM instance cache (keyed by engine id)
  const wasmCacheRef = useRef<Map<string, WasmInstance>>(new Map());
  // Abort controller for cancelling processing
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Resolve the correct base path for WASM files
   */
  const getBasePath = useCallback((): string => {
    if (typeof window === 'undefined') return '';
    const { hostname, port, pathname } = window.location;
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1' || port === '3000';
    if (isDev) return '';
    // For GitHub Pages: detect basePath from pathname
    // e.g. /StarBrickVII/ → basePath = /StarBrickVII
    if (pathname.startsWith(APP_BASE_PATH)) return APP_BASE_PATH;
    return '';
  }, []);

  /**
   * Load all preset engines in parallel
   */
  const loadPresetEngines = useCallback(async () => {
    setProcessingState('loading');
    setError(null);
    setLoadProgress(0);

    const basePath = getBasePath();
    const total = PRESET_ENGINES.length;
    let loaded = 0;

    const results = await Promise.allSettled(
      PRESET_ENGINES.map(async (path) => {
        const url = `${basePath}${path}`;
        const { engine, wasm } = await loadWasmEngine(url);
        wasmCacheRef.current.set(engine.id, wasm);
        loaded++;
        setLoadProgress(Math.round((loaded / total) * 100));
        return engine;
      })
    );

    const succeeded: Engine[] = [];
    const errors: string[] = [];

    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        succeeded.push(r.value);
      } else {
        const reason = r.status === 'rejected' ? r.reason : 'Unknown error';
        errors.push(`${PRESET_ENGINES[i]}: ${reason instanceof Error ? reason.message : reason}`);
      }
    });

    if (succeeded.length > 0) {
      const map = new Map<string, Engine>();
      succeeded.forEach(e => map.set(e.id, e));
      setEngines(map);
      setEngineList(succeeded);
      setCurrentEngine(succeeded[0]);
      setProcessingState('idle');
    } else {
      setError(errors.join('\n') || 'Failed to load any engine');
      setProcessingState('error');
    }
  }, [getBasePath]);

  /**
   * Import a custom WASM engine from a File
   */
  const importCustomEngine = useCallback(async (file: File) => {
    setProcessingState('loading');
    setError(null);

    try {
      const url = URL.createObjectURL(file);
      const { engine, wasm } = await loadWasmEngine(url);
      URL.revokeObjectURL(url);

      wasmCacheRef.current.set(engine.id, wasm);
      setEngines(prev => {
        const next = new Map(prev);
        next.set(engine.id, engine);
        return next;
      });
      setEngineList(prev => {
        // Avoid duplicates
        if (prev.some(e => e.id === engine.id)) return prev;
        return [...prev, engine];
      });
      setCurrentEngine(engine);
      setProcessingState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load custom engine');
      setProcessingState('error');
    }
  }, []);

  /**
   * Select an engine by id
   */
  const selectEngine = useCallback((id: string) => {
    const engine = engines.get(id);
    if (engine) {
      setCurrentEngine(engine);
      setError(null);
    }
  }, [engines]);

  /**
   * Remove an engine by id
   */
  const removeEngine = useCallback((id: string) => {
    wasmCacheRef.current.delete(id);
    setEngines(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setEngineList(prev => prev.filter(e => e.id !== id));
    if (currentEngine?.id === id) {
      setCurrentEngine(null);
    }
  }, [currentEngine]);

  /**
   * Process text input
   */
  const processText = useCallback(async (text: string, mode: ProcessingMode): Promise<string | null> => {
    if (!currentEngine) { setError('No engine selected'); return null; }
    const wasm = wasmCacheRef.current.get(currentEngine.id);
    if (!wasm) { setError('Engine not loaded'); return null; }

    setProcessingState('processing');
    setProgress(0);
    setError(null);

    try {
      const result = mode === 'encode' ? wasmEncode(wasm, text) : wasmDecode(wasm, text);
      setProgress(1);
      setProcessingState('complete');
      setEta(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      setProcessingState('error');
      return null;
    }
  }, [currentEngine]);

  /**
   * Process a file with chunked async processing (keeps UI responsive)
   */
  const processFile = useCallback(async (file: File, mode: ProcessingMode): Promise<ProcessingResult | null> => {
    if (!currentEngine) { setError('No engine selected'); return null; }
    const wasm = wasmCacheRef.current.get(currentEngine.id);
    if (!wasm) { setError('Engine not loaded'); return null; }

    if (file.size > MAX_IN_MEMORY_SIZE) {
      setError(`File too large (max ${MAX_IN_MEMORY_SIZE / 1024 / 1024}MB)`);
      return null;
    }

    setProcessingState('processing');
    setProgress(0);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const startTime = Date.now();
    const processFn = mode === 'encode' ? wasmEncodeBinary : wasmDecodeBinary;

    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);

      // For small files, process synchronously
      if (data.length <= CHUNK_SIZE) {
        if (controller.signal.aborted) throw new Error('Aborted');
        const result = processFn(wasm, data);
        const duration = Date.now() - startTime;
        setProgress(1);
        setProcessingState('complete');
        setEta(null);
        return {
          data: new Blob([result.slice()], { type: 'application/octet-stream' }),
          inputSize: file.size,
          outputSize: result.length,
          duration,
        };
      }

      // For large files, process in chunks with UI yields
      const chunks: Uint8Array[] = [];
      const totalChunks = Math.ceil(data.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        if (controller.signal.aborted) throw new Error('Aborted');

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, data.length);
        const chunk = data.slice(start, end);
        const result = processFn(wasm, chunk);
        chunks.push(result);

        const pct = (i + 1) / totalChunks;
        setProgress(pct);

        // Estimate remaining time
        const elapsed = Date.now() - startTime;
        const remaining = elapsed / pct - elapsed;
        setEta(Math.round(remaining));

        // Yield to UI thread every chunk
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      // Merge chunks
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.length; }

      const duration = Date.now() - startTime;
      setProcessingState('complete');
      setEta(null);
      return {
        data: new Blob([merged], { type: 'application/octet-stream' }),
        inputSize: file.size,
        outputSize: totalLen,
        duration,
      };
    } catch (err) {
      if (err instanceof Error && err.message === 'Aborted') {
        setProcessingState('idle');
        setProgress(0);
        setEta(null);
        return null;
      }
      setError(err instanceof Error ? err.message : 'Processing failed');
      setProcessingState('error');
      return null;
    } finally {
      abortRef.current = null;
    }
  }, [currentEngine]);

  /**
   * Abort current processing
   */
  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setProcessingState('idle');
    setProgress(0);
    setEta(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    if (processingState === 'error') setProcessingState('idle');
  }, [processingState]);

  return {
    engines, engineList, currentEngine,
    processingState, error, progress, eta, loadProgress,
    loadPresetEngines, importCustomEngine,
    selectEngine, removeEngine,
    processText, processFile,
    abort, clearError,
  };
}

export default useEngine;
