/**
 * StarBrickVII Main Page
 * 
 * The main application page featuring the round dial interface.
 * Uses real WASM engines for encoding/decoding.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Dial } from '@/components/Dial/Dial';
import { EngineSelector } from '@/components/Engine/EngineSelector';
import { InputArea } from '@/components/IO/InputArea';
import { OutputArea } from '@/components/IO/OutputArea';
import { ProcessingProgress } from '@/components/Progress/ProcessingProgress';
import { useResponsive, useReducedMotion } from '@/hooks/useResponsive';
import { useEngine } from '@/hooks/useEngine';
import { type ProcessingMode, type ProcessingResult, MAX_IN_MEMORY_SIZE } from '@/lib/engine/types';
import styles from './page.module.css';

// Allowed file types
const ALLOWED_FILE_TYPES = [
  'text/plain',
  'application/octet-stream',
  'application/json',
];

/**
 * Main Page Component
 */
export default function HomePage() {
  // Hooks
  const { isMobile, isTablet } = useResponsive();
  const prefersReducedMotion = useReducedMotion();
  
  // Engine state from hook
  const {
    engines,
    currentEngine,
    processingState,
    error,
    loadPresetEngines,
    loadCustomEngine,
    selectEngine,
    processText,
    processFile,
    progress,
    estimatedTimeRemaining,
    clearError,
  } = useEngine();
  
  // Local state
  const [mode, setMode] = useState<ProcessingMode>('encode');
  const [inputText, setInputText] = useState('');
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load preset engines on mount
  useEffect(() => {
    loadPresetEngines();
  }, [loadPresetEngines]);
  
  /**
   * Handles engine selection
   */
  const handleEngineSelect = useCallback((id: string) => {
    selectEngine(id);
    setResult(null);
  }, [selectEngine]);
  
  /**
   * Handles custom engine file selection
   */
  const handleCustomEngineFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      await loadCustomEngine(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [loadCustomEngine]);
  
  /**
   * Handles file drop
   */
  const handleFileDrop = useCallback((file: File) => {
    // Check file size
    if (file.size > MAX_IN_MEMORY_SIZE) {
      clearError();
      return;
    }
    
    // Check file type (allow all for now, as browsers may not report correct MIME)
    setInputFile(file);
    setInputText('');
    setResult(null);
  }, [clearError]);
  
  /**
   * Handles input text change
   */
  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    setInputFile(null);
    setResult(null);
  }, []);
  
  /**
   * Handles process action
   */
  const handleProcess = useCallback(async () => {
    if (!currentEngine) return;
    
    clearError();
    setResult(null);
    
    let newResult: ProcessingResult | null = null;
    
    if (inputFile) {
      newResult = await processFile(inputFile, mode);
    } else if (inputText) {
      newResult = await processText(inputText, mode);
    }
    
    if (newResult) {
      setResult(newResult);
    }
  }, [currentEngine, inputFile, inputText, mode, processFile, processText, clearError]);
  
  /**
   * Handles mode toggle
   */
  const handleModeToggle = useCallback(() => {
    setMode((prev) => (prev === 'encode' ? 'decode' : 'encode'));
    setResult(null);
  }, []);
  
  /**
   * Handles cancel action
   */
  const handleCancel = useCallback(() => {
    // Reset processing state
    clearError();
  }, [clearError]);
  
  /**
   * Triggers custom engine file input
   */
  const handleLoadCustomEngine = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  // Determine if process button should be enabled
  const canProcess = currentEngine && (inputText || inputFile) && processingState !== 'processing';
  
  return (
    <div className={styles.container}>
      {/* Background */}
      <div className={styles.background} />
      
      {/* Main layout */}
      <div className={`${styles.main} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        {/* Sidebar - Engine selector (desktop only) */}
        {!isMobile && (
          <div className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
            <EngineSelector
              engines={engines}
              currentEngine={currentEngine}
              onSelect={handleEngineSelect}
              onLoadCustom={handleLoadCustomEngine}
              isLoading={processingState === 'loading'}
            />
            
            <button
              className={styles.collapseBtn}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none' }}
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Center - Dial */}
        <div className={styles.center}>
          <Dial
            engine={currentEngine}
            mode={mode}
            state={processingState}
            progress={progress}
            onModeToggle={handleModeToggle}
            onEncode={mode === 'encode' ? handleProcess : undefined}
            onDecode={mode === 'decode' ? handleProcess : undefined}
            size={isMobile ? 'compact' : 'normal'}
          />
          
          {/* Progress bar */}
          <ProcessingProgress
            progress={progress}
            estimatedTimeRemaining={estimatedTimeRemaining}
            isActive={processingState === 'processing'}
          />
          
          {/* Cancel button */}
          {processingState === 'processing' && (
            <button className={styles.cancelBtn} onClick={handleCancel}>
              Cancel
            </button>
          )}
        </div>
        
        {/* IO Panel */}
        <div className={styles.ioPanel}>
          <InputArea
            mode={mode}
            isProcessing={processingState === 'processing'}
            onInputChange={handleInputChange}
            onFileDrop={handleFileDrop}
            onProcess={handleProcess}
            value={inputText}
            placeholder={mode === 'encode' ? 'Enter text to encode...' : 'Enter text to decode...'}
          />
          
          <OutputArea
            result={result}
            isProcessing={processingState === 'processing'}
            error={error}
            filename={`output-${mode === 'encode' ? 'encoded' : 'decoded'}`}
          />
        </div>
      </div>
      
      {/* Mobile engine selector */}
      {isMobile && (
        <div className={styles.mobileEngineBar}>
          <select
            className={styles.mobileEngineSelect}
            value={currentEngine?.id || ''}
            onChange={(e) => handleEngineSelect(e.target.value)}
          >
            <option value="">Select Engine</option>
            {Array.from(engines.values()).map((engine) => (
              <option key={engine.id} value={engine.id}>
                {engine.name}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* Hidden file input for custom engine */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".wasm"
        className={styles.hiddenInput}
        onChange={handleCustomEngineFile}
      />
    </div>
  );
}
