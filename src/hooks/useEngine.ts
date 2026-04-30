/**
 * StarBrickVII — useEngine Hook
 *
 * Manages WASM engine loading, selection, and processing.
 * - Loads ALL preset engines in parallel (main thread, no worker)
 * - Custom engine import with optimistic UI update
 * - Async chunked processing for large files
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

  const wasmCacheRef = useRef<Map<string, WasmInstance>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Resolve the correct base path for WASM files
   */
  const resolvePath = useCallback((path: string): string => {
    if (typeof window === 'undefined') return path;
    // Check if we're under a base path (GitHub Pages)
    const base = document.querySelector('base');
    if (base) {
      const href = base.getAttribute('href') || '';
      if (href !== '/' && !path.startsWith(href)) {
        return href.replace(/\/$/, '') + path;
      }
    }
    // Fallback: check if APP_BASE_PATH is in the URL
    if (window.location.pathname.startsWith(APP_BASE_PATH)) {
      return APP_BASE_PATH + path;
    }
    return path;
  }, []);

  /**
   * Load all preset engines in parallel
   */
  const loadPresetEngines = useCallback(async () => {
    setProcessingState('loading');
    setLoadProgress(0);
    setError(null);

    const results = await Promise.allSettled(
      PRESET_ENGINES.map(async (relPath, i) => {
        const url = resolvePath(relPath);
        const { engine, wasm } = await loadWasmEngine(url);
        setLoadProgress((i + 1) / PRESET_ENGINES.length);
        return { engine, wasm };
      })
    );

    const newEngines = new Map<string, Engine>();
    const newWasm = new Map<string, WasmInstance>();
    const list: Engine[] = [];
    const errors: string[] = [];

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const { engine, wasm } = r.value;
        newEngines.set(engine.id, engine);
        newWasm.set(engine.id, wasm);
        list.push(engine);
      } else {
        errors.push(`${PRESET_ENGINES[i]}: ${r.reason?.message || 'unknown error'}`);
      }
    });

    // Merge with any existing custom engines
    for (const [id, eng] of engines) {
      if (!newEngines.has(id)) {
        newEngines.set(id, eng);
        list.push(eng);
      }
    }
    for (const [id, wasm] of wasmCacheRef.current) {
      if (!newWasm.has(id)) newWasm.set(id, wasm);
    }

    setEngines(newEngines);
    setEngineList(list);
    wasmCacheRef.current = newWasm;

    if (list.length === 0) {
      setError(`Failed to load engines:\n${errors.join('\n')}`);
      setProcessingState('error');
    } else {
      if (errors.length > 0) {
        console.warn('Some engines failed to load:', errors);
      }
      if (!currentEngine || !newEngines.has(currentEngine.id)) {
        setCurrentEngine(list[0]);
      }
      setProcessingState('idle');
    }
  }, [resolvePath, engines, currentEngine]);

  /**
   * Import a custom WASM engine from a File object
   * Uses optimistic UI update — engine appears immediately
   */
  const importCustomEngine = useCallback(async (file: File) => {
    setError(null);

    // Optimistic: create a placeholder engine immediately
    const placeholderId = `custom_${Date.now()}`;
    const placeholder: Engine = {
      id: placeholderId,
      name: file.name.replace(/\.wasm$/i, ''),
      desc: 'Loading...',
      capabilities: { binarySafe: false, selfInverse: false, reversible: true, stateful: false },
    };

    // Optimistically add to list
    setEngines(prev => {
      const next = new Map(prev);
      next.set(placeholderId, placeholder);
      return next;
    });
    setEngineList(prev => [...prev, placeholder]);
    setCurrentEngine(placeholder);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { engine, wasm } = await loadWasmEngine(arrayBuffer);

      // Replace placeholder with real engine
      setEngines(prev => {
        const next = new Map(prev);
        next.delete(placeholderId);
        next.set(engine.id, engine);
        return next;
      });
      wasmCacheRef.current.set(engine.id, wasm);
      wasmCacheRef.current.delete(placeholderId);

      setEngineList(prev => {
        const idx = prev.findIndex(e => e.id === placeholderId);
        const next = [...prev];
        if (idx >= 0) next[idx] = engine;
        else next.push(engine);
        return next;
      });
      setCurrentEngine(engine);
    } catch (err) {
      // Rollback: remove placeholder
      const msg = err instanceof Error ? err.message : 'Failed to load custom engine';
      setError(msg);
      setEngines(prev => {
        const next = new Map(prev);
        next.delete(placeholderId);
        return next;
      });
      setEngineList(prev => prev.filter(e => e.id !== placeholderId));
      // Restore previous selection
      setCurrentEngine((_prev) => {
        const remaining = engineList.filter(e => e.id !== placeholderId);
        return remaining.length > 0 ? remaining[0] : null;
      });
    }
  }, [engineList]);

  /**
   * Select an engine by ID
   */
  const selectEngine = useCallback((id: string) => {
    const eng = engines.get(id) || engineList.find(e => e.id === id);
    if (eng) {
      setCurrentEngine(eng);
      setError(null);
    }
  }, [engines, engineList]);

  /**
   * Remove a custom engine by ID
   */
  const removeEngine = useCallback((id: string) => {
    if (engines.size <= 1) return; // Don't remove last engine
    setEngines(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setEngineList(prev => prev.filter(e => e.id !== id));
    wasmCacheRef.current.delete(id);
    if (currentEngine?.id === id) {
      const remaining = engineList.filter(e => e.id !== id);
      if (remaining.length > 0) setCurrentEngine(remaining[0]);
      else setCurrentEngine(null);
    }
  }, [engines, engineList, currentEngine]);

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
      setError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max: ${MAX_IN_MEMORY_SIZE / (1024 * 1024)} MB`);
      return null;
    }

    setProcessingState('processing');
    setProgress(0);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const startTime = Date.now();

    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const chunks: Uint8Array[] = [];
      const totalChunks = Math.max(1, Math.ceil(data.length / CHUNK_SIZE));

      for (let i = 0; i < totalChunks; i++) {
        if (controller.signal.aborted) throw new Error('Aborted');

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, data.length);
        const chunk = data.slice(start, end);

        // Yield to UI thread between chunks
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            const result = mode === 'encode'
              ? wasmEncodeBinary(wasm, chunk)
              : wasmDecodeBinary(wasm, chunk);
            chunks.push(result);
            const p = (i + 1) / totalChunks;
            setProgress(p);

            // ETA estimation
            const elapsed = Date.now() - startTime;
            if (p > 0.05) {
              setEta(Math.round((elapsed / p) * (1 - p)));
            }
            resolve();
          });
        });
      }

      // Merge chunks
      let totalLen = 0;
      for (const c of chunks) totalLen += c.length;
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.length; }

      const duration = Date.now() - startTime;
      setProgress(1);
      setProcessingState('complete');
      setEta(null);
      return {
        data: new Blob([merged.slice()], { type: 'application/octet-stream' }),
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
