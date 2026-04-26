/**
 * Output Area Component
 * 
 * Displays processing results with preview and download options.
 * Styled as a vintage electronic display screen.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
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
  } | null> => {
    if (!result?.data) return Promise.resolve(null);
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        resolve({
          text,
          hex: hexDump(new TextEncoder().encode(text)),
          size: result.outputSize,
          duration: result.duration,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(result.data);
    });
  }, [result]);
  
  const handleCopy = useCallback(async () => {
    if (!result?.data) return;
    
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(result.data);
    });
    
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);
  
  const handleDownload = useCallback(() => {
    if (!result?.data) return;
    downloadBlob(result.data, `${filename}.txt`);
  }, [result, filename]);
  
  // Empty state
  if (!result && !isProcessing && !error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.label}>OUTPUT</span>
        </div>
        <div className={styles.outputWrapper}>
          <div className={styles.emptyState}>
            <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className={styles.emptyText}>
              Output will appear here after processing
            </span>
          </div>
        </div>
      </div>
    );
  }
  
  // Processing state
  if (isProcessing) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.label}>OUTPUT</span>
        </div>
        <div className={styles.outputWrapper}>
          <div className={styles.processingState}>
            <div className={styles.spinner} />
            <span className={styles.processingText}>Processing...</span>
          </div>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.label}>OUTPUT</span>
        </div>
        <div className={styles.outputWrapper}>
          <div className={styles.errorState}>
            <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className={styles.errorText}>{error}</span>
          </div>
        </div>
      </div>
    );
  }
  
  // Result state
  if (!result) {
    return null;
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>OUTPUT</span>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
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
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className={styles.outputWrapper}>
        <div className={styles.resultContainer}>
          {/* Preview tabs */}
          <div className={styles.previewTabs}>
            <button
              className={`${styles.previewTab} ${previewMode === 'preview' ? styles.active : ''}`}
              onClick={() => setPreviewMode('preview')}
            >
              Preview
            </button>
            <button
              className={`${styles.previewTab} ${previewMode === 'text' ? styles.active : ''}`}
              onClick={() => setPreviewMode('text')}
            >
              Text
            </button>
            <button
              className={`${styles.previewTab} ${previewMode === 'hex' ? styles.active : ''}`}
              onClick={() => setPreviewMode('hex')}
            >
              Hex
            </button>
          </div>
          
          {/* Content */}
          <OutputContent
            previewMode={previewMode}
            previewDataPromise={previewData}
            result={result}
          />
          
          {/* Stats */}
          <div className={styles.resultActions}>
            <div className={styles.resultStats}>
              <span>{formatFileSize(result.outputSize)}</span>
              <span className={styles.statSeparator}>•</span>
              <span>{formatDuration(result.duration)}</span>
              {result.outputSize > result.inputSize ? (
                <span className={styles.larger}>
                  (+{Math.round((result.outputSize / result.inputSize - 1) * 100)}%)
                </span>
              ) : (
                <span className={styles.smaller}>
                  (-{Math.round((1 - result.outputSize / result.inputSize) * 100)}%)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Output content component
 */
function OutputContent({
  previewMode,
  previewDataPromise,
  result,
}: {
  previewMode: PreviewMode;
  previewDataPromise: Promise<{
    text: string;
    hex: string;
    size: number;
    duration: number;
  } | null>;
  result: ProcessingResult | null;
}) {
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
        {(data?.text?.length || 0) > 1000 && result && (
          <span className={styles.truncated}>
            {'\n'}... truncated ({formatFileSize(result.outputSize)} total)
          </span>
        )}
      </pre>
    </div>
  );
}

export default OutputArea;
