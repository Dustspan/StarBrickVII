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
  
  /**
   * Handles drag over event
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  /**
   * Handles drag leave event
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  /**
   * Handles file drop
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      
      // Check file size
      if (file.size > MAX_IN_MEMORY_SIZE) {
        alert(`File too large. Maximum size is ${formatFileSize(MAX_IN_MEMORY_SIZE)}`);
        return;
      }
      
      setDroppedFile(file);
      onFileDrop(file);
    }
  }, [onFileDrop]);
  
  /**
   * Handles file input change
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check file size
      if (file.size > MAX_IN_MEMORY_SIZE) {
        alert(`File too large. Maximum size is ${formatFileSize(MAX_IN_MEMORY_SIZE)}`);
        return;
      }
      
      setDroppedFile(file);
      onFileDrop(file);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFileDrop]);
  
  /**
   * Handles textarea change
   */
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
    setDroppedFile(null);
  }, [onInputChange]);
  
  /**
   * Handles keyboard shortcuts
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to process
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onProcess();
    }
  }, [onProcess]);
  
  /**
   * Removes dropped file
   */
  const handleRemoveFile = useCallback(() => {
    setDroppedFile(null);
    onInputChange('');
  }, [onInputChange]);
  
  /**
   * Opens file picker
   */
  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>Input</span>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={handleOpenFilePicker}
            disabled={isProcessing}
            title="Open file"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M12 18v-6M9 15h6" />
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
          <FilePreview file={droppedFile} onRemove={handleRemoveFile} />
        ) : (
          <>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={value}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isProcessing}
              spellCheck={false}
            />
            
            {isDragging && (
              <div className={styles.dropOverlay}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Drop file here</span>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className={styles.footer}>
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
            mode === 'encode' ? 'Encode' : 'Decode'
          )}
        </button>
        
        <span className={styles.hint}>
          Ctrl+Enter to process
        </span>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.json,.bin"
        className={styles.fileInput}
        onChange={handleFileInputChange}
      />
    </div>
  );
}

/**
 * File Preview Component
 */
interface FilePreviewProps {
  file: File;
  onRemove: () => void;
}

function FilePreview({ file, onRemove }: FilePreviewProps) {
  const isText = isTextType(file.type) || file.name.endsWith('.txt') || file.name.endsWith('.json');
  
  return (
    <div className={styles.filePreview}>
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
