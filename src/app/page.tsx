/**
 * StarBrickVII Main Page
 * 
 * The main application page featuring the round dial interface.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { Dial } from '@/components/Dial/Dial';
import { EngineSelector } from '@/components/Engine/EngineSelector';
import { InputArea } from '@/components/IO/InputArea';
import { OutputArea } from '@/components/IO/OutputArea';
import { ProcessingProgress } from '@/components/Progress/ProcessingProgress';
import { useResponsive, useReducedMotion } from '@/hooks/useResponsive';
import { type Engine, type ProcessingMode, type ProcessingResult } from '@/lib/engine/types';
import styles from './page.module.css';

// Mock engine data for demonstration
const MOCK_ENGINES: Engine[] = [
  {
    id: 'base64',
    name: 'Base64',
    desc: 'Standard Base64 encoding and decoding',
    capabilities: {
      binarySafe: true,
      selfInverse: false,
      reversible: true,
      stateful: false,
    },
    isPreset: true,
  },
  {
    id: 'hex',
    name: 'Hexadecimal',
    desc: 'Hexadecimal encoding and decoding',
    capabilities: {
      binarySafe: true,
      selfInverse: false,
      reversible: true,
      stateful: false,
    },
    isPreset: true,
  },
  {
    id: 'binary',
    name: 'Binary',
    desc: 'Binary string representation',
    capabilities: {
      binarySafe: true,
      selfInverse: false,
      reversible: true,
      stateful: false,
    },
    isPreset: true,
  },
];

export default function HomePage() {
  const { isMobile } = useResponsive();
  useReducedMotion();
  
  // State
  const [engines] = useState<Map<string, Engine>>(() => {
    const map = new Map();
    MOCK_ENGINES.forEach((e) => map.set(e.id, e));
    return map;
  });
  const [currentEngine, setCurrentEngine] = useState<Engine | null>(null);
  const [mode, setMode] = useState<ProcessingMode>('encode');
  const [processingState, setProcessingState] = useState<'idle' | 'loading' | 'processing' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Handlers
  const handleEngineSelect = useCallback((id: string) => {
    const engine = engines.get(id);
    setCurrentEngine(engine || null);
    setResult(null);
    setError(null);
  }, [engines]);
  
  const handleLoadCustomEngine = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  const handleCustomEngineFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // TODO: Load and validate custom engine
    // eslint-disable-next-line no-console
    console.log('Loading custom engine:', file.name);
    e.target.value = '';
  }, []);
  
  const handleModeToggle = useCallback(() => {
    setMode((prev) => (prev === 'encode' ? 'decode' : 'encode'));
  }, []);
  
  const handleInputChange = useCallback((text: string) => {
    setInputValue(text);
    setInputFile(null);
    setResult(null);
    setError(null);
  }, []);
  
  const handleFileDrop = useCallback((file: File) => {
    setInputFile(file);
    setInputValue('');
    setResult(null);
    setError(null);
  }, []);
  
  const handleProcess = useCallback(async () => {
    if (!currentEngine) {
      setError('Please select an engine');
      return;
    }
    
    if (!inputValue && !inputFile) {
      setError('Please enter text or drop a file');
      return;
    }
    
    setProcessingState('processing');
    setProgress(0);
    setError(null);
    
    try {
      // Simulate processing
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((r) => setTimeout(r, 100));
        setProgress(i / 100);
      }
      
      // Mock result
      const outputText = mode === 'encode' 
        ? btoa(inputValue || 'test input')
        : atob(inputValue || 'dGVzdCBpbnB1dA==');
      
      setResult({
        data: new Blob([outputText]),
        inputSize: inputValue?.length || 0,
        outputSize: outputText.length,
        duration: 1000,
      });
      
      setProcessingState('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      setProcessingState('error');
    }
  }, [currentEngine, inputValue, inputFile, mode]);
  
  const handleEncode = useCallback(() => {
    setMode('encode');
    handleProcess();
  }, [handleProcess]);
  
  const handleDecode = useCallback(() => {
    if (!currentEngine?.capabilities.reversible) {
      setError('This engine does not support decoding');
      return;
    }
    setMode('decode');
    handleProcess();
  }, [currentEngine, handleProcess]);
  
  return (
    <div className={styles.container}>
      {/* Background */}
      <div className={styles.background} />
      
      {/* Main layout */}
      <div className={`${styles.main} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        {/* Sidebar */}
        {!isMobile && (
          <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={sidebarCollapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
              </svg>
            </button>
          </aside>
        )}
        
        {/* Center - Dial */}
        <div className={styles.center}>
          <Dial
            engine={currentEngine}
            mode={mode}
            state={processingState}
            progress={progress}
            onModeToggle={handleModeToggle}
            onEncode={handleEncode}
            onDecode={handleDecode}
            size={isMobile ? 'compact' : 'normal'}
          />
          
          {/* Progress */}
          <ProcessingProgress
            progress={progress}
            estimatedTimeRemaining={null}
            isActive={processingState === 'processing'}
          />
        </div>
        
        {/* Right panel - IO */}
        <div className={styles.ioPanel}>
          <InputArea
            mode={mode}
            isProcessing={processingState === 'processing'}
            onInputChange={handleInputChange}
            onFileDrop={handleFileDrop}
            onProcess={handleProcess}
            value={inputValue}
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
