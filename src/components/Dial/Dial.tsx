/**
 * Dial Component
 * 
 * The central interaction element of StarBrickVII.
 * A round dial interface with capability indicators on the outer ring
 * and main operations in the center.
 */

'use client';

import { useMemo } from 'react';
import { type EngineInfo } from '@/lib/engine/types';
import { CAPABILITY_LABELS, CAPABILITY_ABBREVIATIONS } from '@/lib/engine/protocol';
import { useReducedMotion } from '@/hooks/useResponsive';
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

interface CapabilitySegment {
  key: keyof typeof CAPABILITY_LABELS;
  label: string;
  abbreviation: string;
  active: boolean;
  angle: number;
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
  const prefersReducedMotion = useReducedMotion();
  
  // Calculate capability segments for the outer ring
  const capabilities = useMemo<CapabilitySegment[]>(() => {
    if (!engine) return [];
    
    const caps = engine.capabilities;
    return [
      {
        key: 'binarySafe',
        label: CAPABILITY_LABELS.binarySafe,
        abbreviation: CAPABILITY_ABBREVIATIONS.binarySafe,
        active: caps.binarySafe,
        angle: -90, // Top
      },
      {
        key: 'selfInverse',
        label: CAPABILITY_LABELS.selfInverse,
        abbreviation: CAPABILITY_ABBREVIATIONS.selfInverse,
        active: caps.selfInverse,
        angle: 0, // Right
      },
      {
        key: 'reversible',
        label: CAPABILITY_LABELS.reversible,
        abbreviation: CAPABILITY_ABBREVIATIONS.reversible,
        active: caps.reversible,
        angle: 90, // Bottom
      },
      {
        key: 'stateful',
        label: CAPABILITY_LABELS.stateful,
        abbreviation: CAPABILITY_ABBREVIATIONS.stateful,
        active: caps.stateful,
        angle: 180, // Left
      },
    ];
  }, [engine]);
  
  // Calculate progress arc path
  const progressArc = useMemo(() => {
    if (progress <= 0) return '';
    
    const radius = 45;
    const startAngle = -90;
    const endAngle = startAngle + (progress * 360);
    
    const startX = 50 + radius * Math.cos((startAngle * Math.PI) / 180);
    const startY = 50 + radius * Math.sin((startAngle * Math.PI) / 180);
    const endX = 50 + radius * Math.cos((endAngle * Math.PI) / 180);
    const endY = 50 + radius * Math.sin((endAngle * Math.PI) / 180);
    
    const largeArc = progress > 0.5 ? 1 : 0;
    
    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`;
  }, [progress]);
  
  const sizeClass = styles[size];
  const stateClass = styles[state];
  
  return (
    <div className={`${styles.dial} ${sizeClass} ${stateClass}`}>
      {/* Outer ring with capability indicators */}
      <div className={styles.outerRing}>
        <svg
          viewBox="0 0 100 100"
          className={styles.ringSvg}
          aria-hidden="true"
        >
          {/* Base ring */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="2"
          />
          
          {/* Progress arc */}
          {progress > 0 && (
            <path
              d={progressArc}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeLinecap="round"
              className={prefersReducedMotion ? '' : styles.progressPath}
            />
          )}
          
          {/* Capability markers */}
          {capabilities.map((cap) => (
            <g key={cap.key}>
              <circle
                cx={50 + 42 * Math.cos((cap.angle * Math.PI) / 180)}
                cy={50 + 42 * Math.sin((cap.angle * Math.PI) / 180)}
                r="6"
                fill={cap.active ? 'var(--color-success)' : 'var(--color-border)'}
                className={cap.active ? styles.capabilityActive : ''}
              />
              <text
                x={50 + 42 * Math.cos((cap.angle * Math.PI) / 180)}
                y={50 + 42 * Math.sin((cap.angle * Math.PI) / 180)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="6"
                fontWeight="600"
                fill={cap.active ? 'var(--color-bg)' : 'var(--color-fg-muted)'}
              >
                {cap.abbreviation}
              </text>
            </g>
          ))}
        </svg>
      </div>
      
      {/* Inner dial - main interaction area */}
      <div className={styles.innerDial}>
        {/* Engine name display */}
        <div className={styles.engineName}>
          {engine ? engine.name : 'Select Engine'}
        </div>
        
        {/* Mode indicator */}
        <button
          className={styles.modeButton}
          onClick={onModeToggle}
          disabled={!engine || state === 'processing'}
          aria-label={`Current mode: ${mode}. Click to toggle.`}
        >
          <span className={styles.modeLabel}>{mode.toUpperCase()}</span>
        </button>
        
        {/* Action buttons */}
        <div className={styles.actionButtons}>
          <button
            className={`${styles.actionBtn} ${mode === 'encode' ? styles.active : ''}`}
            onClick={onEncode}
            disabled={!engine || state === 'processing'}
            aria-label="Encode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            className={`${styles.actionBtn} ${mode === 'decode' ? styles.active : ''}`}
            onClick={onDecode}
            disabled={!engine || state === 'processing' || !engine?.capabilities.reversible}
            aria-label="Decode"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
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

export default Dial;
