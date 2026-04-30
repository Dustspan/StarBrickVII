/**
 * StarBrickVII — Main Page
 * 
 * Futuristic telephone-dial encoding/decoding workstation.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useEngine } from '@/hooks/useEngine';
import { type ProcessingMode, type ProcessingResult, MAX_IN_MEMORY_SIZE } from '@/lib/engine/types';
import { formatFileSize, formatDuration, downloadBlob, copyToClipboard, hexDump } from '@/lib/utils';
import S from './page.module.css';

export default function HomePage() {
  const {
    engineList, currentEngine,
    processingState, error, progress, loadProgress,
    loadPresetEngines, selectEngine,
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
  const dialRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartAngle = useRef(0);
  const dragStartRotation = useRef(0);
  const currentIndex = engineList.findIndex(e => e.id === currentEngine?.id);

  // Load engines on mount
  useEffect(() => { loadPresetEngines(); }, [loadPresetEngines]);

  // Auto-select first engine when list changes
  useEffect(() => {
    if (engineList.length > 0 && !currentEngine) {
      selectEngine(engineList[0].id);
    }
  }, [engineList, currentEngine, selectEngine]);

  const isProcessing = processingState === 'processing';
  const canProcess = currentEngine && (inputText.trim() || file) && !isProcessing;
  const isLoading = processingState === 'loading';

  // Dial rotation logic
  const sectorAngle = engineList.length > 0 ? 360 / engineList.length : 360;

  const getAngle = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }, []);

  const snapTo = useCallback((idx: number) => {
    if (engineList.length === 0) return;
    const target = -idx * sectorAngle;
    setRotation(target);
    selectEngine(engineList[idx].id);
  }, [engineList, sectorAngle, selectEngine]);

  const onPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isLoading || isProcessing) return;
    e.preventDefault();
    setDragging(true);
    dragStartAngle.current = getAngle(e);
    dragStartRotation.current = rotation;
  }, [getAngle, rotation, isLoading, isProcessing]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const rect = dialRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const angle = Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
      const delta = angle - dragStartAngle.current;
      setRotation(dragStartRotation.current + delta);
    };
    const onUp = () => {
      setDragging(false);
      // Snap to nearest sector
      let norm = ((rotation % 360) + 360) % 360;
      if (norm > 180) norm -= 360;
      let idx = Math.round(-norm / sectorAngle);
      idx = ((idx % engineList.length) + engineList.length) % engineList.length;
      snapTo(idx);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, rotation, sectorAngle, engineList.length, snapTo]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (engineList.length === 0) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = ((currentIndex - 1) + engineList.length) % engineList.length;
        snapTo(next);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (currentIndex + 1) % engineList.length;
        snapTo(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engineList, currentIndex, snapTo]);

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
  }, [file, inputText, mode, processText, processFile]);

  // File handling
  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_IN_MEMORY_SIZE) {
      alert(`File too large (max ${MAX_IN_MEMORY_SIZE / 1024 / 1024}MB)`);
      return;
    }
    setFile(f);
    setInputText('');
    setResult(null);
    setResultText('');
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleCopy = useCallback(async () => {
    if (!resultText) return;
    const ok = await copyToClipboard(resultText);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }, [resultText]);

  const handleDownload = useCallback(() => {
    if (result) downloadBlob(result.data, `output-${mode}.${mode === 'encode' ? 'enc' : 'dec'}`);
    else if (resultText) {
      const blob = new Blob([resultText], { type: 'text/plain' });
      downloadBlob(blob, `output-${mode}.txt`);
    }
  }, [result, resultText, mode]);

  // Conic gradient for dial
  const dialGradient = engineList.length > 0
    ? engineList.map((_, i) => {
        const start = i * sectorAngle;
        const end = (i + 1) * sectorAngle;
        const isEven = i % 2 === 0;
        return `${isEven ? '#1c1917' : '#292524'} ${start}deg ${end}deg`;
      }).join(', ')
    : '#1c1917 0deg 360deg';

  const hexPreview = resultText ? hexDump(new TextEncoder().encode(resultText.slice(0, 512))) : '';

  return (
    <div className={S.root}>
      {/* Scanlines overlay */}
      <div className={S.scanlines} />

      {/* Background grid */}
      <div className={S.grid} />

      {/* Header */}
      <header className={S.header}>
        <div className={S.logo}>
          <span className={S.logoStar}>★</span>
          <span className={S.logoText}>STARBRICK <span className={S.logoVII}>VII</span></span>
        </div>
        <div className={S.headerRight}>
          {currentEngine && (
            <span className={S.engineBadge}>
              <span className={S.badgeDot} />
              {currentEngine.name}
            </span>
          )}
        </div>
      </header>

      {/* Loading screen */}
      {isLoading && (
        <div className={S.loadingOverlay}>
          <div className={S.loadingSpinner} />
          <div className={S.loadingText}>INITIALIZING ENGINES</div>
          <div className={S.loadingBar}>
            <div className={S.loadingFill} style={{ width: `${loadProgress * 100}%` }} />
          </div>
          <div className={S.loadingPct}>{Math.round(loadProgress * 100)}%</div>
        </div>
      )}

      {/* Main content */}
      <main className={S.main}>
        {/* Left: Input */}
        <section className={S.panel}>
          <div className={S.panelLabel}>INPUT</div>
          <div className={S.inputArea}>
            <textarea
              className={S.textarea}
              value={inputText}
              onChange={e => { setInputText(e.target.value); setResult(null); setResultText(''); }}
              placeholder={file ? '' : 'Type or paste text here...'}
              disabled={isProcessing}
              rows={8}
            />
            <div className={S.dropZone}
              onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              data-active={isDragging || undefined}
            >
              <input ref={fileInputRef} type="file" className={S.hidden} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <div className={S.dropContent} onClick={() => fileInputRef.current?.click()}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <span>{file ? file.name : 'Drop any file here or click to browse'}</span>
                {file && (
                  <div className={S.fileInfo}>
                    <span>{formatFileSize(file.size)}</span>
                    <button className={S.removeFile} onClick={e => { e.stopPropagation(); setFile(null); }}>✕</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Center: Dial + Controls */}
        <section className={S.center}>
          {/* Mode toggle */}
          <div className={S.modeToggle}>
            <button className={`${S.modeBtn} ${mode === 'encode' ? S.modeActive : ''}`} onClick={() => setMode('encode')}>ENCODE</button>
            <div className={S.modeTrack}>
              <div className={S.modeSlider} style={{ transform: mode === 'encode' ? 'translateX(0)' : 'translateX(100%)' }} />
            </div>
            <button className={`${S.modeBtn} ${mode === 'decode' ? S.modeActive : ''}`} onClick={() => setMode('decode')}>DECODE</button>
          </div>

          {/* Rotary Dial */}
          <div className={S.dialWrap}>
            <div
              ref={dialRef}
              className={`${S.dial} ${dragging ? S.dialDragging : ''}`}
              style={{ transform: `rotate(${rotation}deg)`, background: `conic-gradient(from 0deg, ${dialGradient})` }}
              onMouseDown={onPointerDown}
              onTouchStart={onPointerDown}
              tabIndex={0}
              role="listbox"
              aria-label="Engine selector"
            >
              {engineList.map((eng, i) => {
                const angle = i * sectorAngle + sectorAngle / 2 - 90;
                const rad = angle * Math.PI / 180;
                const r = 42;
                const x = 50 + r * Math.cos(rad);
                const y = 50 + r * Math.sin(rad);
                const isActive = currentEngine?.id === eng.id;
                return (
                  <span
                    key={eng.id}
                    className={`${S.engineLabel} ${isActive ? S.engineLabelActive : ''}`}
                    style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${-rotation}deg)` }}
                  >
                    {eng.name}
                  </span>
                );
              })}
              {/* Center hub */}
              <div className={S.dialHub} onClick={() => engineList.length > 0 && snapTo(currentIndex >= 0 ? currentIndex : 0)}>
                <span className={S.dialHubText}>{currentEngine?.name || '—'}</span>
              </div>
            </div>
            {/* Glow ring */}
            <div className={S.dialGlow} />
          </div>

          {/* Action buttons */}
          <div className={S.actions}>
            <button
              className={`${S.callBtn} ${canProcess ? '' : S.btnDisabled}`}
              onClick={handleProcess}
              disabled={!canProcess}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
              <span>CALL</span>
            </button>
            <button
              className={`${S.hangBtn} ${isProcessing ? '' : S.btnDisabled}`}
              onClick={abort}
              disabled={!isProcessing}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              <span>END</span>
            </button>
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className={S.progressWrap}>
              <div className={S.progressBar}>
                <div className={S.progressFill} style={{ width: `${progress * 100}%` }} />
              </div>
              <span className={S.progressText}>{Math.round(progress * 100)}%</span>
            </div>
          )}
        </section>

        {/* Right: Output */}
        <section className={S.panel}>
          <div className={S.panelLabel}>
            OUTPUT
            <div className={S.panelActions}>
              {resultText && (
                <>
                  <button className={S.iconBtn} onClick={handleCopy} title="Copy">
                    {copied ? '✓' : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    )}
                  </button>
                  <button className={S.iconBtn} onClick={handleDownload} title="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                  <button className={S.iconBtn} onClick={() => setShowHex(!showHex)} title="Hex view">
                    <span style={{ fontSize: 10, fontWeight: 700 }}>HEX</span>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className={S.outputArea}>
            {error && <div className={S.errorDisplay}>{error}</div>}
            {isProcessing && !error && (
              <div className={S.processingDisplay}>
                <div className={S.processingDots}>
                  <span /><span /><span />
                </div>
                <span>PROCESSING...</span>
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
