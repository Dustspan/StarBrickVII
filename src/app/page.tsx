/**
 * StarBrickVII — Main Page
 *
 * Futuristic telephone-dial encoding/decoding workstation.
 * - Dial: color-coded sectors + side legend + arrow keys for quick switch
 * - Output: paginated display + expand toggle (corner buttons)
 * - DIY engine: optimistic UI, seamless integration
 */

'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEngine } from '@/hooks/useEngine';
import { type ProcessingMode, type ProcessingResult } from '@/lib/engine/types';
import { formatFileSize, formatDuration, downloadBlob, copyToClipboard, hexDump, hexDumpLines } from '@/lib/utils';
import S from './page.module.css';

/* ── Color palette for engine sectors (12 colors, cycles) ── */
const SECTOR_COLORS = [
  '#f97316', '#22c55e', '#3b82f6', '#a855f7',
  '#ec4899', '#14b8a6', '#eab308', '#ef4444',
  '#06b6d4', '#8b5cf6', '#f43f5e', '#84cc16',
];

const PAGE_SIZE = 4096; // chars per page in text mode
const HEX_PAGE_LINES = 32; // lines per page in hex mode (32 × 16 = 512 bytes)

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
  const [resultBinary, setResultBinary] = useState<Uint8Array | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHex, setShowHex] = useState(false);
  const [outputPage, setOutputPage] = useState(1);
  const [outputExpanded, setOutputExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasmInputRef = useRef<HTMLInputElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartAngle = useRef(0);
  const dragStartRotation = useRef(0);
  const currentIndex = engineList.findIndex(e => e.id === currentEngine?.id);

  /* ── Derived: engine color map ── */
  const engineColorMap = useMemo(() => {
    const map = new Map<string, string>();
    engineList.forEach((e, i) => map.set(e.id, SECTOR_COLORS[i % SECTOR_COLORS.length]));
    return map;
  }, [engineList]);

  const currentColor = currentEngine ? engineColorMap.get(currentEngine.id) || SECTOR_COLORS[0] : SECTOR_COLORS[0];

  /* ── Load engines on mount ── */
  useEffect(() => { loadPresetEngines(); }, [loadPresetEngines]);

  /* ── Dial drag handlers ── */
  const getAngle = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }, []);

  const snapToEngine = useCallback((angle: number) => {
    if (engineList.length === 0) return 0;
    const sectorDeg = 360 / engineList.length;
    // Normalize angle to 0-360
    let a = ((angle % 360) + 360) % 360;
    // Offset by half sector so sector 0 centers at top (-90°)
    a = (a + 90 + sectorDeg / 2) % 360;
    const idx = Math.floor(a / sectorDeg) % engineList.length;
    selectEngine(engineList[idx].id);
    return -idx * sectorDeg;
  }, [engineList, selectEngine]);

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (engineList.length === 0) return;
    e.preventDefault();
    setDragging(true);
    dragStartAngle.current = getAngle(e);
    dragStartRotation.current = rotation;
  }, [engineList.length, getAngle, rotation]);

  const onDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging) return;
    const angle = getAngle(e);
    const delta = angle - dragStartAngle.current;
    setRotation(dragStartRotation.current + delta);
  }, [dragging, getAngle]);

  const onDragEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    const snapped = snapToEngine(rotation);
    setRotation(snapped);
  }, [dragging, rotation, snapToEngine]);

  /* ── Arrow key handlers ── */
  const goPrev = useCallback(() => {
    if (engineList.length === 0) return;
    const prev = currentIndex <= 0 ? engineList.length - 1 : currentIndex - 1;
    selectEngine(engineList[prev].id);
    setRotation(-prev * (360 / engineList.length));
  }, [engineList, currentIndex, selectEngine]);

  const goNext = useCallback(() => {
    if (engineList.length === 0) return;
    const next = currentIndex >= engineList.length - 1 ? 0 : currentIndex + 1;
    selectEngine(engineList[next].id);
    setRotation(-next * (360 / engineList.length));
  }, [engineList, currentIndex, selectEngine]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext]);

  /* ── Sync rotation when engine changes externally ── */
  useEffect(() => {
    if (engineList.length > 0 && currentIndex >= 0) {
      setRotation(-currentIndex * (360 / engineList.length));
    }
  }, [engineList.length, currentIndex]);

  /* ── File handling ── */
  const handleFile = useCallback((f: File) => {
    setFile(f);
    setInputText('');
    setResult(null);
    setResultText('');
    setOutputPage(1);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onWasmImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      await importCustomEngine(f);
      e.target.value = '';
    }
  }, [importCustomEngine]);

  /* ── Processing ── */
  const isProcessing = processingState === 'processing' || processingState === 'loading';

  const handleProcess = useCallback(async () => {
    setResult(null);
    setResultText('');
    setResultBinary(null);
    setOutputPage(1);
    setOutputExpanded(false);

    let res: ProcessingResult | string | null = null;
    if (file) {
      res = await processFile(file, mode);
    } else if (inputText.trim()) {
      res = await processText(inputText, mode);
    }

    if (res && typeof res === 'object' && 'data' in res) {
      setResult(res);
      // Store raw binary for hex view
      try {
        const buf = await res.data.arrayBuffer();
        setResultBinary(new Uint8Array(buf));
        setResultText(new TextDecoder().decode(buf));
      } catch {
        setResultBinary(null);
        try { setResultText(await res.data.text()); } catch { /* empty */ }
      }
    } else if (typeof res === 'string') {
      const encoded = new TextEncoder().encode(res);
      setResultBinary(encoded);
      setResultText(res);
      setResult({ data: new Blob([res]), inputSize: new TextEncoder().encode(inputText).length, outputSize: encoded.length, duration: 0 });
    }
  }, [file, inputText, mode, processFile, processText]);

  /* ── Copy ── */
  const handleCopy = useCallback(async () => {
    if (!resultText) return;
    await copyToClipboard(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [resultText]);

  /* ── Download ── */
  const handleDownload = useCallback(() => {
    if (!result) return;
    const ext = mode === 'encode' ? 'encoded' : 'decoded';
    downloadBlob(result.data, `output.${ext}`);
  }, [result, mode]);

  /* ── Output pagination ── */
  const totalPages = showHex && resultBinary
    ? Math.max(1, hexDumpLines(resultBinary.length) / HEX_PAGE_LINES)
    : Math.max(1, Math.ceil(resultText.length / PAGE_SIZE));

  const paginatedText = outputExpanded
    ? resultText
    : resultText.slice((outputPage - 1) * PAGE_SIZE, outputPage * PAGE_SIZE);

  const hexPreview = resultBinary
    ? hexDump(
        resultBinary,
        outputExpanded ? 0 : (outputPage - 1) * HEX_PAGE_LINES * 16,
        outputExpanded ? undefined : HEX_PAGE_LINES * 16,
      )
    : '';

  /* ── Dial gradient — color-coded sectors ── */
  const dialGradient = engineList.length > 0
    ? `conic-gradient(from -90deg, ${engineList.map((_, i) => {
        const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
        const start = (i / engineList.length) * 100;
        const end = ((i + 1) / engineList.length) * 100;
        return `${color} ${start}% ${end}%`;
      }).join(', ')})`
    : 'conic-gradient(from -90deg, var(--border) 0% 100%)';

  /* ── Render ── */
  return (
    <div className={S.root}>
      <div className={S.scanlines} />
      <div className={S.grid} />

      {/* ── Header ── */}
      <header className={S.header}>
        <div className={S.logo}>
          <span className={S.logoStar}>★</span>
          <span className={S.logoText}>STARBRICK</span>
          <span className={S.logoVII}>VII</span>
        </div>
        <div className={S.headerRight}>
          {currentEngine && (
            <div className={S.engineBadge}>
              <span className={S.badgeDot} style={{ background: currentColor }} />
              <span>{currentEngine.name}</span>
            </div>
          )}
          <button className={S.iconBtn} onClick={() => wasmInputRef.current?.click()} title="Import WASM engine">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
          <input ref={wasmInputRef} type="file" accept=".wasm" hidden onChange={onWasmImport} />
        </div>
      </header>

      {/* ── Loading overlay ── */}
      {processingState === 'loading' && (
        <div className={S.loadingOverlay}>
          <div className={S.loadingSpinner}><div className={S.spin} /></div>
          <div className={S.loadingText}>Initializing engines...</div>
          <div className={S.loadingBar}><div className={S.loadingFill} style={{ width: `${loadProgress * 100}%` }} /></div>
          <div className={S.loadingPct}>{Math.round(loadProgress * 100)}%</div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className={S.main}>
        {/* Left panel — Input */}
        <section className={S.panel}>
          <div className={S.panelLabel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            <span>INPUT</span>
          </div>
          <div className={S.panelActions}>
            <button className={S.iconBtn} onClick={() => fileInputRef.current?.click()} title="Upload file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            </button>
            {file && (
              <button className={S.iconBtn} onClick={() => { setFile(null); setResult(null); setResultText(''); }} title="Remove file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          <div
            className={`${S.inputArea} ${isDragging ? S.dragOver : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            {file ? (
              <div className={S.fileInfo}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <span className={S.fileName}>{file.name}</span>
                <span className={S.fileSize}>{formatFileSize(file.size)}</span>
              </div>
            ) : (
              <textarea
                className={S.textarea}
                placeholder="Type or paste text here..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                spellCheck={false}
              />
            )}
            {!file && (
              <div className={S.dropZone}>
                <span>or drop any file here</span>
              </div>
            )}
          </div>
        </section>

        {/* Center — Dial + Legend + Arrows */}
        <div className={S.center}>
          {/* Left arrow */}
          <button className={S.arrowBtn} onClick={goPrev} disabled={engineList.length === 0} title="Previous engine (←)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          {/* Dial */}
          <div className={S.dialWrap}>
            <div
              ref={dialRef}
              className={S.dial}
              style={{ background: dialGradient, transform: `rotate(${rotation}deg)`, cursor: engineList.length > 0 ? 'grab' : 'default' }}
              onMouseDown={onDragStart}
              onMouseMove={onDragMove}
              onMouseUp={onDragEnd}
              onMouseLeave={() => { if (dragging) onDragEnd(); }}
              onTouchStart={onDragStart}
              onTouchMove={onDragMove}
              onTouchEnd={onDragEnd}
            >
              {/* Sector tick marks */}
              {engineList.map((_, i) => {
                const angle = (i / engineList.length) * 360 - 90;
                return (
                  <div
                    key={i}
                    className={S.tick}
                    style={{
                      transform: `rotate(${angle}deg) translateY(-42%)`,
                      borderColor: i === currentIndex ? '#fff' : 'rgba(255,255,255,0.15)',
                    }}
                  />
                );
              })}
              {/* Center hub */}
              <div className={S.dialHub} style={{ borderColor: currentColor }}>
                <div className={S.dialHubText}>
                  {currentEngine ? currentEngine.name : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Right arrow */}
          <button className={S.arrowBtn} onClick={goNext} disabled={engineList.length === 0} title="Next engine (→)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>

          {/* Mode toggle */}
          <div className={S.modeToggle}>
            <button
              className={`${S.modeBtn} ${mode === 'encode' ? S.modeActive : ''}`}
              onClick={() => setMode('encode')}
              style={mode === 'encode' ? { background: currentColor, borderColor: currentColor } : {}}
            >ENCODE</button>
            <div className={S.modeTrack}>
              <div className={S.modeSlider} style={{ transform: mode === 'encode' ? 'translateX(0)' : 'translateX(100%)', background: currentColor }} />
            </div>
            <button
              className={`${S.modeBtn} ${mode === 'decode' ? S.modeActive : ''}`}
              onClick={() => setMode('decode')}
              style={mode === 'decode' ? { background: currentColor, borderColor: currentColor } : {}}
            >DECODE</button>
          </div>

          {/* CALL / HANG UP */}
          <button
            className={S.callBtn}
            onClick={handleProcess}
            disabled={isProcessing || (!inputText.trim() && !file) || engineList.length === 0}
            style={isProcessing ? { opacity: 0.5 } : { boxShadow: `0 0 20px ${currentColor}40` }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
            <span>{isProcessing ? `${Math.round(progress * 100)}%` : 'CALL'}</span>
          </button>
          {isProcessing && (
            <button className={S.hangBtn} onClick={abort}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-3.33-2.67m-2.67-3.34a19.79 19.79 0 01-3.07-8.63A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              <span>HANG UP</span>
            </button>
          )}

          {/* Legend */}
          {engineList.length > 0 && (
            <div className={S.legend}>
              {engineList.map((eng, i) => (
                <div
                  key={eng.id}
                  className={`${S.legendItem} ${eng.id === currentEngine?.id ? S.legendActive : ''}`}
                  onClick={() => { selectEngine(eng.id); setRotation(-i * (360 / engineList.length)); }}
                >
                  <span className={S.legendDot} style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                  <span className={S.legendName}>{eng.name}</span>
                  <span className={S.legendCaps}>
                    {eng.capabilities.binarySafe && <span title="Binary Safe">B</span>}
                    {eng.capabilities.selfInverse && <span title="Self-Inverse">S</span>}
                    {!eng.capabilities.reversible && <span title="Encode Only" className={S.capWarn}>!</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel — Output */}
        <section className={S.panel}>
          <div className={S.panelLabel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
            <span>OUTPUT</span>
          </div>
          <div className={S.panelActions}>
            {resultText && (
              <>
                <button className={S.iconBtn} onClick={() => setShowHex(h => !h)} title={showHex ? 'Text view' : 'Hex view'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg>
                </button>
                <button className={S.iconBtn} onClick={handleCopy} title="Copy">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                </button>
                <button className={S.iconBtn} onClick={handleDownload} title="Download">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                </button>
              </>
            )}
          </div>
          <div className={S.outputWrap}>
            {/* Pagination controls — top-right corner */}
            {((!showHex && resultText.length > PAGE_SIZE) || (showHex && resultBinary && resultBinary.length > HEX_PAGE_LINES * 16)) && !outputExpanded && (
              <div className={S.pageControls}>
                <button
                  className={S.pageBtn}
                  disabled={outputPage <= 1}
                  onClick={() => setOutputPage(p => p - 1)}
                >‹</button>
                <span className={S.pageInfo}>{outputPage}/{totalPages}</span>
                <button
                  className={S.pageBtn}
                  disabled={outputPage >= totalPages}
                  onClick={() => setOutputPage(p => p + 1)}
                >›</button>
              </div>
            )}
            {/* Expand toggle — bottom-right corner */}
            {resultText.length > PAGE_SIZE && (
              <button
                className={S.expandBtn}
                onClick={() => setOutputExpanded(e => !e)}
                title={outputExpanded ? 'Collapse' : 'Expand all'}
              >
                {outputExpanded ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                )}
              </button>
            )}

            <div className={`${S.outputArea} ${outputExpanded ? S.outputExpanded : ''}`}>
              {error && <div className={S.errorBox}>{error}</div>}
              {isProcessing && (
                <div className={S.progressWrap}>
                  <div className={S.progressBar}><div className={S.progressFill} style={{ width: `${progress * 100}%`, background: currentColor }} /></div>
                </div>
              )}
              {copied && <div className={S.copiedToast}>Copied!</div>}
              {resultText && (
                <pre className={S.outputText}>
                  {showHex ? hexPreview : paginatedText}
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
