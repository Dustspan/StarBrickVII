/**
 * StarBrickVII — Main Page
 * 
 * Futuristic telephone-dial encoding/decoding workstation.
 * Supports custom WASM engine import with auto-adaptive UI.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useEngine } from '@/hooks/useEngine';
import { type ProcessingMode, type ProcessingResult } from '@/lib/engine/types';
import { formatFileSize, formatDuration, downloadBlob, copyToClipboard, hexDump } from '@/lib/utils';
import S from './page.module.css';

export default function HomePage() {
  const {
    engineList, currentEngine,
    processingState, error, progress, loadProgress,
    loadPresetEngines, importCustomEngine,
    selectEngine,
    processText, processFile,
    abort,
  } = useEngine();

  const [mode, setMode] = useState<ProcessingMode>('encode');
  const [inputText, setInputText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [resultText, setResultText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHex, setShowHex] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasmInputRef = useRef<HTMLInputElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartAngle = useRef(0);
  const dragStartRotation = useRef(0);
  const currentIndex = engineList.length > 0 ? engineList.findIndex(e => e.id === currentEngine?.id) : -1;

  // Load engines on mount
  useEffect(() => { loadPresetEngines(); }, [loadPresetEngines]);

  // Keyboard: arrow keys to rotate dial
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (engineList.length === 0) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = currentIndex <= 0 ? engineList.length - 1 : currentIndex - 1;
        selectEngine(engineList[next].id);
        setRotation(-(next * (360 / engineList.length)));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = currentIndex >= engineList.length - 1 ? 0 : currentIndex + 1;
        selectEngine(engineList[next].id);
        setRotation(-(next * (360 / engineList.length)));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [engineList, currentIndex, selectEngine]);

  const sectorAngle = engineList.length > 0 ? 360 / engineList.length : 360;

  // Dial drag handlers
  const getAngle = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = dialRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }, []);

  const onDialDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (engineList.length === 0) return;
    setDragging(true);
    dragStartAngle.current = getAngle(e);
    dragStartRotation.current = rotation;
  }, [engineList.length, getAngle, rotation]);

  const onDialMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging) return;
    const angle = getAngle(e);
    const delta = angle - dragStartAngle.current;
    setRotation(dragStartRotation.current + delta);
  }, [dragging, getAngle]);

  const onDialUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    // Snap to nearest sector
    const n = engineList.length;
    if (n === 0) return;
    const normalized = ((rotation % 360) + 360) % 360;
    const sectorIdx = Math.round(normalized / sectorAngle) % n;
    const targetAngle = -(sectorIdx * sectorAngle);
    setRotation(targetAngle);
    selectEngine(engineList[sectorIdx].id);
  }, [dragging, rotation, sectorAngle, engineList, selectEngine]);

  const canProcess = currentEngine && (inputText.trim().length > 0 || file) && processingState !== 'processing';
  const isProcessing = processingState === 'processing';

  // Process handler
  const handleProcess = useCallback(async () => {
    setResult(null);
    setResultText('');

    if (file) {
      const r = await processFile(file, mode);
      if (r) {
        setResult(r);
        const text = await r.data.text();
        setResultText(text);
      }
    } else if (inputText.trim()) {
      const r = await processText(inputText, mode);
      if (r) setResultText(r);
    }
  }, [file, inputText, mode, processFile, processText]);

  // File handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setInputText(''); }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setInputText(''); }
  }, []);

  const handleWasmImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await importCustomEngine(f);
    e.target.value = '';
  }, [importCustomEngine]);

  const handleCopy = useCallback(async () => {
    if (!resultText) return;
    await copyToClipboard(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [resultText]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const ext = mode === 'encode' ? 'encoded' : 'decoded';
    downloadBlob(result.data, `output.${ext}`);
  }, [result, mode]);

  const hexPreview = resultText
    ? hexDump(new TextEncoder().encode(resultText).slice(0, 512))
    : '';

  // Dial gradient — auto-adapts to engine count
  const dialGradient = engineList.length > 0
    ? `conic-gradient(from 0deg, ${engineList.map((_, i) => {
        const a1 = i * sectorAngle;
        const a2 = (i + 1) * sectorAngle;
        const isSel = i === currentIndex;
        return `hsl(${a1}, 15%, ${isSel ? '22%' : '14%'}) ${a1}deg, hsl(${a2}, 15%, ${isSel ? '18%' : '12%'}) ${a2}deg`;
      }).join(', ')})`
    : 'conic-gradient(from 0deg, #111 0deg, #18181b 360deg)';

  return (
    <div className={S.root}>
      <div className={S.scanlines} />
      <div className={S.grid} />

      {/* Header */}
      <header className={S.header}>
        <div className={S.logo}>
          <span className={S.logoStar}>✦</span>
          <span className={S.logoText}>STAR</span>
          <span className={S.logoVII}>BRICK</span>
          <span className={S.logoText}>VII</span>
        </div>
        <div className={S.headerRight}>
          <span className={S.engineBadge}>
            <span className={S.badgeDot} />
            {engineList.length} ENGINE{engineList.length !== 1 ? 'S' : ''}
          </span>
          <button className={S.iconBtn} onClick={() => wasmInputRef.current?.click()} title="Import WASM engine">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <input ref={wasmInputRef} type="file" accept=".wasm" className={S.hidden} onChange={handleWasmImport} />
        </div>
      </header>

      {/* Loading overlay */}
      {processingState === 'loading' && (
        <div className={S.loadingOverlay}>
          <div className={S.loadingSpinner} />
          <div className={S.loadingText}>INITIALIZING ENGINES</div>
          <div className={S.loadingBar}>
            <div className={S.loadingFill} style={{ width: `${loadProgress}%` }} />
          </div>
          <div className={S.loadingPct}>{loadProgress}%</div>
        </div>
      )}

      {/* Main content */}
      <main className={S.main}>
        {/* Input panel */}
        <section className={S.panel}>
          <div className={S.panelLabel}>
            <span>INPUT</span>
            <div className={S.panelActions}>
              {file && (
                <button className={S.iconBtn} onClick={() => { setFile(null); setResultText(''); setResult(null); }} title="Remove file">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className={S.inputArea}>
            <textarea
              className={S.textarea}
              value={file ? `[File] ${file.name} (${formatFileSize(file.size)})` : inputText}
              onChange={e => { if (!file) setInputText(e.target.value); }}
              placeholder={file ? '' : 'Type or paste text to process...'}
              readOnly={isProcessing}
            />
            <div
              className={`${S.dropZone} ${isDragging ? S.dropActive : ''}`}
              onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={S.dropContent}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Drop file here or click to browse</span>
              </div>
            </div>
            <input ref={fileInputRef} type="file" className={S.hidden} onChange={handleFileChange} />
          </div>
        </section>

        {/* Center: Dial + Controls */}
        <section className={S.center}>
          {/* Mode toggle */}
          <div className={S.modeToggle}>
            <button
              className={`${S.modeBtn} ${mode === 'encode' ? S.modeActive : ''}`}
              onClick={() => setMode('encode')}
              disabled={isProcessing}
            >ENCODE</button>
            <div className={S.modeTrack}>
              <div className={S.modeSlider} style={{ transform: mode === 'decode' ? 'translateX(100%)' : 'translateX(0)' }} />
            </div>
            <button
              className={`${S.modeBtn} ${mode === 'decode' ? S.modeActive : ''}`}
              onClick={() => setMode('decode')}
              disabled={isProcessing}
            >DECODE</button>
          </div>

          {/* Rotary dial */}
          <div
            ref={dialRef}
            className={S.dialWrap}
            onMouseDown={onDialDown}
            onMouseMove={onDialMove}
            onMouseUp={onDialUp}
            onMouseLeave={onDialUp}
            onTouchStart={onDialDown}
            onTouchMove={onDialMove}
            onTouchEnd={onDialUp}
            tabIndex={0}
            role="listbox"
            aria-label="Engine selector dial"
          >
            <div
              className={S.dial}
              style={{
                transform: `rotate(${rotation}deg)`,
                background: dialGradient,
                boxShadow: dragging ? '0 0 30px rgba(249,115,22,0.4)' : undefined,
              }}
            >
              {engineList.map((engine, i) => {
                const angle = i * sectorAngle + sectorAngle / 2;
                const isSel = i === currentIndex;
                return (
                  <div
                    key={engine.id}
                    className={`${S.engineLabel} ${isSel ? S.engineLabelActive : ''}`}
                    style={{ transform: `rotate(${angle}deg) translateY(-${isSel ? 108 : 104}px)` }}
                  >
                    {engine.name}
                  </div>
                );
              })}
            </div>
            <div className={S.dialHub}>
              <span className={S.dialHubText}>
                {currentEngine ? currentEngine.name : '—'}
              </span>
            </div>
          </div>

          {/* Call / Hang buttons */}
          <div className={S.actionRow}>
            <button
              className={S.callBtn}
              onClick={handleProcess}
              disabled={!canProcess}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
              <span>CALL</span>
            </button>
            <button
              className={S.hangBtn}
              onClick={abort}
              disabled={!isProcessing}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              <span>HANG UP</span>
            </button>
          </div>

          {/* Progress bar */}
          {isProcessing && (
            <div className={S.progressBar}>
              <div className={S.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </section>

        {/* Output panel */}
        <section className={S.panel}>
          <div className={S.panelLabel}>
            <span>OUTPUT</span>
            <div className={S.panelActions}>
              {resultText && (
                <>
                  <button className={S.iconBtn} onClick={() => setShowHex(h => !h)} title={showHex ? 'Text view' : 'Hex view'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showHex
                        ? <><path d="M4 6h16M4 12h16M4 18h10" /><path d="M16 12h4" /></>
                        : <><polyline points="16 18 8 12 16 6" /><polyline points="8 6 16 12 8 18" /></>
                      }
                    </svg>
                  </button>
                  <button className={S.iconBtn} onClick={handleCopy} title="Copy">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {copied
                        ? <polyline points="20 6 9 17 4 12" />
                        : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>
                      }
                    </svg>
                  </button>
                  <button className={S.iconBtn} onClick={handleDownload} title="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className={S.outputArea}>
            {error && (
              <div className={S.errorMsg}>{error}</div>
            )}
            {isProcessing && (
              <div className={S.processingMsg}>
                <div className={S.spinner} />
                <span>Processing... {Math.round(progress * 100)}%</span>
              </div>
            )}
            {!isProcessing && !error && resultText && (
              <pre className={S.outputText}>
                {showHex ? hexPreview : resultText.length > 50000 ? resultText.slice(0, 50000) + '\n\n... (truncated)' : resultText}
              </pre>
            )}
            {!isProcessing && !error && !resultText && (
              <div className={S.emptyOutput}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span>Output will appear here</span>
              </div>
            )}
          </div>
          {result && (
            <div className={S.stats}>
              <span>{formatFileSize(result.outputSize)}</span>
              <span className={S.statSep}>·</span>
              <span>{formatDuration(result.duration)}</span>
              {result.inputSize > 0 && (
                <>
                  <span className={S.statSep}>·</span>
                  <span className={result.outputSize > result.inputSize ? S.statGrow : S.statShrink}>
                    {result.outputSize > result.inputSize ? '+' : ''}{Math.round((result.outputSize / result.inputSize - 1) * 100)}%
                  </span>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
