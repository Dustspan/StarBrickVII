/**
 * Input Area Component
 * 
 * Handles text input and file drop for encoding/decoding.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { formatFileSize, detectMimeType, isImageType, isTextType } from '@/lib/utils';
import { type ProcessingMode } from '@/lib/engine/types';
import styles from './IOArea.module.css';

export interface InputAreaProps {
  /** Current processing mode */
  mode: ProcessingMode;
  /** Whether processing is in progress */
  isProcessing: boolean;
  /** Input change handler */
  onInputChange: (text: string) => void;
  /** File drop handler */
  onFileDrop: (file: File) => void;
  /** Process trigger */
  onProcess: () => void;
  /** Current input value */
  value?: string;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Input Area Component
 */
export function InputArea({
  mode,
  isProcessing,
  onInputChange,
  onFileDrop,
  onProcess,
  value = '',
  placeholder = 'Enter text or drop a file...',
}: InputAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      setDroppedFile(file);
      onFileDrop(file);
    }
  }, [onFileDrop]);
  
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setDroppedFile(file);
      onFileDrop(file);
    }
  }, [onFileDrop]);
  
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      onInputChange(text);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  }, [onInputChange]);
  
  const handleClear = useCallback(() => {
    onInputChange('');
    setDroppedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onInputChange]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onProcess();
    }
  }, [onProcess]);
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>Input</span>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={handlePaste}
            disabled={isProcessing}
            title="Paste from clipboard"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            title="Select file"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleClear}
            disabled={isProcessing || (!value && !droppedFile)}
            title="Clear"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      <div
        className={`${styles.inputWrapper} ${isDragging ? styles.dragging : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {droppedFile ? (
          <FilePreview file={droppedFile} onRemove={() => setDroppedFile(null)} />
        ) : (
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={value}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isProcessing}
            spellCheck={false}
          />
        )}
        
        {isDragging && (
          <div className={styles.dropOverlay}>
            <span>Drop file here</span>
          </div>
        )}
      </div>
      
      <div className={styles.footer}>
        <span className={styles.hint}>
          {value.length > 0 ? `${value.length} chars` : 'Ctrl+Enter to process'}
        </span>
        <button
          className={styles.processBtn}
          onClick={onProcess}
          disabled={isProcessing || (!value && !droppedFile)}
        >
          {isProcessing ? (
            <>
              <span className={styles.spinner} />
              Processing...
            </>
          ) : (
            <>
              {mode === 'encode' ? 'Encode' : 'Decode'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        className={styles.fileInput}
        onChange={handleFileSelect}
      />
    </div>
  );
}

interface FilePreviewProps {
  file: File;
  onRemove: () => void;
}

function FilePreview({ file, onRemove }: FilePreviewProps) {
  const mimeType = detectMimeType(file.name);
  const isImage = isImageType(mimeType);
  const isText = isTextType(mimeType);
  
  return (
    <div className={styles.filePreview}>
      <div className={styles.fileInfo}>
        <div className={styles.fileIcon}>
          {isImage ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          ) : isText ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
              <path d="M13 2v7h7" />
            </svg>
          )}
        </div>
        <div className={styles.fileDetails}>
          <span className={styles.fileName}>{file.name}</span>
          <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
        </div>
        <button className={styles.removeBtn} onClick={onRemove}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default InputArea;
