/**
 * Processing Progress Component
 * 
 * Shows progress bar with estimated time remaining.
 */

'use client';

import { formatDuration } from '@/lib/utils';
import styles from './Progress.module.css';

export interface ProcessingProgressProps {
  /** Progress value (0-1) */
  progress: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining: number | null;
  /** Whether processing is active */
  isActive: boolean;
}

/**
 * Processing Progress Component
 */
export function ProcessingProgress({
  progress,
  estimatedTimeRemaining,
  isActive,
}: ProcessingProgressProps) {
  if (!isActive) return null;
  
  const percentage = Math.round(progress * 100);
  
  return (
    <div className={styles.container}>
      <div className={styles.bar}>
        <div
          className={styles.fill}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className={styles.info}>
        <span className={styles.percentage}>{percentage}%</span>
        {estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
          <span className={styles.eta}>
            ~{formatDuration(estimatedTimeRemaining)} remaining
          </span>
        )}
      </div>
    </div>
  );
}

export default ProcessingProgress;
