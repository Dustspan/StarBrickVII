/**
 * useEngine Hook
 * 
 * Manages WASM engine loading, selection, and processing.
 * Loads ALL engines in parallel, switches between cached instances.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type Engine, type ProcessingMode, type ProcessingState, type ProcessingResult, MAX_IN_MEMORY_SIZE } from '@/lib/engine/types';
import { PRESET_ENGINES, APP_BASE_PATH } from '@/lib/engine/protocol';

interface WResponse {
  id: string;
  type: 'loaded' | 'progress' | 'result' | 'chunk_result' | 'error';
  payload?: { info?: Engine; result?: string; data?: ArrayBuffer; progress?: number };
  error?: string;
}

interface PendingReq {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const TIMEOUT = 30000;
const CHUNK = 1024 * 1024; // 1MB

export function useEngine() {
  const [engines, setEngines] = useState<Map<string, Engine>>(new Map());
  const [engineList, setEngineList] = useState<Engine[]>([]);
  const [currentEngine, setCurrentEngine] = useState<Engine | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingReq>>(new Map());
  const reqIdRef = useRef(0);
  const startTimeRef = useRef(0);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/engine.worker.ts', import.meta.url)
      );
      workerRef.current.onmessage = (e: MessageEvent<WResponse>) => {
        const { id, type, payload, error: errMsg } = e.data;
        const req = pendingRef.current.get(id);
        if (!req) return;

        if (type === 'progress' && payload?.progress !== undefined) {
          setLoadProgress(payload.progress);
          return;
        }

        if (type === 'error') {
          clearTimeout(req.timer);
          pendingRef.current.delete(id);
          req.reject(new Error(errMsg || 'Unknown error'));
          return;
        }

        if (type === 'loaded' && payload?.info) {
          clearTimeout(req.timer);
          pendingRef.current.delete(id);
          const info = payload.info as Engine;
          setEngines(prev => {
            const next = new Map(prev);
            next.set(info.id, info);
            return next;
          });
          req.resolve(info);
          return;
        }

        if (type === 'result' && payload?.result !== undefined) {
          clearTimeout(req.timer);
          pendingRef.current.delete(id);
          setProgress(1);
          setProcessingState('complete');
          setEta(null);
          req.resolve(payload.result);
          return;
        }

        if (type === 'chunk_result' && payload?.data) {
          clearTimeout(req.timer);
          pendingRef.current.delete(id);
          if (payload.progress) setProgress(payload.progress);
          req.resolve(payload.data);
          return;
        }
      };
    }
    return workerRef.current;
  }, []);

  const send = useCallback((type: string, payload: Record<string, unknown> = {}): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const worker = getWorker();
      const id = `req_${++reqIdRef.current}`;
      const timer = setTimeout(() => {
        pendingRef.current.delete(id);
        reject(new Error('Request timeout'));
      }, TIMEOUT);

      pendingRef.current.set(id, { resolve, reject, timer });
      worker.postMessage({ id, type, payload });
    });
  }, [getWorker]);

  // Load ALL engines in parallel
  const loadPresetEngines = useCallback(async () => {
    setProcessingState('loading');
    setError(null);
    setLoadProgress(0);

    const isDev = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.port === '3000');
    const bp = isDev ? '' : APP_BASE_PATH;

    try {
      const results = await Promise.allSettled(
        PRESET_ENGINES.map(path => send('load', { wasmUrl: `${bp}${path}` }))
      );

      const loaded: Engine[] = [];
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) loaded.push(r.value as Engine);
      });

      setEngineList(loaded);
      if (loaded.length > 0) {
        // Auto-select first engine
        const first = loaded[0];
        setCurrentEngine(first);
        // Tell worker to switch
        send('switch', { engineId: first.id }).catch(() => {});
      }

      if (loaded.length === 0) {
        setError('Failed to load any engine');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setProcessingState('idle');
      setLoadProgress(1);
    }
  }, [send]);

  const selectEngine = useCallback((id: string) => {
    const engine = engines.get(id);
    if (!engine) return;
    setCurrentEngine(engine);
    setError(null);
    send('switch', { engineId: id }).catch(() => {});
  }, [engines, send]);

  const processText = useCallback(async (text: string, mode: ProcessingMode): Promise<string | null> => {
    if (!currentEngine) { setError('No engine selected'); return null; }
    setProcessingState('processing');
    setError(null);
    setProgress(0);
    startTimeRef.current = Date.now();

    try {
      const result = await send(mode, { text }) as string;
      setProcessingState('complete');
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Processing failed';
      setError(msg);
      setProcessingState('error');
      return null;
    }
  }, [currentEngine, send]);

  const processFile = useCallback(async (file: File, mode: ProcessingMode): Promise<ProcessingResult | null> => {
    if (!currentEngine) { setError('No engine selected'); return null; }
    if (file.size > MAX_IN_MEMORY_SIZE) { setError(`File too large (max ${MAX_IN_MEMORY_SIZE / 1024 / 1024}MB)`); return null; }

    setProcessingState('processing');
    setError(null);
    setProgress(0);
    startTimeRef.current = Date.now();

    try {
      const buffer = await file.arrayBuffer();
      const chunks: Uint8Array[] = [];
      const totalChunks = Math.max(1, Math.ceil(buffer.byteLength / CHUNK));

      if (buffer.byteLength <= CHUNK) {
        // Single chunk
        const resultBuf = await send(mode, { data: buffer, chunkIndex: 0, totalChunks: 1 }) as ArrayBuffer;
        chunks.push(new Uint8Array(resultBuf));
        setProgress(1);
      } else {
        // Multi-chunk
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK;
          const end = Math.min(start + CHUNK, buffer.byteLength);
          const slice = buffer.slice(start, end);
          const resultBuf = await send(mode, { data: slice, chunkIndex: i, totalChunks }) as ArrayBuffer;
          chunks.push(new Uint8Array(resultBuf));
          setProgress((i + 1) / totalChunks);
        }
      }

      const totalLen = chunks.reduce((s, c) => s + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.length; }

      const duration = Date.now() - startTimeRef.current;
      const result: ProcessingResult = {
        data: new Blob([merged], { type: 'application/octet-stream' }),
        inputSize: file.size,
        outputSize: totalLen,
        duration,
      };

      setProcessingState('complete');
      setEta(null);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Processing failed';
      setError(msg);
      setProcessingState('error');
      return null;
    }
  }, [currentEngine, send]);

  const abort = useCallback(() => {
    const worker = workerRef.current;
    if (worker) {
      worker.terminate();
      workerRef.current = null;
    }
    for (const [, req] of pendingRef.current) {
      clearTimeout(req.timer);
      req.reject(new Error('Aborted'));
    }
    pendingRef.current.clear();
    setProcessingState('idle');
    setProgress(0);
    setEta(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    if (processingState === 'error') setProcessingState('idle');
  }, [processingState]);

  useEffect(() => {
    return () => { workerRef.current?.terminate(); };
  }, []);

  return {
    engines, engineList, currentEngine,
    processingState, error, progress, eta, loadProgress,
    loadPresetEngines, selectEngine,
    processText, processFile,
    abort, clearError,
  };
}

export default useEngine;
