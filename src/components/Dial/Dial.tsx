/**
 * Dial Component
 * 
 * A vintage telephone-style rotary dial with modern tech aesthetics.
 * Features drag-to-rotate selection with snap-to-engine behavior.
 */

'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { type EngineInfo } from '@/lib/engine/types';
import styles from './Dial.module.css';

export interface DialProps {
  /** Currently selected engine info */
  engine: EngineInfo | null;
  /** Current processing mode */
  mode: 'encode' | 'decode';
  /** Processing state */
  state: 'idle' | 'loading' | 'processing' | 'complete' | 'error';
  /** Progress value (0-1) */
  progress?: number;
  /** Click handler for mode toggle */
  onModeToggle?: () => void;
  /** Click handler for encode action */
  onEncode?: () => void;
  /** Click handler for decode action */
  onDecode?: () => void;
  /** Size variant */
  size?: 'compact' | 'normal' | 'large';
}

// Preset engines for the dial
const DIAL_ENGINES = [
  { id: 'base64', name: 'Base64', color: '#f97316' },
  { id: 'hex', name: 'Hex', color: '#22c55e' },
  { id: 'binary', name: 'Binary', color: '#3b82f6' },
];

/**
 * Converts angle to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees
 */
function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Normalizes angle to 0-360 range
 */
function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

/**
 * Dial Component
 */
export function Dial({
  engine,
  mode,
  state,
  progress = 0,
  onModeToggle,
  onEncode,
  onDecode,
  size = 'normal',
}: DialProps) {
  // State
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Refs
  const dialRef = useRef<HTMLDivElement>(null);
  const dragStartAngle = useRef<number>(0);
  const initialRotation = useRef<number>(0);
  
  // Calculate sector angle
  const sectorAngle = 360 / DIAL_ENGINES.length;
  
  /**
   * Calculates angle from center of dial to mouse position
   */
  const calculateAngle = useCallback((clientX: number, clientY: number): number => {
    if (!dialRef.current) return 0;
    
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    
    // Calculate angle in degrees (0 = top, clockwise)
    let angle = Math.atan2(deltaX, -deltaY);
    angle = toDegrees(angle);
    
    return normalizeAngle(angle);
  }, []);
  
  /**
   * Handles pointer down - start dragging
   */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (state === 'processing') return;
    
    e.preventDefault();
    setIsDragging(true);
    
    const angle = calculateAngle(e.clientX, e.clientY);
    dragStartAngle.current = angle;
    initialRotation.current = rotation;
    
    // Capture pointer
    if (dialRef.current) {
      dialRef.current.setPointerCapture(e.pointerId);
    }
  }, [state, rotation, calculateAngle]);
  
  /**
   * Handles pointer move - rotate dial
   */
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const currentAngle = calculateAngle(e.clientX, e.clientY);
    const deltaAngle = currentAngle - dragStartAngle.current;
    
    // Apply rotation
    const newRotation = normalizeAngle(initialRotation.current + deltaAngle);
    setRotation(newRotation);
  }, [isDragging, calculateAngle]);
  
  /**
   * Handles pointer up - snap to nearest sector
   */
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    setIsDragging(false);
    
    // Release pointer capture
    if (dialRef.current) {
      dialRef.current.releasePointerCapture(e.pointerId);
    }
    
    // Snap to nearest sector
    const snappedIndex = Math.round(rotation / sectorAngle) % DIAL_ENGINES.length;
    const snappedRotation = snappedIndex * sectorAngle;
    
    setRotation(snappedRotation);
    setSelectedIndex(snappedIndex);
  }, [isDragging, rotation, sectorAngle]);
  
  /**
   * Handles keyboard navigation
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (state === 'processing') return;
    
    let newIndex = selectedIndex;
    
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      newIndex = (selectedIndex - 1 + DIAL_ENGINES.length) % DIAL_ENGINES.length;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      newIndex = (selectedIndex + 1) % DIAL_ENGINES.length;
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Trigger action
      if (mode === 'encode' && onEncode) onEncode();
      else if (mode === 'decode' && onDecode) onDecode();
      return;
    } else {
      return;
    }
    
    e.preventDefault();
    setSelectedIndex(newIndex);
    setRotation(newIndex * sectorAngle);
  }, [state, selectedIndex, sectorAngle, mode, onEncode, onDecode]);
  
  // Get current engine info
  const currentEngineInfo = DIAL_ENGINES[selectedIndex];
  
  // Generate sector elements
  const sectors = useMemo(() => {
    return DIAL_ENGINES.map((eng, index) => {
      const startAngle = index * sectorAngle - sectorAngle / 2;
      const endAngle = startAngle + sectorAngle;
      const isSelected = index === selectedIndex;
      
      // Calculate label position
      const labelAngle = index * sectorAngle;
      const labelRadius = 42; // percentage from center
      const labelX = 50 + labelRadius * Math.sin(toRadians(labelAngle));
      const labelY = 50 - labelRadius * Math.cos(toRadians(labelAngle));
      
      return {
        ...eng,
        index,
        startAngle,
        endAngle,
        isSelected,
        labelX,
        labelY,
      };
    });
  }, [sectorAngle, selectedIndex]);
  
  return (
    <div
      ref={dialRef}
      className={`${styles.dial} ${styles[size]} ${isDragging ? styles.dragging : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="slider"
      aria-label="Engine selector dial"
      aria-valuenow={selectedIndex}
      aria-valuemin={0}
      aria-valuemax={DIAL_ENGINES.length - 1}
    >
      {/* Outer ring with conic gradient */}
      <div className={styles.outerRing}>
        {/* Sector indicators */}
        <svg className={styles.sectorSvg} viewBox="0 0 100 100">
          {sectors.map((sector) => (
            <g key={sector.id}>
              {/* Sector arc */}
              <path
                className={`${styles.sectorArc} ${sector.isSelected ? styles.selected : ''}`}
                d={describeArc(50, 50, 45, sector.startAngle, sector.endAngle)}
                fill="none"
                stroke={sector.color}
                strokeWidth="8"
                opacity={sector.isSelected ? 1 : 0.3}
              />
            </g>
          ))}
        </svg>
        
        {/* Engine labels around the dial */}
        {sectors.map((sector) => (
          <div
            key={sector.id}
            className={`${styles.engineLabel} ${sector.isSelected ? styles.active : ''}`}
            style={{
              left: `${sector.labelX}%`,
              top: `${sector.labelY}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {sector.name}
          </div>
        ))}
      </div>
      
      {/* Inner rotating disc */}
      <div
        className={styles.innerDisc}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {/* Finger stop indicator */}
        <div className={styles.fingerStop} />
      </div>
      
      {/* Center display */}
      <div className={styles.center}>
        {/* Engine name */}
        <div className={styles.engineName}>
          {engine?.name || currentEngineInfo.name}
        </div>
        
        {/* Mode indicator */}
        <button
          className={styles.modeBtn}
          onClick={onModeToggle}
          disabled={state === 'processing'}
          aria-label={`Switch to ${mode === 'encode' ? 'decode' : 'encode'} mode`}
        >
          {mode.toUpperCase()}
        </button>
        
        {/* Action buttons */}
        <div className={styles.actionButtons}>
          <button
            className={styles.actionBtn}
            onClick={mode === 'encode' ? onEncode : onDecode}
            disabled={state === 'processing' || state === 'loading'}
            aria-label={mode === 'encode' ? 'Encode' : 'Decode'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mode === 'encode' ? (
                <path d="M12 5v14M5 12h14" />
              ) : (
                <path d="M5 12h14M12 5l7 7-7 7" />
              )}
            </svg>
          </button>
        </div>
        
        {/* State indicator */}
        {state !== 'idle' && (
          <div className={styles.stateIndicator}>
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
        )}
      </div>
    </div>
  );
}

/**
 * Describes an SVG arc path
 */
function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
  ].join(' ');
}

/**
 * Converts polar to cartesian coordinates
 */
function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = toRadians(angleInDegrees - 90);
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export default Dial;
