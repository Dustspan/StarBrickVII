/**
 * StarBrickVII Main Page
 * 
 * The main application page featuring the vintage telephone dial interface.
 * Uses real WASM engines for encoding/decoding.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dial } from '@/components/Dial/Dial';
import { InputArea } from '@/components/IO/InputArea';
import { OutputArea } from '@/components/IO/OutputArea';
import { ProcessingProgress } from '@/components/Progress/ProcessingProgress';
import { useResponsive } from '@/hooks/useResponsive';
import { useEngine } from '@/hooks/useEngine';
import { type ProcessingMode, type ProcessingResult, MAX_IN_MEMORY_SIZE } from '@/lib/engine/types';
import styles from './page.module.css';

/**
 * Main Page Component
 */
export default function HomePage() {
  // Hooks
  const { isMobile } = useResponsive();
  
  // Engine state from hook
  const {
    engines,
    currentEngine,
    processingState,
    error,
    loadPresetEngines,
    selectEngine,
    processText,
    processFile,
    progress,
    estimatedTimeRemaining,
    clearError,
    abort,
  } = useEngine();
  
  // Local state
  const [mode, setMode] = useState<ProcessingMode>('encode');
  const [inputText, setInputText] = useState('');
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  
  // Load preset engines on mount
  useEffect(() => {
    loadPresetEngines();
  }, [loadPresetEngines]);
  
  /**
   * Handles engine selection from dial
   */
  const handleEngineSelect = useCallback((id: string) => {
    selectEngine(id);
    setResult(null);
  }, [selectEngine]);
  
  /**
   * Handles file drop
   */
  const handleFileDrop = useCallback((file: File) => {
    // Check file size
    if (file.size > MAX_IN_MEMORY_SIZE) {
      clearError();
      return;
    }
    
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
   * Handles process action (CALL button)
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
   * Handles hang up (abort)
   */
  const handleHangUp = useCallback(() => {
    abort();
    setResult(null);
  }, [abort]);
  
  // Determine if process button should be enabled
  const canProcess = currentEngine && (inputText || inputFile) && processingState !== 'processing';
  const isProcessing = processingState === 'processing';
  
  // Get engine list for dial
  const engineList = Array.from(engines.values());
  
  return (
    <div className={styles.container}>
      {/* Background with scanlines */}
      <div className={styles.background}>
        <div className={styles.scanlines} />
      </div>
      
      {/* Main layout */}
      <div className={styles.main}>
        {/* Left panel - Input */}
        <div className={styles.inputPanel}>
          <InputArea
            mode={mode}
            isProcessing={isProcessing}
            onInputChange={handleInputChange}
            onFileDrop={handleFileDrop}
            onProcess={handleProcess}
            value={inputText}
            placeholder={mode === 'encode' ? 'Enter text to encode...' : 'Enter text to decode...'}
          />
        </div>
        
        {/* Center - Dial */}
        <div className={styles.centerPanel}>
          <Dial
            engines={engineList}
            currentEngine={currentEngine}
            mode={mode}
            state={processingState}
            progress={progress}
            canProcess={!!canProcess}
            isProcessing={isProcessing}
            onEngineSelect={handleEngineSelect}
            onModeToggle={handleModeToggle}
            onProcess={handleProcess}
            onHangUp={handleHangUp}
            size={isMobile ? 'compact' : 'normal'}
          />
          
          {/* Progress bar */}
          <ProcessingProgress
            progress={progress}
            estimatedTimeRemaining={estimatedTimeRemaining}
            isActive={isProcessing}
          />
        </div>
        
        {/* Right panel - Output */}
        <div className={styles.outputPanel}>
          <OutputArea
            result={result}
            isProcessing={isProcessing}
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
            {engineList.map((engine) => (
              <option key={engine.id} value={engine.id}>
                {engine.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
