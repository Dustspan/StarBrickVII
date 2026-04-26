/**
 * Input Area Component
 * 
 * Handles text input and file drop for encoding/decoding.
 * Features clear visual feedback for drag and drop.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { formatFileSize, detectMimeType, isTextType } from '@/lib/utils';
import { type ProcessingMode, MAX_IN_MEMORY_SIZE } from '@/lib/engine/types';
import styles from './IOArea.module.css';

// Allowed file types
const ALLOWED_FILE_TYPES = [
  'text/plain',
  'application/octet-stream',
  'application/json',
];

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
  /** Current file */
  file?: File | null;
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
  file,
  placeholder,
}: InputAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  
  const validateAndProcessFile = useCallback((file: File) => {
    // Check file size
    if (file.size > MAX_IN_MEMORY_SIZE) {
      alert(`File too large. Maximum size is ${formatFileSize(MAX_IN_MEMORY_SIZE)}.`);
      return;
    }
    
    // Check file type - use file.type or detect from filename
    const mimeType = file.type || detectMimeType(file.name);
    if (!ALLOWED_FILE_TYPES.includes(mimeType) && !mimeType.startsWith('text/')) {
      alert(`File type "${mimeType}" is not supported. Allowed types: text, binary, JSON.`);
      return;
    }
    
    onFileDrop(file);
  }, [onFileDrop]);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndProcessFile(droppedFile);
    }
  }, [validateAndProcessFile]);
  
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndProcessFile(selectedFile);
    }
  }, [validateAndProcessFile]);
  
  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onProcess();
    }
  }, [onProcess]);
  
  const modeLabel = mode === 'encode' ? 'Input to encode' : 'Input to decode';
  const defaultPlaceholder = placeholder || `Enter text to ${mode}...`;
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>{modeLabel.toUpperCase()}</span>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={handleBrowseClick}
            disabled={isProcessing}
            title="Browse files"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M12 18v-6M9 15h6" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className={styles.inputWrapper}>
        {file ? (
          <FileInfo
            file={file}
            onRemove={() => onFileDrop(null as unknown as File)}
          />
        ) : (
          <div
            className={`${styles.dropZone} ${isDragging ? styles.active : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleBrowseClick}
          >
            <svg className={styles.dropZoneIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className={styles.dropZoneText}>
              Drop file here or click to browse
            </span>
            <span className={styles.dropZoneHint}>
              Max {formatFileSize(MAX_IN_MEMORY_SIZE)} • Text, Binary, JSON
            </span>
          </div>
        )}
        
        {!file && (
          <div className={styles.textareaWrapper}>
            <textarea
              className={styles.textarea}
              value={value}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={defaultPlaceholder}
              disabled={isProcessing}
              spellCheck={false}
            />
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          className={styles.fileInput}
          onChange={handleFileSelect}
          accept=".txt,.json,.bin,*/*"
        />
      </div>
    </div>
  );
}

/**
 * File info display component
 */
function FileInfo({ file, onRemove }: { file: File; onRemove: () => void }) {
  const mimeType = file.type || detectMimeType(file.name);
  const isText = isTextType(mimeType);
  
  return (
    <div className={styles.fileInfo}>
      <div className={styles.fileIcon}>
        {isText ? (
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
  );
}

export default InputArea;
