/**
 * Dial Component
 * 
 * A vintage telephone-style rotary dial with modern tech aesthetics.
 * Features drag-to-rotate selection with snap-to-engine behavior.
 * Includes CALL/HANG UP buttons and mode toggle switch.
 */

'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { type Engine } from '@/lib/engine/types';
import styles from './Dial.module.css';

export interface DialProps {
  /** Available engines */
  engines: Engine[];
  /** Currently selected engine */
  currentEngine: Engine | null;
  /** Current processing mode */
  mode: 'encode' | 'decode';
  /** Processing state */
  state: 'idle' | 'loading' | 'processing' | 'complete' | 'error';
  /** Progress value (0-1) */
  progress?: number;
  /** Whether processing is allowed */
  canProcess: boolean;
  /** Whether processing is in progress */
  isProcessing: boolean;
  /** Engine selection handler */
  onEngineSelect: (id: string) => void;
  /** Mode toggle handler */
  onModeToggle: () => void;
  /** Process handler (CALL button) */
  onProcess: () => void;
  /** Hang up handler */
  onHangUp: () => void;
  /** Size variant */
  size?: 'compact' | 'normal' | 'large';
}

// Engine colors for the dial
const ENGINE_COLORS = [
  '#f97316', // Orange
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#eab308', // Yellow
];

/**
 * Dial Component
 */
export function Dial({
  engines,
  currentEngine,
  mode,
  state,
  progress = 0,
  canProcess,
  isProcessing,
  onEngineSelect,
  onModeToggle,
  onProcess,
  onHangUp,
  size = 'normal',
}: DialProps) {
  // State
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  
  // Refs
  const dialRef = useRef<HTMLDivElement>(null);
  const dragStartAngleRef = useRef(0);
  const initialRotationRef = useRef(0);
  
  // Calculate sector angle
  const sectorAngle = engines.length > 0 ? 360 / engines.length : 120;
  
  // Get current engine index
  const currentIndex = useMemo(() => {
    if (!currentEngine) return 0;
    const index = engines.findIndex(e => e.id === currentEngine.id);
    return index >= 0 ? index : 0;
  }, [engines, currentEngine]);
  
  /**
   * Calculates angle from center to point
   */
  const getAngleFromCenter = useCallback((clientX: number, clientY: number): number => {
    if (!dialRef.current) return 0;
    
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    
    // Calculate angle in degrees (0 = top, clockwise)
    let angle = Math.atan2(deltaX, -deltaY) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    
    return angle;
  }, []);
  
  /**
   * Snaps rotation to nearest sector
   */
  const snapToSector = useCallback((angle: number): { rotation: number; index: number } => {
    // Normalize angle to 0-360
    let normalized = angle % 360;
    if (normalized < 0) normalized += 360;
    
    // Find nearest sector center
    const index = Math.round(normalized / sectorAngle) % engines.length;
    const targetRotation = index * sectorAngle;
    
    return { rotation: targetRotation, index };
  }, [sectorAngle, engines.length]);
  
  /**
   * Handles drag start
   */
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    if (isProcessing) return;
    
    const angle = getAngleFromCenter(clientX, clientY);
    dragStartAngleRef.current = angle;
    initialRotationRef.current = rotation;
    setIsDragging(true);
    setIsSnapping(false);
  }, [isProcessing, rotation, getAngleFromCenter]);
  
  /**
   * Handles drag move
   */
  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;
    
    const currentAngle = getAngleFromCenter(clientX, clientY);
    const deltaAngle = currentAngle - dragStartAngleRef.current;
    
    // Handle wrap-around
    let adjustedDelta = deltaAngle;
    if (deltaAngle > 180) adjustedDelta -= 360;
    if (deltaAngle < -180) adjustedDelta += 360;
    
    setRotation(initialRotationRef.current + adjustedDelta);
  }, [isDragging, getAngleFromCenter]);
  
  /**
   * Handles drag end
   */
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    setIsSnapping(true);
    
    const { rotation: targetRotation, index } = snapToSector(rotation);
    
    // Animate to target
    setRotation(targetRotation);
    
    // Select engine after snap animation
    setTimeout(() => {
      if (engines[index]) {
        onEngineSelect(engines[index].id);
      }
      setIsSnapping(false);
    }, 300);
  }, [isDragging, rotation, snapToSector, engines, onEngineSelect]);
  
  /**
   * Handles keyboard navigation
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isProcessing) return;
    
    let newIndex = currentIndex;
    
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      newIndex = (currentIndex - 1 + engines.length) % engines.length;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      newIndex = (currentIndex + 1) % engines.length;
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (canProcess) {
        onProcess();
      }
      return;
    } else {
      return;
    }
    
    e.preventDefault();
    
    if (engines[newIndex]) {
      const targetRotation = newIndex * sectorAngle;
      setRotation(targetRotation);
      onEngineSelect(engines[newIndex].id);
    }
  }, [isProcessing, currentIndex, engines, sectorAngle, canProcess, onProcess, onEngineSelect]);
  
  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  }, [handleDragStart]);
  
  // Touch events
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [handleDragStart]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [handleDragMove]);
  
  // Global mouse events
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };
    
    const handleMouseUp = () => {
      handleDragEnd();
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);
  
  // Global touch events
  useEffect(() => {
    if (!isDragging) return;
    
    const handleTouchEnd = () => {
      handleDragEnd();
    };
    
    window.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleDragEnd]);
  
  // Update rotation when engine changes externally
  useEffect(() => {
    if (!isDragging && currentEngine) {
      const index = engines.findIndex(e => e.id === currentEngine.id);
      if (index >= 0) {
        setRotation(index * sectorAngle);
      }
    }
  }, [currentEngine, engines, sectorAngle, isDragging]);
  
  // Generate conic gradient for dial
  const dialGradient = useMemo(() => {
    if (engines.length === 0) {
      return 'conic-gradient(from 0deg, #1a1a1a 0deg, #2d2d2d 180deg, #1a1a1a 360deg)';
    }
    
    const stops: string[] = [];
    engines.forEach((engine, i) => {
      const startAngle = i * sectorAngle;
      const endAngle = (i + 1) * sectorAngle;
      const color = ENGINE_COLORS[i % ENGINE_COLORS.length];
      
      // Create metallic gradient effect
      stops.push(`${color}15 ${startAngle}deg`);
      stops.push(`${color}30 ${startAngle + sectorAngle * 0.3}deg`);
      stops.push(`${color}15 ${endAngle}deg`);
    });
    
    return `conic-gradient(from 0deg, ${stops.join(', ')})`;
  }, [engines, sectorAngle]);
  
  return (
    <div className={styles.dialContainer}>
      {/* Mode toggle switch */}
      <div className={styles.modeSwitch}>
        <button
          className={`${styles.modeOption} ${mode === 'encode' ? styles.active : ''}`}
          onClick={onModeToggle}
          disabled={isProcessing}
        >
          ENCODE
        </button>
        <div 
          className={styles.modeSlider}
          style={{ transform: `translateX(${mode === 'decode' ? '100%' : '0'})` }}
        />
        <button
          className={`${styles.modeOption} ${mode === 'decode' ? styles.active : ''}`}
          onClick={onModeToggle}
          disabled={isProcessing}
        >
          DECODE
        </button>
      </div>
      
      {/* Rotary dial */}
      <div
        ref={dialRef}
        className={`${styles.dial} ${styles[size]} ${isDragging ? styles.dragging : ''} ${isSnapping ? styles.snapping : ''}`}
        style={{
          transform: `rotate(${rotation}deg)`,
          background: dialGradient,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="listbox"
        aria-label="Engine selector dial"
        aria-activedescendant={currentEngine ? `engine-${currentEngine.id}` : undefined}
      >
        {/* Engine labels */}
        {engines.map((engine, i) => {
          const angle = i * sectorAngle + sectorAngle / 2 - 90;
          const isSelected = currentEngine?.id === engine.id;
          const color = ENGINE_COLORS[i % ENGINE_COLORS.length];
          
          return (
            <div
              key={engine.id}
              className={`${styles.engineLabel} ${isSelected ? styles.active : ''}`}
              style={{
                transform: `rotate(${angle}deg) translateY(-${size === 'compact' ? 70 : 100}px) rotate(${-angle}deg)`,
                color: isSelected ? color : '#e4e4e7',
              }}
            >
              {engine.name.toUpperCase()}
            </div>
          );
        })}
        
        {/* Center button */}
        <div className={styles.centerButton}>
          <div className={styles.centerInner}>
            <span className={styles.engineName}>
              {currentEngine?.name.toUpperCase() || 'SELECT'}
            </span>
            {state === 'loading' && (
              <span className={styles.loadingText}>Loading...</span>
            )}
            {state === 'processing' && (
              <span className={styles.processingText}>
                {Math.round(progress * 100)}%
              </span>
            )}
            {state === 'complete' && (
              <span className={styles.completeText}>Done</span>
            )}
            {state === 'error' && (
              <span className={styles.errorText}>Error</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Action buttons */}
      <div className={styles.actionButtons}>
        {/* CALL button */}
        <button
          className={`${styles.callBtn} ${isProcessing ? styles.hidden : ''}`}
          onClick={onProcess}
          disabled={!canProcess}
          title="Start processing"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
          </svg>
          <span>CALL</span>
        </button>
        
        {/* HANG UP button */}
        <button
          className={`${styles.hangupBtn} ${!isProcessing ? styles.hidden : ''}`}
          onClick={onHangUp}
          title="Stop processing"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-3.33-2.67m-2.67-3.34a19.79 19.79 0 01-3.07-8.63A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          <span>HANG UP</span>
        </button>
      </div>
    </div>
  );
}

export default Dial;
