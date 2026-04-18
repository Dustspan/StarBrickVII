/**
 * Output Area Component
 * 
 * Displays processing results with preview and download options.
 */

'use client';

import { useState, useMemo } from 'react';
import { formatFileSize, formatDuration, downloadBlob, copyToClipboard, hexDump } from '@/lib/utils';
import { type ProcessingResult } from '@/lib/engine/types';
import styles from './IOArea.module.css';

export interface OutputAreaProps {
  /** Processing result */
  result: ProcessingResult | null;
  /** Whether processing is in progress */
  isProcessing: boolean;
  /** Error message */
  error: string | null;
  /** Output filename suggestion */
  filename?: string;
}

type PreviewMode = 'preview' | 'text' | 'hex';

/**
 * Output Area Component
 */
export function OutputArea({
  result,
  isProcessing,
  error,
  filename = 'output',
}: OutputAreaProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('preview');
  const [copied, setCopied] = useState(false);
  
  const previewData = useMemo((): Promise<{
    text: string;
    hex: string;
    size: number;
    duration: number;
  }> | null => {
    if (!result) return null;
    
    return result.data.text().then((text) => ({
      text,
      hex: hexDump(new Uint8Array(result.data.size)),
      size: result.data.size,
      duration: result.duration,
    }));
  }, [result]);
  
  const handleCopy = async () => {
    if (!result) return;
    
    try {
      const text = await result.data.text();
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  const handleDownload = () => {
    if (!result) return;
    
    const ext = previewMode === 'hex' ? 'hex' : 'txt';
    downloadBlob(result.data, `${filename}.${ext}`);
  };
  
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.label}>Output</span>
        </div>
        <div className={`${styles.outputWrapper} ${styles.error}`}>
          <div className={styles.errorContent}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      </div>
    );
  }
  
  if (isProcessing) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.label}>Output</span>
        </div>
        <div className={`${styles.outputWrapper} ${styles.processing}`}>
          <div className={styles.processingContent}>
            <span className={styles.spinner} />
            <span>Processing...</span>
          </div>
        </div>
      </div>
    );
  }
  
  if (!result) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.label}>Output</span>
        </div>
        <div className={`${styles.outputWrapper} ${styles.empty}`}>
          <span className={styles.emptyText}>No output yet</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>Output</span>
        <div className={styles.actions}>
          <div className={styles.previewModes}>
            <button
              className={`${styles.modeBtn} ${previewMode === 'preview' ? styles.active : ''}`}
              onClick={() => setPreviewMode('preview')}
              title="Preview"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              className={`${styles.modeBtn} ${previewMode === 'text' ? styles.active : ''}`}
              onClick={() => setPreviewMode('text')}
              title="Text view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
            </button>
            <button
              className={`${styles.modeBtn} ${previewMode === 'hex' ? styles.active : ''}`}
              onClick={() => setPreviewMode('hex')}
              title="Hex view"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
            </button>
          </div>
          <button
            className={styles.actionBtn}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleDownload}
            title="Download"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className={styles.outputWrapper}>
        <OutputContent
          result={result}
          previewMode={previewMode}
          previewDataPromise={previewData}
        />
      </div>
      
      <div className={styles.footer}>
        <div className={styles.stats}>
          <span>{formatFileSize(result.outputSize)}</span>
          <span className={styles.statSeparator}>•</span>
          <span>{formatDuration(result.duration)}</span>
          {result.inputSize !== result.outputSize && (
            <>
              <span className={styles.statSeparator}>•</span>
              <span className={result.outputSize > result.inputSize ? styles.larger : styles.smaller}>
                {result.outputSize > result.inputSize ? '+' : ''}
                {Math.round(((result.outputSize - result.inputSize) / result.inputSize) * 100)}%
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface OutputContentProps {
  result: ProcessingResult;
  previewMode: PreviewMode;
  previewDataPromise: Promise<{
    text: string;
    hex: string;
    size: number;
    duration: number;
  }> | null;
}

function OutputContent({ result, previewMode, previewDataPromise }: OutputContentProps) {
  const [data, setData] = useState<{ text: string; hex: string } | null>(null);
  
  // Load preview data
  if (!data) {
    previewDataPromise?.then((d) => {
      if (d) setData({ text: d.text, hex: d.hex });
    });
  }
  
  if (previewMode === 'hex') {
    return (
      <pre className={`${styles.outputText} ${styles.hex}`}>
        {data?.hex || 'Loading...'}
      </pre>
    );
  }
  
  if (previewMode === 'text') {
    return (
      <pre className={styles.outputText}>
        {data?.text || 'Loading...'}
      </pre>
    );
  }
  
  // Preview mode - try to show a nice preview
  return (
    <div className={styles.previewContent}>
      <pre className={styles.outputText}>
        {data?.text?.slice(0, 1000) || 'Loading...'}
        {(data?.text?.length || 0) > 1000 && (
          <span className={styles.truncated}>
            {'\n'}... truncated ({formatFileSize(result.outputSize)} total)
          </span>
        )}
      </pre>
    </div>
  );
}

export default OutputArea;
